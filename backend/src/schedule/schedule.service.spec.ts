import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { parseWeekStart, ScheduleService } from './schedule.service.js';
import { toDateColumn, toTimeColumn } from './schedule-calendar.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import type { MailMessage, MailService } from '../mail/mail.service.js';

const COMPANY = 'company-1';
/** Thursday 17 September 2026, local time. */
const NOW = new Date(2026, 8, 17, 10, 0);

const template = (id: string, label: string, start: string, end: string) => ({
  id,
  companyId: COMPANY,
  label,
  startTime: toTimeColumn(start),
  endTime: toTimeColumn(end),
  createdAt: new Date(),
  updatedAt: new Date(),
});

const entry = (
  employeeId: string,
  date: string,
  shiftTemplateId: string | null,
  dayOff = false,
  leave: 'ON_LEAVE' | 'SICK_LEAVE' | null = null,
) => ({
  id: `${employeeId}-${date}`,
  companyId: COMPANY,
  employeeId,
  date: toDateColumn(date),
  shiftTemplateId,
  dayOff,
  leave,
  createdAt: new Date(),
  updatedAt: new Date(),
});

/** The filters the service puts on schedule_entries, applied the way the database would. */
interface EntryWhere {
  date?: { gte: Date; lte: Date };
  OR?: unknown[];
  leave?: { not: null };
}

function matchesEntry(row: ReturnType<typeof entry>, where: EntryWhere = {}): boolean {
  return (
    (!where.date || (row.date >= where.date.gte && row.date <= where.date.lte)) &&
    (!where.OR || row.shiftTemplateId !== null || row.dayOff) &&
    (!where.leave || row.leave !== null)
  );
}

interface Setup {
  employees?: { id: string; status: string; userId?: string | null; firstName?: string; lastName?: string }[];
  templates?: ReturnType<typeof template>[];
  entries?: ReturnType<typeof entry>[];
  week?: { lockedAt: Date | null; publishedAt?: Date | null; publishedSnapshot?: unknown } | null;
  company?: { emailSenderName?: string | null; emailReplyTo?: string | null };
}

function serviceWith(setup: Setup = {}) {
  const employees = (setup.employees ?? [{ id: 'ana', status: 'ACTIVE' }]).map((employee) => ({
    firstName: 'Ана',
    lastName: 'Петровска',
    photoUrl: null,
    role: 'EMPLOYEE',
    userId: null,
    email: `${employee.id}@firma.mk`,
    ...employee,
  }));
  const templates = setup.templates ?? [template('t-first', 'Прва смена', '07:00', '15:00')];

  const prisma = {
    company: {
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({ name: 'Пекара Здравје', emailSenderName: null, emailReplyTo: null, ...setup.company }),
    },
    employee: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; companyId: string } }) =>
        where.companyId === COMPANY ? (employees.find((e) => e.id === where.id) ?? null) : null,
      ),
      findMany: vi.fn().mockResolvedValue(employees),
    },
    shiftTemplate: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; companyId: string } }) =>
        where.companyId === COMPANY ? (templates.find((t) => t.id === where.id) ?? null) : null,
      ),
      findMany: vi.fn().mockResolvedValue(templates),
      create: vi.fn(async ({ data }) => ({ id: 'new', createdAt: new Date(), updatedAt: new Date(), ...data })),
      update: vi.fn(async ({ data }) => ({ ...templates[0]!, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) })),
      delete: vi.fn(async () => templates[0]),
    },
    scheduleEntry: {
      findMany: vi.fn(async ({ where, include }: { where?: EntryWhere; include?: unknown }) =>
        (setup.entries ?? []).filter((row) => matchesEntry(row, where)).map((row) => ({
          ...row,
          ...(include ? { employee: { status: employees.find((e) => e.id === row.employeeId)!.status } } : {}),
        })),
      ),
      count: vi.fn(async () => 3),
      upsert: vi.fn(async ({ create }) => ({ id: 'e', createdAt: new Date(), updatedAt: new Date(), ...create })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    scheduleWeek: {
      findUnique: vi.fn().mockResolvedValue(setup.week ?? null),
      upsert: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
  };

  const notifications = { createMany: vi.fn(async () => []) };
  const sentMail: MailMessage[] = [];
  // The real batching, with a transport that records instead of sending.
  const mail = {
    mode: 'smtp' as const,
    sendAll: vi.fn(async <T>(items: readonly T[], compose: (item: T) => MailMessage) => {
      const messages = items.map(compose);
      sentMail.push(...messages);
      return { mode: 'smtp' as const, sent: [...items], failed: [] as T[] };
    }),
  };
  const service = new ScheduleService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
    mail as unknown as MailService,
  );
  return { service, prisma, notifications, mail, sentMail };
}

async function errorOf(promise: Promise<unknown>) {
  return promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (error: unknown) => error,
  );
}

describe('ScheduleService.setEntry', () => {
  it('assigns a shift with one upsert per employee and day', async () => {
    const { service, prisma } = serviceWith();

    const result = await service.setEntry(
      COMPANY,
      { employeeId: 'ana', date: '2026-09-18', shiftTemplateId: 't-first' },
      NOW,
    );

    expect(result).toEqual({
      employeeId: 'ana',
      date: '2026-09-18',
      shiftTemplateId: 't-first',
      dayOff: false,
      leave: null,
    });
    expect(prisma.scheduleEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { employeeId_date: { employeeId: 'ana', date: toDateColumn('2026-09-18') } },
      }),
    );
  });

  it('reads another company’s template as not found', async () => {
    const { service, prisma } = serviceWith();

    const error = await errorOf(
      service.setEntry(COMPANY, { employeeId: 'ana', date: '2026-09-18', shiftTemplateId: 't-elsewhere' }, NOW),
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect(prisma.shiftTemplate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 't-elsewhere', companyId: COMPANY } }),
    );
    expect(prisma.scheduleEntry.upsert).not.toHaveBeenCalled();
  });

  it('refuses a shift on a day the employee is away', async () => {
    const { service, prisma } = serviceWith({ employees: [{ id: 'ana', status: 'SICK_LEAVE' }] });

    const error = await errorOf(
      service.setEntry(COMPANY, { employeeId: 'ana', date: '2026-09-18', shiftTemplateId: 't-first' }, NOW),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      errorCode: 'EMPLOYEE_ON_LEAVE',
      leave: 'SICK_LEAVE',
    });
    expect(prisma.scheduleEntry.upsert).not.toHaveBeenCalled();
  });

  it('refuses any change to a published, locked week', async () => {
    const { service } = serviceWith({ week: { lockedAt: new Date() } });

    const error = await errorOf(
      service.setEntry(COMPANY, { employeeId: 'ana', date: '2026-09-18', shiftTemplateId: null }, NOW),
    );

    expect((error as ConflictException).getResponse()).toMatchObject({ errorCode: 'SCHEDULE_LOCKED' });
  });

  it('clears a day with null, scoped to the company', async () => {
    const { service, prisma } = serviceWith();

    expect(
      await service.setEntry(COMPANY, { employeeId: 'ana', date: '2026-09-18', shiftTemplateId: null }, NOW),
    ).toBeNull();
    expect(prisma.scheduleEntry.deleteMany).toHaveBeenCalledWith({
      where: { companyId: COMPANY, employeeId: 'ana', date: toDateColumn('2026-09-18') },
    });
  });

  it('marks a day off without looking up any template', async () => {
    const { service, prisma } = serviceWith();

    const result = await service.setEntry(
      COMPANY,
      { employeeId: 'ana', date: '2026-09-18', shiftTemplateId: null, dayOff: true },
      NOW,
    );

    expect(result).toEqual({ employeeId: 'ana', date: '2026-09-18', shiftTemplateId: null, dayOff: true, leave: null });
    expect(prisma.shiftTemplate.findFirst).not.toHaveBeenCalled();
    expect(prisma.scheduleEntry.deleteMany).not.toHaveBeenCalled();
    expect(prisma.scheduleEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { shiftTemplateId: null, dayOff: true, leave: null } }),
    );
  });

  it('turns a day off or a day of leave back into a shift by clearing both', async () => {
    const { service, prisma } = serviceWith();

    await service.setEntry(COMPANY, { employeeId: 'ana', date: '2026-09-18', shiftTemplateId: 't-first' }, NOW);

    expect(prisma.scheduleEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { shiftTemplateId: 't-first', dayOff: false, leave: null } }),
    );
  });

  it('marks a day of sick leave on its own, with no shift and no day off', async () => {
    const { service, prisma } = serviceWith();

    const result = await service.setEntry(
      COMPANY,
      { employeeId: 'ana', date: '2026-09-18', shiftTemplateId: null, leave: 'SICK_LEAVE' },
      NOW,
    );

    expect(result).toMatchObject({ shiftTemplateId: null, dayOff: false, leave: 'SICK_LEAVE' });
    expect(prisma.shiftTemplate.findFirst).not.toHaveBeenCalled();
    expect(prisma.scheduleEntry.deleteMany).not.toHaveBeenCalled();
    expect(prisma.scheduleEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { shiftTemplateId: null, dayOff: false, leave: 'SICK_LEAVE' } }),
    );
  });

  it.each([
    ['a shift', { shiftTemplateId: 't-first', leave: 'ON_LEAVE' as const }],
    ['a day off', { shiftTemplateId: null, dayOff: true, leave: 'ON_LEAVE' as const }],
  ])('refuses a day of leave that is also %s', async (_, body) => {
    const { service, prisma } = serviceWith();

    await expect(
      service.setEntry(COMPANY, { employeeId: 'ana', date: '2026-09-18', ...body }, NOW),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.scheduleEntry.upsert).not.toHaveBeenCalled();
  });

  it('refuses planned leave on a day the employee’s status already has them away', async () => {
    const { service, prisma } = serviceWith({ employees: [{ id: 'ana', status: 'SICK_LEAVE' }] });

    const error = await errorOf(
      service.setEntry(COMPANY, { employeeId: 'ana', date: '2026-09-18', shiftTemplateId: null, leave: 'ON_LEAVE' }, NOW),
    );

    expect((error as ConflictException).getResponse()).toMatchObject({ errorCode: 'EMPLOYEE_ON_LEAVE' });
    expect(prisma.scheduleEntry.upsert).not.toHaveBeenCalled();
  });

  it('refuses a day off that also names a shift', async () => {
    const { service, prisma } = serviceWith();

    await expect(
      service.setEntry(COMPANY, { employeeId: 'ana', date: '2026-09-18', shiftTemplateId: 't-first', dayOff: true }, NOW),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.scheduleEntry.upsert).not.toHaveBeenCalled();
  });

  it('refuses a day off on a day the employee is already away', async () => {
    const { service, prisma } = serviceWith({ employees: [{ id: 'ana', status: 'ON_LEAVE' }] });

    const error = await errorOf(
      service.setEntry(COMPANY, { employeeId: 'ana', date: '2026-09-18', shiftTemplateId: null, dayOff: true }, NOW),
    );

    expect((error as ConflictException).getResponse()).toMatchObject({ errorCode: 'EMPLOYEE_ON_LEAVE' });
    expect(prisma.scheduleEntry.upsert).not.toHaveBeenCalled();
  });

  it('reads another company’s employee as not found', async () => {
    const { service } = serviceWith();

    await expect(
      service.setEntry(COMPANY, { employeeId: 'stranger', date: '2026-09-18', shiftTemplateId: 't-first' }, NOW),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a date that does not exist', async () => {
    const { service } = serviceWith();

    await expect(
      service.setEntry(COMPANY, { employeeId: 'ana', date: '2026-02-30', shiftTemplateId: 't-first' }, NOW),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ScheduleService — shift templates', () => {
  it('refuses a template whose edited times give it no length', async () => {
    const { service, prisma } = serviceWith();

    // Existing 07:00–15:00; moving only the end to 07:00 leaves nothing.
    await expect(service.updateTemplate(COMPANY, 't-first', { endTime: '07:00' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.shiftTemplate.update).not.toHaveBeenCalled();
  });

  it('reports a night shift’s duration across midnight', async () => {
    const { service } = serviceWith();

    const created = await service.createTemplate(COMPANY, { label: 'Ноќна', startTime: '22:00', endTime: '06:00' });

    expect(created).toMatchObject({ startTime: '22:00', endTime: '06:00', durationMinutes: 480 });
  });

  it('deletes a template and reports how many assignments it cleared, in one transaction', async () => {
    const { service, prisma } = serviceWith();

    expect(await service.removeTemplate(COMPANY, 't-first')).toEqual({ clearedEntries: 3 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.scheduleEntry.count).toHaveBeenCalledWith({ where: { shiftTemplateId: 't-first' } });
    expect(prisma.shiftTemplate.delete).toHaveBeenCalledWith({ where: { id: 't-first' } });
  });

  it('will not delete another company’s template', async () => {
    const { service, prisma } = serviceWith();

    await expect(service.removeTemplate(COMPANY, 't-elsewhere')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.shiftTemplate.delete).not.toHaveBeenCalled();
  });
});

describe('ScheduleService.getWeek', () => {
  it('marks leave days from today on, and totals only the hours actually worked', async () => {
    const { service } = serviceWith({
      employees: [
        { id: 'ana', status: 'ACTIVE' },
        { id: 'petar', status: 'ON_LEAVE' },
      ],
      entries: [
        entry('ana', '2026-09-17', 't-first'),
        entry('petar', '2026-09-16', 't-first'), // before the leave: worked
        entry('petar', '2026-09-18', 't-first'), // on leave: not worked
      ],
    });

    const week = await service.getWeek(COMPANY, '2026-09-14', NOW);

    expect(week.today).toBe('2026-09-17');
    expect(week.employees.find((e) => e.id === 'petar')!.leaveDays).toEqual({
      '2026-09-17': 'ON_LEAVE',
      '2026-09-18': 'ON_LEAVE',
      '2026-09-19': 'ON_LEAVE',
      '2026-09-20': 'ON_LEAVE',
    });
    expect(week.summary).toEqual({ scheduledMinutes: 2 * 480, onShiftToday: 1, onLeaveThisWeek: 1 });
    expect(week.employees.find((e) => e.id === 'petar')!.scheduledMinutes).toBe(480);
  });

  it('lists days off alongside shifts, and counts no hours for them', async () => {
    const { service } = serviceWith({
      entries: [
        entry('ana', '2026-09-17', 't-first'),
        entry('ana', '2026-09-18', null, true),
        entry('ana', '2026-09-19', null), // a template was deleted under it
      ],
    });

    const week = await service.getWeek(COMPANY, '2026-09-14', NOW);

    expect(week.entries).toEqual([
      { employeeId: 'ana', date: '2026-09-17', shiftTemplateId: 't-first', dayOff: false, leave: null },
      { employeeId: 'ana', date: '2026-09-18', shiftTemplateId: null, dayOff: true, leave: null },
    ]);
    expect(week.summary.scheduledMinutes).toBe(480);
  });

  it('lists planned leave with the entries — not locked — and counts the person as away, with no hours', async () => {
    const { service } = serviceWith({
      employees: [
        { id: 'ana', status: 'ACTIVE' },
        { id: 'marko', status: 'ACTIVE' },
      ],
      entries: [
        entry('ana', '2026-09-17', 't-first'),
        entry('ana', '2026-09-18', null, false, 'ON_LEAVE'),
        entry('marko', '2026-09-17', 't-first'),
      ],
    });

    const week = await service.getWeek(COMPANY, '2026-09-14', NOW);

    expect(week.entries).toContainEqual({
      employeeId: 'ana',
      date: '2026-09-18',
      shiftTemplateId: null,
      dayOff: false,
      leave: 'ON_LEAVE',
    });
    // Status leave is what locks a day; planned leave stays editable.
    expect(week.employees.find((e) => e.id === 'ana')!.leaveDays).toEqual({});
    expect(week.employees.find((e) => e.id === 'ana')!.scheduledMinutes).toBe(480);
    expect(week.summary).toEqual({ scheduledMinutes: 2 * 480, onShiftToday: 2, onLeaveThisWeek: 1 });
  });
});

describe('ScheduleService.copyPreviousWeek', () => {
  it('moves last week’s shifts forward seven days and skips days now on leave', async () => {
    const { service, prisma } = serviceWith({
      employees: [
        { id: 'ana', status: 'ACTIVE' },
        { id: 'petar', status: 'SICK_LEAVE' },
      ],
      // Last week, relative to the week of 21 September being filled.
      entries: [entry('ana', '2026-09-14', 't-first'), entry('petar', '2026-09-15', 't-first')],
    });

    expect(await service.copyPreviousWeek(COMPANY, '2026-09-21', NOW)).toEqual({ copied: 1, skippedOnLeave: 1 });
    expect(prisma.scheduleEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: { gte: toDateColumn('2026-09-14'), lte: toDateColumn('2026-09-20') },
        }),
      }),
    );
    expect(prisma.scheduleEntry.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.scheduleEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ employeeId: 'ana', date: toDateColumn('2026-09-21'), shiftTemplateId: 't-first' }),
      }),
    );
  });

  it('copies days off along with shifts', async () => {
    const { service, prisma } = serviceWith({ entries: [entry('ana', '2026-09-19', null, true)] });

    expect(await service.copyPreviousWeek(COMPANY, '2026-09-21', NOW)).toEqual({ copied: 1, skippedOnLeave: 0 });
    expect(prisma.scheduleEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ OR: [{ shiftTemplateId: { not: null } }, { dayOff: true }] }),
      }),
    );
    expect(prisma.scheduleEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ date: toDateColumn('2026-09-26'), shiftTemplateId: null, dayOff: true }),
      }),
    );
  });

  it('keeps leave planned this week, and does not carry last week’s leave forward', async () => {
    const { service, prisma } = serviceWith({
      entries: [
        entry('ana', '2026-09-14', 't-first'),
        entry('ana', '2026-09-15', 't-first'),
        entry('ana', '2026-09-16', null, false, 'SICK_LEAVE'), // last week's sick day: not copied
        entry('ana', '2026-09-21', null, false, 'ON_LEAVE'), // this Monday's holiday: kept
      ],
    });

    expect(await service.copyPreviousWeek(COMPANY, '2026-09-21', NOW)).toEqual({ copied: 1, skippedOnLeave: 1 });
    expect(prisma.scheduleEntry.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.scheduleEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ date: toDateColumn('2026-09-22'), shiftTemplateId: 't-first', leave: null }),
      }),
    );
  });

  it('will not copy into a locked week', async () => {
    const { service } = serviceWith({ week: { lockedAt: new Date() } });

    await expect(service.copyPreviousWeek(COMPANY, '2026-09-21', NOW)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('ScheduleService.publish', () => {
  const team = [
    { id: 'ana', status: 'ACTIVE', userId: 'user-ana' },
    { id: 'marko', status: 'ACTIVE', userId: null },
    { id: 'ivana', status: 'ACTIVE', userId: 'user-ivana' },
  ];

  it('locks the week and notifies each changed employee who has a login', async () => {
    const { service, prisma, notifications } = serviceWith({
      employees: team,
      entries: [entry('ana', '2026-09-21', 't-first'), entry('marko', '2026-09-22', 't-first')],
    });

    const result = await service.publish(COMPANY, '2026-09-21', 'menadzer@firma.mk', NOW);

    expect(result).toMatchObject({ changedEmployees: 2, notifiedEmployees: 1 });
    expect(prisma.scheduleWeek.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          lockedAt: NOW,
          publishedSnapshot: {
            ana: { '2026-09-21': 'Прва смена|07:00|15:00' },
            marko: { '2026-09-22': 'Прва смена|07:00|15:00' },
          },
        }),
      }),
    );
    expect(notifications.createMany).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: 'user-ana',
        type: 'SCHEDULE_PUBLISHED',
        metadata: { weekStart: '2026-09-21', weekEnd: '2026-09-27', employeeId: 'ana', shiftCount: 1 },
        relatedEntityType: 'schedule',
        relatedEntityId: '2026-09-21',
      }),
    ]);
  });

  it('on a republish, tells only the people whose own days changed', async () => {
    const { service, notifications } = serviceWith({
      employees: team,
      entries: [entry('ana', '2026-09-21', 't-first'), entry('ivana', '2026-09-23', 't-first')],
      week: {
        lockedAt: null,
        publishedAt: new Date(2026, 8, 16),
        publishedSnapshot: { ana: { '2026-09-21': 'Прва смена|07:00|15:00' } },
      },
    });

    const result = await service.publish(COMPANY, '2026-09-21', 'menadzer@firma.mk', NOW);

    expect(result).toMatchObject({ changedEmployees: 1, notifiedEmployees: 1 });
    expect(notifications.createMany).toHaveBeenCalledWith([expect.objectContaining({ userId: 'user-ivana' })]);
  });

  it('refuses to publish a week that is already published and locked', async () => {
    const { service, notifications } = serviceWith({ week: { lockedAt: new Date() } });

    const error = await errorOf(service.publish(COMPANY, '2026-09-21', 'menadzer@firma.mk', NOW));

    expect((error as ConflictException).getResponse()).toMatchObject({ errorCode: 'SCHEDULE_ALREADY_PUBLISHED' });
    expect(notifications.createMany).not.toHaveBeenCalled();
  });

  it('still publishes when sending the notifications fails', async () => {
    const { service, prisma, notifications } = serviceWith({
      employees: team,
      entries: [entry('ana', '2026-09-21', 't-first')],
    });
    notifications.createMany.mockRejectedValueOnce(new Error('socket down'));

    await expect(service.publish(COMPANY, '2026-09-21', 'menadzer@firma.mk', NOW)).resolves.toMatchObject({ notifiedEmployees: 1 });
    expect(prisma.scheduleWeek.upsert).toHaveBeenCalled();
  });
});

describe('ScheduleService.publish — email', () => {
  const team = [
    { id: 'ana', status: 'ACTIVE', firstName: 'Ана' },
    { id: 'marko', status: 'ACTIVE', firstName: 'Марко' },
    { id: 'ivana', status: 'ACTIVE', firstName: 'Ивана' },
  ];

  it('the first time, emails every employee their own week — even one with nothing planned', async () => {
    const { service, sentMail } = serviceWith({
      employees: team,
      entries: [entry('ana', '2026-09-21', 't-first'), entry('ana', '2026-09-22', null, true)],
    });

    const result = await service.publish(COMPANY, '2026-09-21', 'menadzer@firma.mk', NOW);

    expect(result.email).toEqual({ mode: 'smtp', sent: 3, failed: [] });
    expect(sentMail.map((message) => message.to)).toEqual(['ana@firma.mk', 'marko@firma.mk', 'ivana@firma.mk']);

    const toAna = sentMail[0]!;
    expect(toAna.replyTo).toBe('menadzer@firma.mk');
    expect(toAna.fromName).toBe('Пекара Здравје');
    expect(toAna.subject).toBe('Распоред за 21 – 27 септември 2026 · Пекара Здравје');
    expect(toAna.text).toContain('Понеделник 21.09: Прва смена, 07:00–15:00');
    expect(toAna.text).toContain('Вторник 22.09: Слободен/на');
    expect(toAna.text).toContain('Вкупно: 8 ч');
    // Only her own days: nobody else's name is in her email.
    expect(toAna.text).not.toContain('Марко');
  });

  it('uses the sender name and reply address the company set in Settings', async () => {
    const { service, sentMail } = serviceWith({
      employees: [team[0]!],
      company: { emailSenderName: 'Пекара — смени', emailReplyTo: 'smeni@pekara.mk' },
    });

    await service.publish(COMPANY, '2026-09-21', 'menadzer@firma.mk', NOW);

    expect(sentMail[0]).toMatchObject({ fromName: 'Пекара — смени', replyTo: 'smeni@pekara.mk' });
  });

  it('records a day off in the snapshot, but not as a shift in the notification', async () => {
    const { service, prisma, notifications } = serviceWith({
      employees: [{ id: 'ana', status: 'ACTIVE', userId: 'user-ana' }],
      entries: [entry('ana', '2026-09-21', 't-first'), entry('ana', '2026-09-22', null, true)],
    });

    await service.publish(COMPANY, '2026-09-21', 'menadzer@firma.mk', NOW);

    expect(prisma.scheduleWeek.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          publishedSnapshot: { ana: { '2026-09-21': 'Прва смена|07:00|15:00', '2026-09-22': 'DAY_OFF' } },
        }),
      }),
    );
    expect(notifications.createMany).toHaveBeenCalledWith([
      expect.objectContaining({ metadata: expect.objectContaining({ shiftCount: 1 }) }),
    ]);
  });

  it('tells an employee about a day of leave planned for them, but does not count it as a shift', async () => {
    const { service, prisma, notifications, sentMail } = serviceWith({
      employees: [{ id: 'ana', status: 'ACTIVE', userId: 'user-ana' }],
      entries: [entry('ana', '2026-09-21', 't-first'), entry('ana', '2026-09-22', null, false, 'SICK_LEAVE')],
    });

    await service.publish(COMPANY, '2026-09-21', 'menadzer@firma.mk', NOW);

    expect(prisma.scheduleWeek.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          publishedSnapshot: { ana: { '2026-09-21': 'Прва смена|07:00|15:00', '2026-09-22': 'LEAVE:SICK_LEAVE' } },
        }),
      }),
    );
    expect(notifications.createMany).toHaveBeenCalledWith([
      expect.objectContaining({ metadata: expect.objectContaining({ shiftCount: 1 }) }),
    ]);
    expect(sentMail[0]!.text).toContain('Вторник 22.09: Боледување');
  });

  it('on a republish, emails only the people whose days changed, as an update', async () => {
    const { service, sentMail } = serviceWith({
      employees: team,
      entries: [entry('ana', '2026-09-21', 't-first'), entry('ivana', '2026-09-23', null, true)],
      week: {
        lockedAt: null,
        publishedAt: new Date(2026, 8, 16),
        publishedSnapshot: { ana: { '2026-09-21': 'Прва смена|07:00|15:00' } },
      },
    });

    const result = await service.publish(COMPANY, '2026-09-21', 'menadzer@firma.mk', NOW);

    expect(result.email.sent).toBe(1);
    expect(sentMail).toHaveLength(1);
    expect(sentMail[0]).toMatchObject({ to: 'ivana@firma.mk' });
    expect(sentMail[0]!.subject).toMatch(/^Изменет распоред за/);
  });

  it('names the employees the email could not reach', async () => {
    const { service, mail } = serviceWith({ employees: team });
    mail.sendAll.mockImplementationOnce(async <T>(items: readonly T[]) => ({
      mode: 'smtp' as const,
      sent: items.slice(1),
      failed: items.slice(0, 1),
    }));

    const result = await service.publish(COMPANY, '2026-09-21', null, NOW);

    expect(result.email).toEqual({
      mode: 'smtp',
      sent: 2,
      failed: [{ employeeId: 'ana', name: 'Ана Петровска' }],
    });
  });

  it('still publishes when email fails outright, and reports everyone as not reached', async () => {
    const { service, prisma, mail } = serviceWith({ employees: team });
    mail.sendAll.mockRejectedValueOnce(new Error('SMTP down'));

    const result = await service.publish(COMPANY, '2026-09-21', null, NOW);

    expect(prisma.scheduleWeek.upsert).toHaveBeenCalled();
    expect(result.email.sent).toBe(0);
    expect(result.email.failed).toHaveLength(3);
  });
});

describe('parseWeekStart', () => {
  it('accepts a Monday and refuses any other day', () => {
    expect(parseWeekStart('2026-09-14')).toBe('2026-09-14');
    expect(() => parseWeekStart('2026-09-17')).toThrow(BadRequestException);
    expect(() => parseWeekStart('this-week')).toThrow(BadRequestException);
  });
});
