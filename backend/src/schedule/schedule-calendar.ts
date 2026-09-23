/**
 * Dates, times and rules for the weekly schedule.
 *
 * Kept free of Nest and Prisma so the arithmetic that decides hours, locked
 * days and "whose schedule changed" can be tested on its own.
 *
 * Days travel as calendar-date strings (YYYY-MM-DD) and times of day as
 * HH:mm strings. Neither has a time zone, and treating them as instants is how
 * a shift ends up on the wrong day for anyone east of UTC.
 */

import { EmployeeStatus } from '../generated/prisma/enums.js';

/** 00:00 to 23:59. */
export const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A calendar date, shape only; `isCalendarDate` checks it exists. */
export const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const MINUTES_PER_DAY = 24 * 60;

export function minutesOfDay(time: string): number {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * How long a shift is. An end at or before the start runs past midnight:
 * 22:00–06:00 is 480 minutes, not −960. Equal start and end is refused when a
 * template is saved, so it never reaches here in practice; it counts as a full
 * day rather than as nothing.
 */
export function shiftMinutes(startTime: string, endTime: string): number {
  const difference = minutesOfDay(endTime) - minutesOfDay(startTime);
  return difference > 0 ? difference : difference + MINUTES_PER_DAY;
}

/** "08:00" → the value Prisma writes to a TIME column. */
export function toTimeColumn(time: string): Date {
  return new Date(`1970-01-01T${time}:00.000Z`);
}

/** A TIME column's value → "08:00". */
export function fromTimeColumn(value: Date): string {
  return value.toISOString().slice(11, 16);
}

/** YYYY-MM-DD → the UTC midnight Prisma stores in a DATE column. */
export function toDateColumn(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** A DATE column's value → YYYY-MM-DD. */
export function fromDateColumn(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Whether a YYYY-MM-DD string names a day that exists (not 2026-02-30). */
export function isCalendarDate(value: string): boolean {
  if (!CALENDAR_DATE_PATTERN.test(value)) return false;
  const date = toDateColumn(value);
  return !Number.isNaN(date.getTime()) && fromDateColumn(date) === value;
}

export function addDays(date: string, days: number): string {
  const next = toDateColumn(date);
  next.setUTCDate(next.getUTCDate() + days);
  return fromDateColumn(next);
}

/** 1 for Monday … 7 for Sunday. */
export function isoWeekday(date: string): number {
  const day = toDateColumn(date).getUTCDay();
  return day === 0 ? 7 : day;
}

/** The Monday of the week a date falls in. */
export function weekStartOf(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

/** Monday to Sunday of the week starting on `weekStart`. */
export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

/** Today in the server's own calendar, which is the business's calendar. */
export function localDate(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export type LeaveKind = typeof EmployeeStatus.ON_LEAVE | typeof EmployeeStatus.SICK_LEAVE;

/**
 * Whether an employee is away on a given day, read from the one place that
 * state lives: the employee's own status.
 *
 * That status says what is true now, with no dates attached. So it is applied
 * from today onward — someone on sick leave cannot be put on tomorrow's shift
 * — and never backwards, because nothing records when the leave began and a
 * shift worked last week was still worked.
 */
export function leaveOn(status: EmployeeStatus, date: string, today: string): LeaveKind | null {
  if (status === EmployeeStatus.ACTIVE) return null;
  return date >= today ? status : null;
}

/**
 * Why an employee is away on a day, if they are: their status first, since it
 * locks the day whatever the grid holds, then a day of leave planned in the
 * grid itself.
 */
export function dayLeave(
  status: EmployeeStatus,
  entry: Pick<ResolvedEntry, 'leave'> | undefined,
  date: string,
  today: string,
): LeaveKind | null {
  return leaveOn(status, date, today) ?? entry?.leave ?? null;
}

/** An assignment with its shift resolved, as the week view and publishing see it. */
export interface ResolvedEntry {
  employeeId: string;
  date: string;
  shift: { label: string; startTime: string; endTime: string } | null;
  /** A deliberate day off; never has a shift. Absent means false. */
  dayOff?: boolean;
  /** A planned day of leave; never has a shift or a day off. Absent means none. */
  leave?: LeaveKind | null;
}

export interface WeekSummary {
  /** Across every assigned shift that is not on a leave day. */
  scheduledMinutes: number;
  /** Distinct employees with a shift today, if today is in this week. */
  onShiftToday: number;
  /** Distinct employees away on at least one day of this week, by status or planned leave. */
  onLeaveThisWeek: number;
}

export function summarizeWeek(
  employees: readonly { id: string; status: EmployeeStatus }[],
  entries: readonly ResolvedEntry[],
  dates: readonly string[],
  today: string,
): WeekSummary {
  const statusOf = new Map(employees.map((employee) => [employee.id, employee.status]));
  const working = entries.filter((entry) => {
    const status = statusOf.get(entry.employeeId);
    return entry.shift !== null && status !== undefined && leaveOn(status, entry.date, today) === null;
  });

  return {
    scheduledMinutes: working.reduce(
      (sum, entry) => sum + shiftMinutes(entry.shift!.startTime, entry.shift!.endTime),
      0,
    ),
    onShiftToday: new Set(working.filter((entry) => entry.date === today).map((entry) => entry.employeeId)).size,
    onLeaveThisWeek: employees.filter(
      (employee) =>
        dates.some((date) => leaveOn(employee.status, date, today) !== null) ||
        entries.some((entry) => entry.employeeId === employee.id && entry.leave && dates.includes(entry.date)),
    ).length,
  };
}

/** What each employee was told, per day: "label|start|end", DAY_OFF, or a LEAVE: mark. */
export type ScheduleSnapshot = Record<string, Record<string, string>>;

/** A day off in a snapshot. Cannot collide with a shift, which always has pipes. */
export const DAY_OFF = 'DAY_OFF';

/** A planned day of leave in a snapshot: "LEAVE:ON_LEAVE" or "LEAVE:SICK_LEAVE". */
export function leaveMark(kind: LeaveKind): string {
  return `LEAVE:${kind}`;
}

/** Whether a snapshot day is a shift the employee works, as opposed to a day off or away. */
export function isShiftMark(day: string): boolean {
  return day.includes('|');
}

/**
 * The schedule as an employee experiences it: the days with a shift they will
 * actually work, the days they were told are free, and the days of leave
 * planned in the grid. A day their status puts them on leave is none of
 * these, whatever the grid holds — they already know about that leave.
 */
export function snapshotOf(
  employees: readonly { id: string; status: EmployeeStatus }[],
  entries: readonly ResolvedEntry[],
  today: string,
): ScheduleSnapshot {
  const statusOf = new Map(employees.map((employee) => [employee.id, employee.status]));
  const snapshot: ScheduleSnapshot = {};

  for (const entry of entries) {
    const status = statusOf.get(entry.employeeId);
    if (!entry.shift && !entry.dayOff && !entry.leave) continue;
    if (status === undefined || leaveOn(status, entry.date, today) !== null) continue;

    snapshot[entry.employeeId] ??= {};
    snapshot[entry.employeeId]![entry.date] = entry.leave
      ? leaveMark(entry.leave)
      : entry.shift
        ? `${entry.shift.label}|${entry.shift.startTime}|${entry.shift.endTime}`
        : DAY_OFF;
  }

  return snapshot;
}

/**
 * Employees whose own days differ between two snapshots: a shift added,
 * removed, moved, relabelled or retimed, a day off given or taken back, or a
 * day of leave planned or cancelled.
 * Sorted, so the result is stable.
 */
export function changedEmployees(previous: ScheduleSnapshot, current: ScheduleSnapshot): string[] {
  const ids = new Set([...Object.keys(previous), ...Object.keys(current)]);

  return [...ids]
    .filter((id) => {
      const before = previous[id] ?? {};
      const after = current[id] ?? {};
      const days = new Set([...Object.keys(before), ...Object.keys(after)]);
      return [...days].some((day) => before[day] !== after[day]);
    })
    .sort();
}
