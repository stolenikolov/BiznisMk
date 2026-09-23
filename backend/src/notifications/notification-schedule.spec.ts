import { describe, expect, it } from 'vitest';
import {
  REMINDER_OFFSET_DAYS,
  daysUntil,
  isFreshBooking,
  isoDate,
  nextPayday,
  reminderDedupeKey,
  reminderHorizonDays,
  remindersFor,
} from './notification-schedule.js';

/** Local-time construction throughout — the module compares calendar days. */
const at = (iso: string, hour = 12) => {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year!, month! - 1, day!, hour);
};

describe('daysUntil', () => {
  it('counts whole calendar days, not elapsed hours', () => {
    // 23:00 tonight to 01:00 tomorrow is two hours but one day.
    expect(daysUntil(at('2026-09-16', 1), at('2026-09-15', 23))).toBe(1);
  });

  it('is zero on the day itself whatever the time', () => {
    expect(daysUntil(at('2026-09-15', 23), at('2026-09-15', 0))).toBe(0);
  });

  it('goes negative once the date has passed', () => {
    expect(daysUntil(at('2026-09-10'), at('2026-09-15'))).toBe(-5);
  });

  it('counts across a month boundary', () => {
    expect(daysUntil(at('2026-10-02'), at('2026-09-30'))).toBe(2);
  });
});

describe('remindersFor', () => {
  const now = at('2026-09-15');

  it('fires three days out, one day out, and on the day', () => {
    expect(remindersFor(at('2026-09-18'), now)).toBe(3);
    expect(remindersFor(at('2026-09-16'), now)).toBe(1);
    expect(remindersFor(at('2026-09-15'), now)).toBe(0);
  });

  it('stays quiet on the days in between', () => {
    expect(remindersFor(at('2026-09-17'), now)).toBeNull();
    expect(remindersFor(at('2026-09-19'), now)).toBeNull();
  });

  // A missed instalment is a different message from an upcoming one, so it is
  // deliberately not dressed up as a reminder here.
  it('stays quiet once the date has passed', () => {
    expect(remindersFor(at('2026-09-14'), now)).toBeNull();
  });

  it('accepts a different cadence without touching the default', () => {
    expect(remindersFor(at('2026-09-22'), now, [7])).toBe(7);
    expect(remindersFor(at('2026-09-18'), now, [7])).toBeNull();
  });
});

describe('reminderHorizonDays', () => {
  it('reports the furthest offset, which is how wide the scan must be', () => {
    expect(reminderHorizonDays()).toBe(Math.max(...REMINDER_OFFSET_DAYS));
    expect(reminderHorizonDays([1, 14, 3])).toBe(14);
  });
});

describe('nextPayday', () => {
  it('returns this month while the payday is still ahead', () => {
    expect(isoDate(nextPayday(25, at('2026-09-15')))).toBe('2026-09-25');
  });

  it('returns the payday itself on the day', () => {
    expect(isoDate(nextPayday(15, at('2026-09-15')))).toBe('2026-09-15');
  });

  it('rolls to next month once this month has been paid', () => {
    expect(isoDate(nextPayday(10, at('2026-09-15')))).toBe('2026-10-10');
  });

  // A company paying on the 31st still pays in February — the day clamps to
  // the end of the month rather than spilling into March.
  it('clamps a late day to the end of a short month', () => {
    expect(isoDate(nextPayday(31, at('2026-02-20')))).toBe('2026-02-28');
    expect(isoDate(nextPayday(31, at('2026-04-15')))).toBe('2026-04-30');
  });

  it('rolls across a year boundary', () => {
    expect(isoDate(nextPayday(5, at('2026-12-20')))).toBe('2027-01-05');
  });
});

describe('reminderDedupeKey', () => {
  it('is stable for the same event and run window', () => {
    const key = reminderDedupeKey('INVOICE_DUE', 'inv-1', at('2026-09-18'), 3);
    expect(key).toBe('INVOICE_DUE:inv-1:2026-09-18:d3');
    expect(reminderDedupeKey('INVOICE_DUE', 'inv-1', at('2026-09-18', 6), 3)).toBe(key);
  });

  it('differs per offset, so each of the three reminders lands', () => {
    expect(reminderDedupeKey('EMPLOYEE_PAYDAY', 'c-1', at('2026-09-25'), 3)).not.toBe(
      reminderDedupeKey('EMPLOYEE_PAYDAY', 'c-1', at('2026-09-25'), 1),
    );
  });

  // Moving a due date is a new event and earns a fresh reminder; re-running
  // the job over an unchanged one does not.
  it('changes when the due date moves', () => {
    expect(reminderDedupeKey('INVOICE_DUE', 'inv-1', at('2026-09-18'), 3)).not.toBe(
      reminderDedupeKey('INVOICE_DUE', 'inv-1', at('2026-09-19'), 3),
    );
  });
});

describe('isFreshBooking', () => {
  const now = at('2026-09-15', 10);

  it('treats something booked today as news', () => {
    expect(isFreshBooking(at('2026-09-15', 8), now)).toBe(true);
  });

  // Connecting an account imports a year of history in one go; announcing all
  // of it would bury everything that actually just happened.
  it('stays quiet for imported history', () => {
    expect(isFreshBooking(at('2026-09-14'), now)).toBe(false);
    expect(isFreshBooking(at('2025-11-02'), now)).toBe(false);
  });
});
