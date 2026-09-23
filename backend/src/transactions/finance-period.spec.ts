import { describe, expect, it } from 'vitest';
import {
  bucketKey,
  isoDate,
  parseDate,
  parseGranularity,
  parsePeriodPreset,
  resolvePeriod,
  resolveTrendWindow,
  startOfWeek,
} from './finance-period.js';

// A Tuesday, so week boundaries are not trivially correct.
const NOW = new Date(2026, 8, 15, 14, 30); // 15 September 2026

describe('startOfWeek', () => {
  it('anchors to Monday', () => {
    expect(isoDate(startOfWeek(NOW))).toBe('2026-09-14');
  });

  it('treats Sunday as the end of the week, not the start', () => {
    const sunday = new Date(2026, 8, 20, 9);
    expect(isoDate(startOfWeek(sunday))).toBe('2026-09-14');
  });

  it('crosses a month boundary', () => {
    const firstOfMonth = new Date(2026, 9, 1, 9); // Thursday 1 Oct
    expect(isoDate(startOfWeek(firstOfMonth))).toBe('2026-09-28');
  });
});

describe('resolvePeriod', () => {
  it('runs the current period up to now, not to the end of the calendar unit', () => {
    const { current } = resolvePeriod('month', NOW);
    expect(isoDate(current.from)).toBe('2026-09-01');
    expect(current.to).toEqual(NOW);
  });

  it('compares a month against the whole previous month', () => {
    const { previous } = resolvePeriod('month', NOW);
    expect(isoDate(previous.from)).toBe('2026-08-01');
    expect(isoDate(previous.to)).toBe('2026-09-01');
  });

  it('compares a week against the previous Monday-to-Monday week', () => {
    const { current, previous } = resolvePeriod('week', NOW);
    expect(isoDate(current.from)).toBe('2026-09-14');
    expect(isoDate(previous.from)).toBe('2026-09-07');
    expect(isoDate(previous.to)).toBe('2026-09-14');
  });

  it('starts a quarter on its own first month', () => {
    const { current, previous } = resolvePeriod('quarter', NOW);
    expect(isoDate(current.from)).toBe('2026-07-01');
    expect(isoDate(previous.from)).toBe('2026-04-01');
  });

  it('compares a year against the previous calendar year', () => {
    const { current, previous } = resolvePeriod('year', NOW);
    expect(isoDate(current.from)).toBe('2026-01-01');
    expect(isoDate(previous.from)).toBe('2025-01-01');
    expect(isoDate(previous.to)).toBe('2026-01-01');
  });

  it('includes the last day of a custom range', () => {
    const { current } = resolvePeriod('custom', NOW, {
      from: new Date(2026, 5, 1),
      to: new Date(2026, 5, 30),
    });
    expect(isoDate(current.from)).toBe('2026-06-01');
    // Half-open, so the end lands on the following day.
    expect(isoDate(current.to)).toBe('2026-07-01');
  });

  it('compares a custom range against an equally long window before it', () => {
    const { previous } = resolvePeriod('custom', NOW, {
      from: new Date(2026, 5, 11),
      to: new Date(2026, 5, 20),
    });
    expect(isoDate(previous.from)).toBe('2026-06-01');
    expect(isoDate(previous.to)).toBe('2026-06-11');
  });
});

describe('resolveTrendWindow', () => {
  it('gives 7 daily buckets ending today', () => {
    const window = resolveTrendWindow('7d', NOW);
    expect(window.bucket).toBe('day');
    expect(window.starts).toHaveLength(7);
    expect(isoDate(window.starts[0]!)).toBe('2026-09-09');
    expect(isoDate(window.starts[6]!)).toBe('2026-09-15');
  });

  it('gives 30 daily buckets', () => {
    const window = resolveTrendWindow('30d', NOW);
    expect(window.starts).toHaveLength(30);
    expect(isoDate(window.starts[0]!)).toBe('2026-08-17');
  });

  it('gives 13 Monday-anchored weekly buckets', () => {
    const window = resolveTrendWindow('3m', NOW);
    expect(window.bucket).toBe('week');
    expect(window.starts).toHaveLength(13);
    expect(isoDate(window.starts[12]!)).toBe('2026-09-14');
    expect(isoDate(window.starts[0]!)).toBe('2026-06-22');
  });

  it('gives 12 monthly buckets ending this month', () => {
    const window = resolveTrendWindow('1y', NOW);
    expect(window.bucket).toBe('month');
    expect(window.starts).toHaveLength(12);
    expect(isoDate(window.starts[0]!)).toBe('2025-10-01');
    expect(isoDate(window.starts[11]!)).toBe('2026-09-01');
  });

  it('covers every bucket start within its own range', () => {
    for (const granularity of ['7d', '30d', '3m', '1y'] as const) {
      const window = resolveTrendWindow(granularity, NOW);
      for (const start of window.starts) {
        expect(start.getTime()).toBeGreaterThanOrEqual(window.range.from.getTime());
        expect(start.getTime()).toBeLessThan(window.range.to.getTime());
      }
    }
  });
});

describe('bucketKey', () => {
  it('buckets by day, week and month', () => {
    const date = new Date(2026, 8, 17, 23, 45);
    expect(bucketKey(date, 'day')).toBe('2026-09-17');
    expect(bucketKey(date, 'week')).toBe('2026-09-14');
    expect(bucketKey(date, 'month')).toBe('2026-09-01');
  });

  it('keeps a late-evening transaction on its own local day', () => {
    // toISOString would roll this into the next day east of UTC.
    expect(bucketKey(new Date(2026, 8, 17, 23, 59), 'day')).toBe('2026-09-17');
  });

  it('matches the bucket starts the window emits', () => {
    const window = resolveTrendWindow('3m', NOW);
    const keys = new Set(window.starts.map((start) => isoDate(start)));
    expect(keys.has(bucketKey(new Date(2026, 8, 16, 10), 'week'))).toBe(true);
  });
});

describe('query parsing', () => {
  it('falls back to sane defaults', () => {
    expect(parsePeriodPreset('nonsense')).toBe('month');
    expect(parsePeriodPreset(undefined)).toBe('month');
    expect(parseGranularity('nonsense')).toBe('30d');
    expect(parseGranularity(null)).toBe('30d');
  });

  it('keeps valid values', () => {
    expect(parsePeriodPreset('quarter')).toBe('quarter');
    expect(parseGranularity('1y')).toBe('1y');
  });

  it('accepts only yyyy-mm-dd dates', () => {
    expect(isoDate(parseDate('2026-06-01')!)).toBe('2026-06-01');
    expect(parseDate('01/06/2026')).toBeUndefined();
    expect(parseDate('')).toBeUndefined();
    expect(parseDate(42)).toBeUndefined();
  });
});
