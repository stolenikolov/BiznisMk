import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import type { TFunction } from 'i18next';
import { api } from './api.ts';
import type { CompanyRole } from '../auth/types.ts';

export type LeaveKind = 'ON_LEAVE' | 'SICK_LEAVE';

/** The kinds of day away the picker offers, in the order it lists them. */
export const LEAVE_KINDS: readonly LeaveKind[] = ['ON_LEAVE', 'SICK_LEAVE'];

export interface ShiftTemplate {
  id: string;
  label: string;
  /** HH:mm */
  startTime: string;
  /** HH:mm; at or before the start means the shift ends the next morning. */
  endTime: string;
  durationMinutes: number;
}

export interface ScheduleEmployee {
  id: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  role: CompanyRole;
  /** Days their status puts this person away — locked in the grid. Leave planned per day is on the entries. */
  leaveDays: Record<string, LeaveKind>;
  scheduledMinutes: number;
}

export interface ScheduleAssignment {
  employeeId: string;
  date: string;
  shiftTemplateId: string | null;
  /** A deliberate day off ("Слободен/на"); shiftTemplateId is then null. */
  dayOff: boolean;
  /** A planned day of holiday or sick leave; no shift and no day off with it. */
  leave: LeaveKind | null;
}

/** What one person's day can be set to from the grid. */
export type DayChoice =
  | { kind: 'shift'; templateId: string }
  | { kind: 'dayOff' }
  | { kind: 'leave'; leave: LeaveKind }
  | { kind: 'clear' };

export interface ScheduleWeek {
  weekStart: string;
  dates: string[];
  today: string;
  isLocked: boolean;
  publishedAt: string | null;
  templates: ShiftTemplate[];
  employees: ScheduleEmployee[];
  entries: ScheduleAssignment[];
  summary: { scheduledMinutes: number; onShiftToday: number; onLeaveThisWeek: number };
}

export function schedulePath(companyId: string): string {
  return `/companies/${companyId}/schedule`;
}

// Dates ------------------------------------------------------------------------
// Calendar dates travel as YYYY-MM-DD and are stepped in UTC, so no time zone
// can move a day.

function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function addDays(date: string, days: number): string {
  const next = toUtc(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/** 1 for Monday … 7 for Sunday. */
export function isoWeekday(date: string): number {
  const day = toUtc(date).getUTCDay();
  return day === 0 ? 7 : day;
}

export function weekStartOf(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

/** Today in the browser's own calendar. */
export function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** A `?week=` value turned into a Monday, or null when it is not a date. */
export function weekFromParam(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(toUtc(value).getTime())) return null;
  return weekStartOf(value);
}

/** "14 – 20 септември 2026", "28 септември – 4 октомври 2026", or across a new year. */
export function formatWeekRange(t: TFunction, start: string, end: string): string {
  const [startYear, startMonth, startDay] = start.split('-').map(Number) as [number, number, number];
  const [endYear, endMonth, endDay] = end.split('-').map(Number) as [number, number, number];
  const month = (value: number) => t(`schedule.months.${value}`);

  if (startYear !== endYear) {
    return `${startDay} ${month(startMonth)} ${startYear} – ${endDay} ${month(endMonth)} ${endYear}`;
  }
  if (startMonth !== endMonth) {
    return `${startDay} ${month(startMonth)} – ${endDay} ${month(endMonth)} ${endYear}`;
  }
  return `${startDay} – ${endDay} ${month(endMonth)} ${endYear}`;
}

/** "14.09" */
export function formatDayMonth(date: string): string {
  const [, month, day] = date.split('-');
  return `${day}.${month}`;
}

/** 480 → "8 ч", 450 → "7,5 ч". */
export function formatHours(t: TFunction, minutes: number, locale: string): string {
  const hours = Math.round((minutes / 60) * 10) / 10;
  const value = Number.isInteger(hours) ? String(hours) : String(hours).replace('.', locale.startsWith('mk') ? ',' : '.');
  return t('schedule.hours', { value });
}

/** The error codes the schedule API explains itself with, as user-facing copy. */
export function scheduleErrorMessage(t: TFunction, error: unknown): string {
  if (axios.isAxiosError(error)) {
    const code = error.response?.data?.errorCode;
    if (typeof code === 'string') {
      return t(`schedule.errors.${code}`, { defaultValue: t('schedule.errors.generic') });
    }
  }
  return t('schedule.errors.generic');
}

// The week -----------------------------------------------------------------------

export interface PublishOutcome {
  changedEmployees: number;
  notifiedEmployees: number;
  email: {
    /** `outbox`: the server has no mail account set up, so nothing left it. */
    mode: 'smtp' | 'outbox';
    sent: number;
    failed: { employeeId: string; name: string }[];
  };
}

const NOTHING_PUBLISHED: PublishOutcome = {
  changedEmployees: 0,
  notifiedEmployees: 0,
  email: { mode: 'smtp', sent: 0, failed: [] },
};

/**
 * One week of the grid and the actions on it. Every mutation answers with, or
 * is followed by, the server's own view of the week, so hours, locks and leave
 * are never recomputed in the browser.
 */
export function useScheduleWeek(companyId: string | undefined, weekStart: string) {
  const [week, setWeek] = useState<ScheduleWeek | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  // A slower answer for last week must not overwrite this week's.
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!companyId) {
      setIsLoading(false);
      return;
    }
    const request = ++latest.current;
    try {
      const { data } = await api.get<{ week: ScheduleWeek }>(`${schedulePath(companyId)}/weeks/${weekStart}`);
      if (request !== latest.current) return;
      setWeek(data.week);
      setHasError(false);
    } catch {
      if (request !== latest.current) return;
      setHasError(true);
    } finally {
      if (request === latest.current) setIsLoading(false);
    }
  }, [companyId, weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

  const assign = useCallback(
    async (employeeId: string, date: string, choice: DayChoice) => {
      if (!companyId) return;
      await api.put(`${schedulePath(companyId)}/entries`, {
        employeeId,
        date,
        shiftTemplateId: choice.kind === 'shift' ? choice.templateId : null,
        dayOff: choice.kind === 'dayOff',
        ...(choice.kind === 'leave' ? { leave: choice.leave } : {}),
      });
      await load();
    },
    [companyId, load],
  );

  const copyPrevious = useCallback(async () => {
    if (!companyId) return { copied: 0, skippedOnLeave: 0 };
    const { data } = await api.post<{ copied: number; skippedOnLeave: number }>(
      `${schedulePath(companyId)}/weeks/${weekStart}/copy-previous`,
    );
    await load();
    return data;
  }, [companyId, weekStart, load]);

  const publish = useCallback(async (): Promise<PublishOutcome> => {
    if (!companyId) return NOTHING_PUBLISHED;
    const { data } = await api.post<PublishOutcome & { week: ScheduleWeek }>(
      `${schedulePath(companyId)}/weeks/${weekStart}/publish`,
    );
    setWeek(data.week);
    return { changedEmployees: data.changedEmployees, notifiedEmployees: data.notifiedEmployees, email: data.email };
  }, [companyId, weekStart]);

  const unlock = useCallback(async () => {
    if (!companyId) return;
    const { data } = await api.post<{ week: ScheduleWeek }>(`${schedulePath(companyId)}/weeks/${weekStart}/unlock`);
    setWeek(data.week);
  }, [companyId, weekStart]);

  return { week, isLoading, hasError, reload: load, assign, copyPrevious, publish, unlock };
}
