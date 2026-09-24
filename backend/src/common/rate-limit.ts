import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';

/*
 * Rate limits for the routes that send or check codes. This stands in for
 * @nestjs/throttler, which is still CommonJS and require()s the ESM-only
 * @nestjs/common — something Vercel's function runtime refuses to load.
 *
 * Counts live in memory, per process: on Vercel that means per warm instance,
 * the same as the throttler's default storage was.
 */

export interface RateLimitOptions {
  /** Requests allowed per window, per visitor. */
  limit: number;
  /** Window length in milliseconds. */
  ttl: number;
}

const RATE_LIMIT_KEY = 'rateLimit';

/** For routes of a guarded controller that set no limit of their own. */
const FALLBACK: RateLimitOptions = { limit: 60, ttl: 60_000 };

/** The limit for a route, or for every route of a controller. Needs RateLimitGuard. */
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);

interface Window {
  count: number;
  resetsAt: number;
}

const windows = new Map<string, Window>();

/** Forgets every count. For tests. */
export function resetRateLimits(): void {
  windows.clear();
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const handler = context.getHandler();
    const controller = context.getClass();
    const { limit, ttl } =
      this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [handler, controller]) ?? FALLBACK;

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    // serverless.ts trusts one proxy hop, so req.ip is the visitor on Vercel too.
    const key = `${req.ip ?? req.socket.remoteAddress ?? 'unknown'}|${controller.name}.${handler.name}`;
    const now = Date.now();

    let window = windows.get(key);
    if (!window || window.resetsAt <= now) {
      if (windows.size > 10_000) prune(now);
      window = { count: 0, resetsAt: now + ttl };
      windows.set(key, window);
    }

    window.count += 1;
    if (window.count > limit) {
      http.getResponse<Response>().setHeader('Retry-After', Math.ceil((window.resetsAt - now) / 1000));
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}

function prune(now: number): void {
  for (const [key, window] of windows) {
    if (window.resetsAt <= now) windows.delete(key);
  }
}
