/**
 * Which payroll period is on the table.
 *
 * Pure, like `notification-schedule.ts` next door: the rule decides when a
 * button that moves real money appears, so it is worth reasoning about — and
 * testing — without a database.
 *
 * The rule the company asked for: the window opens two days before payday and
 * does not close again until the bank confirms the salaries went out. That is
 * why nothing here returns "not due" — a payday that came and went unpaid
 * stays the period on the table, and only the next payday's window takes over
 * from it. What actually hides the button is a recorded run for the period, or
 * a period with nobody on the payroll; both are decided by the caller.
 */

import { daysInMonth, daysUntil, startOfDay } from '../notifications/notification-schedule.js';

/** How many days before payday the window opens. */
export const PAYROLL_WINDOW_DAYS = 2;

/** A payroll month, identified the way the database stores it. */
export interface PayrollPeriod {
  /** First day of the month the salaries are for, at local midnight. */
  period: Date;
  /** The payday itself, clamped into the month. Null when none is configured. */
  payday: Date | null;
}

/** The payday in one month, pulled back to the last day of a short month. */
export function paydayIn(year: number, month: number, dayOfMonth: number): Date {
  const firstOfMonth = new Date(year, month, 1);
  return new Date(year, month, Math.min(dayOfMonth, daysInMonth(firstOfMonth)));
}

/**
 * The period the "pay salaries" button is about.
 *
 * With a payday configured, the window opens `PAYROLL_WINDOW_DAYS` before it.
 * Until then the period on the table is still the *previous* payday's — which
 * is what keeps an overdue payroll payable instead of quietly disappearing at
 * the end of its month.
 *
 * With no payday configured there is no window to compute, so the current
 * calendar month is on the table: a company that never set a payday should
 * still be able to pay its people.
 */
export function payrollPeriodFor(paydayDayOfMonth: number | null, now: Date): PayrollPeriod {
  if (paydayDayOfMonth === null) {
    return { period: monthStart(now), payday: null };
  }

  const thisMonth = paydayIn(now.getFullYear(), now.getMonth(), paydayDayOfMonth);

  // Far enough ahead of this month's payday that its window has not opened:
  // last month's payday is the one that can still be owed.
  if (daysUntil(thisMonth, now) > PAYROLL_WINDOW_DAYS) {
    const previous = paydayIn(now.getFullYear(), now.getMonth() - 1, paydayDayOfMonth);
    return { period: monthStart(previous), payday: previous };
  }

  return { period: monthStart(thisMonth), payday: thisMonth };
}

/**
 * How a period is named: September 2026 is `2026-09`.
 *
 * Kept next to the period itself so the API, the description the bank stores
 * and the row in our own table all name a month the same way.
 */
export function periodLabel(period: Date): string {
  return `${period.getFullYear()}-${String(period.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Last calendar day of a period, as `YYYY-MM-DD`.
 *
 * Who is on a period's payroll is decided by comparing hire dates against
 * this: a DATE column carries no time zone, so the comparison is done on the
 * strings rather than on instants.
 */
export function periodEnd(period: Date): string {
  const lastDay = new Date(period.getFullYear(), period.getMonth() + 1, 0);
  return [
    lastDay.getFullYear(),
    String(lastDay.getMonth() + 1).padStart(2, '0'),
    String(lastDay.getDate()).padStart(2, '0'),
  ].join('-');
}

function monthStart(date: Date): Date {
  return startOfDay(new Date(date.getFullYear(), date.getMonth(), 1));
}
