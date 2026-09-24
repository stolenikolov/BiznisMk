import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { CronController, isCronCaller } from './cron.controller.js';
import type { DueRemindersService } from './due-reminders.service.js';

const SECRET = 'a-cron-secret-of-at-least-32-chars';

function build(secret: string | undefined) {
  const dueReminders = { run: vi.fn().mockResolvedValue(3) };
  const config = { get: () => secret } as unknown as ConfigService;
  return { controller: new CronController(dueReminders as unknown as DueRemindersService, config), dueReminders };
}

describe('isCronCaller', () => {
  it('accepts exactly the bearer token Vercel sends', () => {
    expect(isCronCaller(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it.each([
    ['no header', undefined],
    ['a wrong secret', 'Bearer something-else'],
    ['the secret without the Bearer prefix', SECRET],
  ])('refuses %s', (_label, header) => {
    expect(isCronCaller(header, SECRET)).toBe(false);
  });

  it('refuses everyone while no secret is configured', () => {
    expect(isCronCaller('Bearer ', undefined)).toBe(false);
    expect(isCronCaller('Bearer undefined', undefined)).toBe(false);
  });
});

describe('CronController', () => {
  it('runs the sweep for Vercel Cron and says how many reminders it wrote', async () => {
    const { controller, dueReminders } = build(SECRET);

    await expect(controller.runDueReminders(`Bearer ${SECRET}`)).resolves.toEqual({ written: 3 });
    expect(dueReminders.run).toHaveBeenCalledTimes(1);
  });

  it('runs nothing for anyone else', async () => {
    const { controller, dueReminders } = build(SECRET);

    await expect(controller.runDueReminders('Bearer guess')).rejects.toMatchObject({ status: 401 });
    expect(dueReminders.run).not.toHaveBeenCalled();
  });
});
