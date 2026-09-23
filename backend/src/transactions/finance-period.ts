/**
 * Period and bucket arithmetic for the finance page.
 *
 * Kept free of Prisma and Nest so the boundaries — which decide every figure
 * on that page — can be tested directly.
 */

export const PERIOD_PRESETS = ['week', 'month', 'quarter', 'year', 'custom'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const GRANULARITIES = ['7d', '30d', '3m', '1y'] as const;
export type Granularity = (typeof GRANULARITIES)[number];

export type BucketSize = 'day' | 'week' | 'month';

/** Half-open [from, to): `to` is the first instant NOT included. */
export interface DateRange {
  from: Date;
  to: Date;
}

export interface ResolvedPeriod {
  current: DateRange;
  /**
   * The whole preceding period, which is what the deltas compare against —
   * the same rule the dashboard overview already uses for month-on-month.
   */
  previous: DateRange;
}

export interface TrendWindow {
  range: DateRange;
  bucket: BucketSize;
  /** Every bucket start in the window, so the chart's axis has no gaps. */
  starts: Date[];
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Monday-anchored: the week Macedonian businesses actually work to. */
export function startOfWeek(date: Date): Date {
  const start = startOfDay(date);
  const weekday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - weekday);
  return start;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function startOfQuarter(date: Date): Date {
  return new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1);
}

export function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

/**
 * A period runs from its start up to now — a month-to-date figure, not a
 * projection of the whole month. `custom` takes the caller's own dates and
 * compares against the equally long window immediately before it.
 */
export function resolvePeriod(
  preset: PeriodPreset,
  now: Date,
  custom?: { from?: Date; to?: Date },
): ResolvedPeriod {
  if (preset === 'custom') {
    const from = startOfDay(custom?.from ?? startOfMonth(now));
    // `to` is inclusive for the caller, half-open for us.
    const to = addDays(startOfDay(custom?.to ?? now), 1);
    const span = Math.max(to.getTime() - from.getTime(), 0);
    return {
      current: { from, to },
      previous: { from: new Date(from.getTime() - span), to: from },
    };
  }

  const to = now;
  switch (preset) {
    case 'week': {
      const from = startOfWeek(now);
      return { current: { from, to }, previous: { from: addDays(from, -7), to: from } };
    }
    case 'quarter': {
      const from = startOfQuarter(now);
      return { current: { from, to }, previous: { from: addMonths(from, -3), to: from } };
    }
    case 'year': {
      const from = startOfYear(now);
      return {
        current: { from, to },
        previous: { from: new Date(from.getFullYear() - 1, 0, 1), to: from },
      };
    }
    case 'month':
    default: {
      const from = startOfMonth(now);
      return { current: { from, to }, previous: { from: addMonths(from, -1), to: from } };
    }
  }
}

/**
 * The trend chart has its own window, independent of the selected period:
 * the pills pick how far back and how coarse the buckets are.
 */
export function resolveTrendWindow(granularity: Granularity, now: Date): TrendWindow {
  switch (granularity) {
    case '7d':
      return dailyWindow(now, 7);
    case '3m':
      return weeklyWindow(now, 13);
    case '1y':
      return monthlyWindow(now, 12);
    case '30d':
    default:
      return dailyWindow(now, 30);
  }
}

function dailyWindow(now: Date, days: number): TrendWindow {
  const today = startOfDay(now);
  const from = addDays(today, -(days - 1));
  const starts = Array.from({ length: days }, (_, index) => addDays(from, index));
  return { range: { from, to: addDays(today, 1) }, bucket: 'day', starts };
}

function weeklyWindow(now: Date, weeks: number): TrendWindow {
  const thisWeek = startOfWeek(now);
  const from = addDays(thisWeek, -7 * (weeks - 1));
  const starts = Array.from({ length: weeks }, (_, index) => addDays(from, index * 7));
  return { range: { from, to: addDays(thisWeek, 7) }, bucket: 'week', starts };
}

function monthlyWindow(now: Date, months: number): TrendWindow {
  const thisMonth = startOfMonth(now);
  const from = addMonths(thisMonth, -(months - 1));
  const starts = Array.from({ length: months }, (_, index) => addMonths(from, index));
  return { range: { from, to: addMonths(thisMonth, 1) }, bucket: 'month', starts };
}

/** Which bucket a transaction falls in, as a sortable yyyy-mm-dd key. */
export function bucketKey(date: Date, bucket: BucketSize): string {
  switch (bucket) {
    case 'week':
      return isoDate(startOfWeek(date));
    case 'month':
      return isoDate(startOfMonth(date));
    case 'day':
    default:
      return isoDate(startOfDay(date));
  }
}

/** Local-date ISO string — toISOString would shift the day in UTC+N. */
export function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function parsePeriodPreset(value: unknown): PeriodPreset {
  return PERIOD_PRESETS.includes(value as PeriodPreset) ? (value as PeriodPreset) : 'month';
}

export function parseGranularity(value: unknown): Granularity {
  return GRANULARITIES.includes(value as Granularity) ? (value as Granularity) : '30d';
}

/** Accepts yyyy-mm-dd; anything else is treated as absent. */
export function parseDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year!, month! - 1, day!);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
