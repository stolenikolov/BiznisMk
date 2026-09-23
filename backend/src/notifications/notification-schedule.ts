/**
 * When a date-based reminder fires.
 *
 * Kept free of Prisma and Nest, the same way `finance-period.ts` is: the
 * cadence decides how often a user is interrupted, so it is worth being able
 * to reason about — and test — on its own.
 *
 * Dates are compared as whole calendar days in the server's local time, which
 * is what "three days before payday" means to the person reading it. Comparing
 * instants would fire a "1 day left" reminder at 23:00 the night before and
 * call it two.
 */

/**
 * How far ahead of a due date to warn, in days, counting down.
 *
 * One cadence for every date-based reminder — invoices, loan instalments and
 * payday all read it. Changing the rhythm for all three is this line; giving
 * one its own rhythm means passing a different array to `remindersFor`, which
 * every caller already takes as an argument.
 */
export const REMINDER_OFFSET_DAYS: readonly number[] = [3, 1, 0];

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Whole calendar days from `now` to `target`. Negative once the date is past,
 * zero on the day itself.
 */
export function daysUntil(target: Date, now: Date): number {
  const millisPerDay = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(target).getTime() - startOfDay(now).getTime()) / millisPerDay);
}

/**
 * Whether today is one of the reminder days for `target`, and if so how many
 * days out it is. Null on every other day — including after the date has
 * passed, because a missed instalment is a different message from an upcoming
 * one and should not be dressed up as a reminder.
 */
export function remindersFor(
  target: Date,
  now: Date,
  offsets: readonly number[] = REMINDER_OFFSET_DAYS,
): number | null {
  const daysAway = daysUntil(target, now);
  return offsets.includes(daysAway) ? daysAway : null;
}

/** The furthest ahead any reminder looks — how wide the daily scan must be. */
export function reminderHorizonDays(offsets: readonly number[] = REMINDER_OFFSET_DAYS): number {
  return Math.max(...offsets);
}

/** Last day of the month `date` falls in, as a day number. */
export function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

/**
 * The next payday on or after today, for a company that pays on `dayOfMonth`.
 *
 * A company that pays on the 31st still gets paid in February: the day is
 * clamped to the end of the month rather than rolling into the next one, which
 * is how a payroll run actually behaves.
 */
export function nextPayday(dayOfMonth: number, now: Date): Date {
  const thisMonth = paydayIn(now.getFullYear(), now.getMonth(), dayOfMonth);
  if (daysUntil(thisMonth, now) >= 0) return thisMonth;
  return paydayIn(now.getFullYear(), now.getMonth() + 1, dayOfMonth);
}

function paydayIn(year: number, month: number, dayOfMonth: number): Date {
  const firstOfMonth = new Date(year, month, 1);
  return new Date(year, month, Math.min(dayOfMonth, daysInMonth(firstOfMonth)));
}

/**
 * Identifies the real-world event behind one reminder, so the daily job can
 * run twice without telling anyone twice.
 *
 * The date is in the key rather than "today" so that moving an invoice's due
 * date earns a fresh reminder, while re-running the job on an unchanged one
 * does not.
 */
export function reminderDedupeKey(
  type: string,
  entityId: string,
  dueDate: Date,
  daysAway: number,
): string {
  return `${type}:${entityId}:${isoDate(dueDate)}:d${daysAway}`;
}

/**
 * Whether a booked transaction is news.
 *
 * Connecting an account imports its whole history in one go; announcing a
 * year of past transactions would bury the user under notifications for things
 * they already know about. Only something booked today is new activity — which
 * is also exactly what an ongoing bank sync delivers.
 */
export function isFreshBooking(bookedAt: Date, now: Date): boolean {
  return daysUntil(bookedAt, now) === 0;
}
