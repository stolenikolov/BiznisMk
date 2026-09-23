import { describe, expect, it } from 'vitest';
import { PAYROLL_WINDOW_DAYS, payrollPeriodFor, periodEnd, periodLabel } from './payroll-period.js';

const at = (iso: string, hour = 12) => {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year!, month! - 1, day!, hour);
};

describe('payrollPeriodFor', () => {
  // The window the company asked for: it opens two days before payday.
  it('opens the window two days before payday', () => {
    expect(PAYROLL_WINDOW_DAYS).toBe(2);

    const { period, payday } = payrollPeriodFor(21, at('2026-09-19'));

    expect(periodLabel(period)).toBe('2026-09');
    expect(payday).toEqual(at('2026-09-21', 0));
  });

  it('is still the previous payday three days out, so nothing opens early', () => {
    // 18 September is three days from the 21st: this month's window has not
    // opened, and what is on the table is August's payroll.
    expect(periodLabel(payrollPeriodFor(21, at('2026-09-18')).period)).toBe('2026-08');
  });

  it('keeps the period on the table on payday and after it', () => {
    for (const day of ['2026-09-20', '2026-09-21', '2026-09-25', '2026-10-18']) {
      expect(periodLabel(payrollPeriodFor(21, at(day)).period)).toBe('2026-09');
    }
  });

  // The whole point of not closing the window: an overdue payroll stays
  // payable instead of vanishing when its month ends.
  it('hands over to the next period only when that window opens', () => {
    expect(periodLabel(payrollPeriodFor(21, at('2026-10-18')).period)).toBe('2026-09');
    expect(periodLabel(payrollPeriodFor(21, at('2026-10-19')).period)).toBe('2026-10');
  });

  it('clamps a payday past the end of a short month', () => {
    // Paying on the 31st in February means the 28th, and its window opens on
    // the 26th.
    const { period, payday } = payrollPeriodFor(31, at('2026-02-26'));

    expect(periodLabel(period)).toBe('2026-02');
    expect(payday).toEqual(at('2026-02-28', 0));
  });

  it('crosses the year with the previous period', () => {
    expect(periodLabel(payrollPeriodFor(21, at('2027-01-05')).period)).toBe('2026-12');
  });

  // A company that never set a payday still has people to pay.
  it('falls back to the current month when no payday is configured', () => {
    const { period, payday } = payrollPeriodFor(null, at('2026-09-03'));

    expect(periodLabel(period)).toBe('2026-09');
    expect(payday).toBeNull();
  });
});

describe('periodEnd', () => {
  it('is the last calendar day, which is who the period pays', () => {
    expect(periodEnd(at('2026-09-01'))).toBe('2026-09-30');
    expect(periodEnd(at('2026-02-01'))).toBe('2026-02-28');
    expect(periodEnd(at('2028-02-01'))).toBe('2028-02-29');
  });
});
