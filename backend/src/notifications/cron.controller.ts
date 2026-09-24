import { Controller, Get, Headers, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Public } from '../auth/decorators/public.decorator.js';
import { DueRemindersService } from './due-reminders.service.js';

/**
 * Scheduled work, called by Vercel Cron where no process can keep a timer.
 *
 * Public to the session guard — the caller is Vercel, not a user — and closed
 * by CRON_SECRET instead, which Vercel sends as a bearer token. Without the
 * secret configured the endpoint refuses everyone.
 */
@Controller('cron')
export class CronController {
  private readonly secret: string | undefined;

  constructor(
    private readonly dueReminders: DueRemindersService,
    config: ConfigService,
  ) {
    this.secret = config.get<string>('app.cronSecret');
  }

  @Public()
  @Get('due-reminders')
  async runDueReminders(@Headers('authorization') authorization: string | undefined) {
    if (!isCronCaller(authorization, this.secret)) throw new UnauthorizedException();
    return { written: await this.dueReminders.run(new Date()) };
  }
}

/** Constant-time, and length-blind: both sides are hashed before comparing. */
export function isCronCaller(authorization: string | undefined, secret: string | undefined): boolean {
  if (!authorization || !secret) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`));
}
