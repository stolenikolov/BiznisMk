import { describe, expect, it, vi } from 'vitest';
import { DueRemindersService } from './due-reminders.service.js';
import { NotificationType } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { NotificationsService } from './notifications.service.js';
import type { NewNotification } from './notification.types.js';

/** A company that pays on the day the test calls "today", with staff to pay. */
function stubPrisma(paydayDayOfMonth: number | null) {
  return {
    invoice: { findMany: vi.fn().mockResolvedValue([]) },
    creditLine: { findMany: vi.fn().mockResolvedValue([]) },
    company: {
      findMany: vi.fn().mockResolvedValue(
        paydayDayOfMonth === null ? [] : [{ id: 'co-1', paydayDayOfMonth }],
      ),
    },
  } as unknown as PrismaService;
}

function stubNotifications(written: NewNotification[]) {
  return {
    createMany: vi.fn().mockImplementation((inputs: readonly NewNotification[]) => {
      written.push(...inputs);
      return Promise.resolve(inputs);
    }),
  } as unknown as NotificationsService;
}

describe('DueRemindersService', () => {
  // The reason the sweep does not live on the cron alone: a process that was
  // not running at 07:00 — a laptop, a restart, a deploy — would otherwise
  // skip the day, and a payday reminder is only useful on the day.
  it('sweeps on boot, so a day whose 07:00 was missed still gets its reminders', async () => {
    const written: NewNotification[] = [];
    const service = new DueRemindersService(
      stubPrisma(new Date().getDate()),
      stubNotifications(written),
    );

    await service.onApplicationBootstrap();

    expect(written.map((row) => row.type)).toEqual([NotificationType.EMPLOYEE_PAYDAY]);
    expect(written[0]?.metadata).toMatchObject({ daysAway: 0 });
  });

  it('starts the app even if the sweep fails', async () => {
    const prisma = {
      invoice: { findMany: vi.fn().mockRejectedValue(new Error('database is down')) },
      creditLine: { findMany: vi.fn() },
      company: { findMany: vi.fn() },
    } as unknown as PrismaService;

    await expect(
      new DueRemindersService(prisma, stubNotifications([])).onApplicationBootstrap(),
    ).resolves.toBeUndefined();
  });
});
