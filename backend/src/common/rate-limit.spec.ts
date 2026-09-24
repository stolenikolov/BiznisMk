import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimit, RateLimitGuard, resetRateLimits } from './rate-limit.js';

class CodesController {
  @RateLimit({ limit: 2, ttl: 60_000 })
  send() {}

  other() {}

  third() {}
}

function call(guard: RateLimitGuard, handler: keyof CodesController, ip = '10.0.0.1') {
  const headers: Record<string, unknown> = {};
  const context = {
    getHandler: () => CodesController.prototype[handler],
    getClass: () => CodesController,
    switchToHttp: () => ({
      getRequest: () => ({ ip, socket: {} }),
      getResponse: () => ({ setHeader: (name: string, value: unknown) => (headers[name] = value) }),
    }),
  } as unknown as ExecutionContext;
  try {
    return { allowed: guard.canActivate(context), headers };
  } catch (error) {
    return { allowed: false, status: (error as HttpException).getStatus(), headers };
  }
}

describe('RateLimitGuard', () => {
  const guard = new RateLimitGuard(new Reflector());

  beforeEach(() => {
    resetRateLimits();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('answers 429 with Retry-After once a visitor passes the route limit', () => {
    expect(call(guard, 'send').allowed).toBe(true);
    expect(call(guard, 'send').allowed).toBe(true);

    const third = call(guard, 'send');
    expect(third).toMatchObject({ allowed: false, status: 429 });
    expect(third.headers['Retry-After']).toBe(60);
  });

  it('counts each visitor and each route on its own', () => {
    call(guard, 'send');
    call(guard, 'send');

    expect(call(guard, 'send', '10.0.0.2').allowed).toBe(true);
    expect(call(guard, 'other').allowed).toBe(true);
  });

  it('lets the visitor back in when the window ends', () => {
    call(guard, 'send');
    call(guard, 'send');
    vi.advanceTimersByTime(60_000);

    expect(call(guard, 'send').allowed).toBe(true);
  });

  it('gives routes without a limit of their own the 60 a minute fallback', () => {
    for (let i = 0; i < 60; i++) expect(call(guard, 'third').allowed).toBe(true);
    expect(call(guard, 'third').status).toBe(429);
  });
});
