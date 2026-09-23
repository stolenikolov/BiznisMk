import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { MailService, type MailMode } from '../mail/mail.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { NotificationType, type CompanyRole, type EmployeeStatus } from '../generated/prisma/enums.js';
import {
  addDays,
  changedEmployees,
  fromDateColumn,
  fromTimeColumn,
  isCalendarDate,
  isoWeekday,
  isShiftMark,
  leaveOn,
  localDate,
  shiftMinutes,
  snapshotOf,
  summarizeWeek,
  toDateColumn,
  toTimeColumn,
  weekDates,
  weekStartOf,
  type LeaveKind,
  type ResolvedEntry,
  type ScheduleSnapshot,
  type WeekSummary,
} from './schedule-calendar.js';
import { emailDaysFor, renderScheduleEmail } from './schedule-email.js';
import type {
  CreateShiftTemplateDto,
  SetScheduleEntryDto,
  UpdateShiftTemplateDto,
} from './dto/schedule.dto.js';

export interface ShiftTemplateView {
  id: string;
  label: string;
  /** HH:mm */
  startTime: string;
  /** HH:mm; at or before startTime means the shift ends the next morning. */
  endTime: string;
  durationMinutes: number;
}

export interface ScheduleEmployeeView {
  id: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  role: CompanyRole;
  /**
   * Days of this week the employee's status puts them away, and why. Locked:
   * assignment is refused on them. Leave planned in the grid is on the entries.
   */
  leaveDays: Record<string, LeaveKind>;
  /** Hours actually scheduled this week, leave days excluded. */
  scheduledMinutes: number;
}

export interface ScheduleEntryView {
  employeeId: string;
  date: string;
  shiftTemplateId: string | null;
  /** A deliberate day off; shiftTemplateId is then null. */
  dayOff: boolean;
  /** A planned day of holiday or sick leave; no shift and no day off with it. */
  leave: LeaveKind | null;
}

export interface ScheduleWeekView {
  weekStart: string;
  dates: string[];
  /** The server's today, so the grid highlights the same day the rules use. */
  today: string;
  isLocked: boolean;
  publishedAt: string | null;
  templates: ShiftTemplateView[];
  employees: ScheduleEmployeeView[];
  entries: ScheduleEntryView[];
  summary: WeekSummary;
}

export interface PublishResult {
  week: ScheduleWeekView;
  /** Employees whose own days differ from what they were last told. */
  changedEmployees: number;
  /** Of those, the ones with a login, who were sent an in-app notification. */
  notifiedEmployees: number;
  email: {
    /** `outbox`: no mail server is configured, so nothing actually left. */
    mode: MailMode;
    /** Employees whose schedule went out. */
    sent: number;
    /** Employees it could not be sent to, by name, so the manager can tell them. */
    failed: { employeeId: string; name: string }[];
  };
}

type TemplateRow = { id: string; label: string; startTime: Date; endTime: Date };

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  // Shift templates ------------------------------------------------------------

  async listTemplates(companyId: string): Promise<ShiftTemplateView[]> {
    const rows = await this.prisma.shiftTemplate.findMany({
      where: { companyId },
      orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toTemplateView);
  }

  async createTemplate(companyId: string, dto: CreateShiftTemplateDto): Promise<ShiftTemplateView> {
    assertHasLength(dto.startTime, dto.endTime);

    const row = await this.prisma.shiftTemplate.create({
      data: {
        companyId,
        label: dto.label,
        startTime: toTimeColumn(dto.startTime),
        endTime: toTimeColumn(dto.endTime),
      },
    });
    return toTemplateView(row);
  }

  async updateTemplate(
    companyId: string,
    templateId: string,
    dto: UpdateShiftTemplateDto,
  ): Promise<ShiftTemplateView> {
    const current = await this.loadTemplate(companyId, templateId);
    const startTime = dto.startTime ?? fromTimeColumn(current.startTime);
    const endTime = dto.endTime ?? fromTimeColumn(current.endTime);
    assertHasLength(startTime, endTime);

    const row = await this.prisma.shiftTemplate.update({
      where: { id: current.id },
      data: {
        label: dto.label,
        startTime: dto.startTime === undefined ? undefined : toTimeColumn(dto.startTime),
        endTime: dto.endTime === undefined ? undefined : toTimeColumn(dto.endTime),
      },
    });
    return toTemplateView(row);
  }

  /**
   * Deletes a template. Every assignment that used it, in every week and for
   * every employee, is left without a shift — the foreign key sets it to null
   * in the same statement, so there is no moment with a dangling reference.
   */
  async removeTemplate(companyId: string, templateId: string): Promise<{ clearedEntries: number }> {
    const template = await this.loadTemplate(companyId, templateId);

    const [clearedEntries] = await this.prisma.$transaction([
      this.prisma.scheduleEntry.count({ where: { shiftTemplateId: template.id } }),
      this.prisma.shiftTemplate.delete({ where: { id: template.id } }),
    ]);

    return { clearedEntries };
  }

  // The week -------------------------------------------------------------------

  async getWeek(companyId: string, weekStart: string, now = new Date()): Promise<ScheduleWeekView> {
    const start = parseWeekStart(weekStart);
    const dates = weekDates(start);
    const today = localDate(now);

    const [templates, employees, entries, week] = await Promise.all([
      this.prisma.shiftTemplate.findMany({
        where: { companyId },
        orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.employee.findMany({
        where: { companyId },
        select: { id: true, firstName: true, lastName: true, photoUrl: true, role: true, status: true },
        orderBy: [{ role: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }],
      }),
      this.loadWeekEntries(companyId, dates),
      this.prisma.scheduleWeek.findUnique({
        where: { companyId_weekStart: { companyId, weekStart: toDateColumn(start) } },
      }),
    ]);

    const resolved = resolveEntries(entries, templates);
    const summary = summarizeWeek(employees, resolved, dates, today);

    return {
      weekStart: start,
      dates,
      today,
      isLocked: week?.lockedAt != null,
      publishedAt: week?.publishedAt?.toISOString() ?? null,
      templates: templates.map(toTemplateView),
      employees: employees.map((employee) => {
        const leaveDays: Record<string, LeaveKind> = {};
        for (const date of dates) {
          const kind = leaveOn(employee.status, date, today);
          if (kind) leaveDays[date] = kind;
        }
        return {
          id: employee.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          photoUrl: employee.photoUrl,
          role: employee.role,
          leaveDays,
          scheduledMinutes: summarizeWeek(
            [employee],
            resolved.filter((entry) => entry.employeeId === employee.id),
            dates,
            today,
          ).scheduledMinutes,
        };
      }),
      entries: entries
        .filter((entry) => entry.shiftTemplateId !== null || entry.dayOff || entry.leave !== null)
        .map((entry) => ({
          employeeId: entry.employeeId,
          date: fromDateColumn(entry.date),
          shiftTemplateId: entry.shiftTemplateId,
          dayOff: entry.dayOff,
          leave: entry.leave,
        })),
      summary,
    };
  }

  /**
   * Assigns one employee's shift for one day, marks it as a day off or a day
   * of leave, or clears it. Refused when the template is not this company's,
   * the employee's status already has them away that day, or the week has
   * been published and locked.
   */
  async setEntry(companyId: string, dto: SetScheduleEntryDto, now = new Date()): Promise<ScheduleEntryView | null> {
    if (!isCalendarDate(dto.date)) {
      throw new BadRequestException('date is not a real calendar date');
    }
    const dayOff = dto.dayOff === true;
    const leave = dto.leave ?? null;
    if (dayOff && dto.shiftTemplateId !== null) {
      throw new BadRequestException('A day off cannot also have a shift; send shiftTemplateId: null');
    }
    if (leave && (dto.shiftTemplateId !== null || dayOff)) {
      throw new BadRequestException('A day of leave cannot also have a shift or be a day off');
    }

    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, companyId },
      select: { id: true, status: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    await this.assertUnlocked(companyId, weekStartOf(dto.date));

    if (dto.shiftTemplateId === null && !dayOff && !leave) {
      await this.prisma.scheduleEntry.deleteMany({
        where: { companyId, employeeId: employee.id, date: toDateColumn(dto.date) },
      });
      return null;
    }

    let shiftTemplateId: string | null = null;
    if (dto.shiftTemplateId !== null) {
      // Scoped by company: another tenant's template id reads as not found.
      const template = await this.prisma.shiftTemplate.findFirst({
        where: { id: dto.shiftTemplateId, companyId },
        select: { id: true },
      });
      if (!template) {
        throw new NotFoundException('Shift template not found');
      }
      shiftTemplateId = template.id;
    }

    // The employee's status is already a reason to be away; a day off or a
    // day of leave on top of it would tell them something it already says,
    // and a shift is refused.
    const statusLeave = leaveOn(employee.status, dto.date, localDate(now));
    if (statusLeave) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        errorCode: 'EMPLOYEE_ON_LEAVE',
        message: 'The employee is away on this day and cannot be scheduled',
        leave: statusLeave,
      });
    }

    // Every field is written every time, so switching a day from one kind to
    // another never leaves the old kind behind.
    const assignment = { shiftTemplateId, dayOff, leave };
    const row = await this.prisma.scheduleEntry.upsert({
      where: { employeeId_date: { employeeId: employee.id, date: toDateColumn(dto.date) } },
      create: { companyId, employeeId: employee.id, date: toDateColumn(dto.date), ...assignment },
      update: assignment,
    });

    return {
      employeeId: row.employeeId,
      date: fromDateColumn(row.date),
      shiftTemplateId: row.shiftTemplateId,
      dayOff: row.dayOff,
      leave: row.leave,
    };
  }

  /**
   * Repeats last week onto this one: every assignment — a shift or a day off
   * — moves forward seven days, same employee, same weekday. Days with nothing
   * last week keep whatever this week already has; days the employee is now
   * away — by status, or by leave already planned this week — are skipped
   * rather than failing the whole copy or overwriting the leave.
   *
   * Leave itself is not copied: a holiday or a sick day last week says nothing
   * about this one.
   */
  async copyPreviousWeek(
    companyId: string,
    weekStart: string,
    now = new Date(),
  ): Promise<{ copied: number; skippedOnLeave: number }> {
    const start = parseWeekStart(weekStart);
    await this.assertUnlocked(companyId, start);

    const today = localDate(now);
    const dates = weekDates(start);
    const previousDates = weekDates(addDays(start, -7));
    const [previous, plannedLeave] = await Promise.all([
      this.prisma.scheduleEntry.findMany({
        where: {
          companyId,
          date: { gte: toDateColumn(previousDates[0]!), lte: toDateColumn(previousDates[6]!) },
          OR: [{ shiftTemplateId: { not: null } }, { dayOff: true }],
        },
        include: { employee: { select: { status: true } } },
      }),
      this.prisma.scheduleEntry.findMany({
        where: {
          companyId,
          date: { gte: toDateColumn(dates[0]!), lte: toDateColumn(dates[6]!) },
          leave: { not: null },
        },
        select: { employeeId: true, date: true },
      }),
    ]);

    const onPlannedLeave = new Set(plannedLeave.map((entry) => `${entry.employeeId}|${fromDateColumn(entry.date)}`));
    const toCopy = previous
      .map((entry) => ({ entry, date: addDays(fromDateColumn(entry.date), 7) }))
      .filter(
        ({ entry, date }) =>
          leaveOn(entry.employee.status, date, today) === null && !onPlannedLeave.has(`${entry.employeeId}|${date}`),
      );

    await this.prisma.$transaction(
      toCopy.map(({ entry, date }) => {
        const assignment = { shiftTemplateId: entry.shiftTemplateId, dayOff: entry.dayOff, leave: null };
        return this.prisma.scheduleEntry.upsert({
          where: { employeeId_date: { employeeId: entry.employeeId, date: toDateColumn(date) } },
          create: { companyId, employeeId: entry.employeeId, date: toDateColumn(date), ...assignment },
          update: assignment,
        });
      }),
    );

    return { copied: toCopy.length, skippedOnLeave: previous.length - toCopy.length };
  }

  /**
   * Publishes and locks a week, then tells the team.
   *
   * The first publication emails every employee their own week: most of them
   * never log in, so email is how they learn their shifts. Publishing again
   * after changes emails only the people whose own days changed, so fixing
   * one person's Thursday does not resend everyone's week. Employees with a
   * login also get an in-app notification when their days changed.
   *
   * `replyTo` is the publisher's address, so an employee's "can I swap?"
   * reaches a person instead of a no-reply mailbox — unless the company has
   * set a reply address of its own in Settings. The sender shown is the
   * company's chosen name, or the company itself.
   */
  async publish(
    companyId: string,
    weekStart: string,
    replyTo: string | null = null,
    now = new Date(),
  ): Promise<PublishResult> {
    const start = parseWeekStart(weekStart);
    const dates = weekDates(start);
    const today = localDate(now);
    const weekKey = { companyId_weekStart: { companyId, weekStart: toDateColumn(start) } };

    const existing = await this.prisma.scheduleWeek.findUnique({ where: weekKey });
    if (existing?.lockedAt) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        errorCode: 'SCHEDULE_ALREADY_PUBLISHED',
        message: 'This week is already published; unlock it to make changes',
      });
    }

    const [company, employees, entries, templates] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { name: true, emailSenderName: true, emailReplyTo: true },
      }),
      this.prisma.employee.findMany({
        where: { companyId },
        select: { id: true, status: true, userId: true, firstName: true, lastName: true, email: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      this.loadWeekEntries(companyId, dates),
      this.prisma.shiftTemplate.findMany({ where: { companyId } }),
    ]);

    const resolved = resolveEntries(entries, templates);
    const snapshot = snapshotOf(employees, resolved, today);
    const isUpdate = existing?.publishedAt != null;
    const previous = (existing?.publishedSnapshot ?? {}) as ScheduleSnapshot;
    const changed = changedEmployees(previous, snapshot);

    await this.prisma.scheduleWeek.upsert({
      where: weekKey,
      create: {
        companyId,
        weekStart: toDateColumn(start),
        lockedAt: now,
        publishedAt: now,
        publishedSnapshot: snapshot as Prisma.InputJsonValue,
      },
      update: { lockedAt: now, publishedAt: now, publishedSnapshot: snapshot as Prisma.InputJsonValue },
    });

    const recipients = employees.filter((employee) => changed.includes(employee.id) && employee.userId !== null);
    await this.notifyPublished(companyId, start, dates, snapshot, recipients);

    const email = await this.emailPublished({
      companyName: company.name,
      senderName: company.emailSenderName ?? company.name,
      weekStart: start,
      dates,
      today,
      resolved,
      employees: isUpdate ? employees.filter((employee) => changed.includes(employee.id)) : employees,
      isUpdate,
      replyTo: company.emailReplyTo ?? replyTo,
    });

    return {
      week: await this.getWeek(companyId, start, now),
      changedEmployees: changed.length,
      notifiedEmployees: recipients.length,
      email,
    };
  }

  /** Reopens a published week for changes. Publishing again notifies only what changed. */
  async unlock(companyId: string, weekStart: string, now = new Date()): Promise<ScheduleWeekView> {
    const start = parseWeekStart(weekStart);
    await this.prisma.scheduleWeek.updateMany({
      where: { companyId, weekStart: toDateColumn(start) },
      data: { lockedAt: null },
    });
    return this.getWeek(companyId, start, now);
  }

  // Internals ------------------------------------------------------------------

  private async loadTemplate(companyId: string, templateId: string) {
    const template = await this.prisma.shiftTemplate.findFirst({ where: { id: templateId, companyId } });
    if (!template) {
      throw new NotFoundException('Shift template not found');
    }
    return template;
  }

  private loadWeekEntries(companyId: string, dates: readonly string[]) {
    return this.prisma.scheduleEntry.findMany({
      where: { companyId, date: { gte: toDateColumn(dates[0]!), lte: toDateColumn(dates[6]!) } },
    });
  }

  private async assertUnlocked(companyId: string, weekStart: string): Promise<void> {
    const week = await this.prisma.scheduleWeek.findUnique({
      where: { companyId_weekStart: { companyId, weekStart: toDateColumn(weekStart) } },
      select: { lockedAt: true },
    });
    if (week?.lockedAt) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        errorCode: 'SCHEDULE_LOCKED',
        message: 'This week is published and locked; unlock it to make changes',
      });
    }
  }

  /**
   * One notification per person, addressed to their own login. A failure here
   * is logged, not thrown: the week is already published, and failing the
   * request would invite a second publish that notifies nobody.
   */
  private async notifyPublished(
    companyId: string,
    weekStart: string,
    dates: readonly string[],
    snapshot: ScheduleSnapshot,
    recipients: readonly { id: string; userId: string | null }[],
  ): Promise<void> {
    try {
      await this.notifications.createMany(
        recipients.map((employee) => ({
          companyId,
          userId: employee.userId,
          type: NotificationType.SCHEDULE_PUBLISHED,
          metadata: {
            weekStart,
            weekEnd: dates[6],
            employeeId: employee.id,
            shiftCount: Object.values(snapshot[employee.id] ?? {}).filter(isShiftMark).length,
          },
          relatedEntityType: 'schedule',
          relatedEntityId: weekStart,
        })),
      );
    } catch (error) {
      this.logger.error(`Schedule for ${weekStart} published, but notifying failed: ${String(error)}`);
    }
  }

  /**
   * Each employee's own week, one email per person. Like notifying, this never
   * throws: the week is already published and locked, and a failed request
   * would only invite a second publish. Who did not get it is reported back.
   */
  private async emailPublished(input: {
    companyName: string;
    /** Shown as the sender. */
    senderName: string;
    weekStart: string;
    dates: readonly string[];
    today: string;
    resolved: readonly ResolvedEntry[];
    employees: readonly { id: string; status: EmployeeStatus; firstName: string; lastName: string; email: string }[];
    isUpdate: boolean;
    replyTo: string | null;
  }): Promise<PublishResult['email']> {
    const name = (employee: (typeof input.employees)[number]) => `${employee.firstName} ${employee.lastName}`;

    try {
      const result = await this.mail.sendAll(input.employees, (employee) => ({
        to: employee.email,
        replyTo: input.replyTo ?? undefined,
        fromName: input.senderName,
        ...renderScheduleEmail({
          companyName: input.companyName,
          firstName: employee.firstName,
          weekStart: input.weekStart,
          weekEnd: input.dates[6]!,
          days: emailDaysFor(
            employee.status,
            input.dates,
            input.resolved.filter((entry) => entry.employeeId === employee.id),
            input.today,
          ),
          isUpdate: input.isUpdate,
          canReply: input.replyTo !== null,
        }),
      }));

      return {
        mode: result.mode,
        sent: result.sent.length,
        failed: result.failed.map((employee) => ({ employeeId: employee.id, name: name(employee) })),
      };
    } catch (error) {
      this.logger.error(`Schedule for ${input.weekStart} published, but emailing failed: ${String(error)}`);
      return {
        mode: this.mail.mode,
        sent: 0,
        failed: input.employees.map((employee) => ({ employeeId: employee.id, name: name(employee) })),
      };
    }
  }
}

/** A week is named by its Monday; anything else is a mistake worth reporting. */
export function parseWeekStart(value: string): string {
  if (!isCalendarDate(value)) {
    throw new BadRequestException('week must be a date in YYYY-MM-DD form');
  }
  if (isoWeekday(value) !== 1) {
    throw new BadRequestException('week must start on a Monday');
  }
  return value;
}

function assertHasLength(startTime: string, endTime: string): void {
  if (startTime === endTime) {
    throw new BadRequestException('A shift cannot start and end at the same time');
  }
}

function toTemplateView(row: TemplateRow): ShiftTemplateView {
  const startTime = fromTimeColumn(row.startTime);
  const endTime = fromTimeColumn(row.endTime);
  return { id: row.id, label: row.label, startTime, endTime, durationMinutes: shiftMinutes(startTime, endTime) };
}

function resolveEntries(
  entries: readonly {
    employeeId: string;
    date: Date;
    shiftTemplateId: string | null;
    dayOff: boolean;
    leave: LeaveKind | null;
  }[],
  templates: readonly TemplateRow[],
): ResolvedEntry[] {
  const byId = new Map(templates.map((template) => [template.id, toTemplateView(template)]));
  return entries.map((entry) => {
    const template = entry.shiftTemplateId ? byId.get(entry.shiftTemplateId) : undefined;
    return {
      employeeId: entry.employeeId,
      date: fromDateColumn(entry.date),
      shift: template ? { label: template.label, startTime: template.startTime, endTime: template.endTime } : null,
      dayOff: entry.dayOff,
      leave: entry.leave,
    };
  });
}

