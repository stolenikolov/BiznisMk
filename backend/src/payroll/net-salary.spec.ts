import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { calculateNetSalary, GROSS_SALARY_PATTERN, type PayrollParameters } from './net-salary.js';

const Decimal = Prisma.Decimal;

/**
 * The published figures, as fixtures. The code under test never sees these
 * except through its parameters — in the app they come from `tax_settings`.
 */
const MK_2026: PayrollParameters = {
  year: 2026,
  personalAllowanceMonthly: new Decimal('10932.00'),
  incomeTaxRate: new Decimal('10.00'),
  contributionsRate: new Decimal('28.00'),
};

const MK_2025: PayrollParameters = { ...MK_2026, year: 2025, personalAllowanceMonthly: new Decimal('10270.00') };

function asStrings(breakdown: ReturnType<typeof calculateNetSalary>) {
  return Object.fromEntries(Object.entries(breakdown).map(([key, value]) => [key, value.toFixed(2)]));
}

describe('calculateNetSalary — North Macedonia 2026', () => {
  it('follows gross → contributions → allowance → 10% tax → net', () => {
    expect(asStrings(calculateNetSalary('40000', MK_2026))).toEqual({
      gross: '40000.00',
      contributions: '11200.00', // 28% of 40,000
      baseAfterContributions: '28800.00',
      personalAllowance: '10932.00',
      taxableBase: '17868.00', // 28,800 − 10,932
      incomeTax: '1786.80', // 10% of 17,868
      net: '27013.20', // 28,800 − 1,786.80
    });
  });

  it('floors the taxable base at zero when the allowance covers it', () => {
    const pay = calculateNetSalary('15000', MK_2026);

    // 15,000 − 4,200 = 10,800, under the 10,932 allowance.
    expect(pay.baseAfterContributions.toFixed(2)).toBe('10800.00');
    expect(pay.personalAllowance.toFixed(2)).toBe('10800.00');
    expect(pay.taxableBase.toFixed(2)).toBe('0.00');
    expect(pay.incomeTax.toFixed(2)).toBe('0.00');
    expect(pay.net.toFixed(2)).toBe('10800.00');
  });

  it('taxes exactly nothing at the break-even gross, and 10% of every denar above it', () => {
    // 10,932 / 0.72 = 15,183.33: the base after contributions equals the allowance.
    expect(calculateNetSalary('15183.33', MK_2026).incomeTax.toFixed(2)).toBe('0.00');
    expect(calculateNetSalary('16183.33', MK_2026).incomeTax.toFixed(2)).toBe('72.00');
  });

  it('rounds each charge to the deni, half up, and the lines still add up', () => {
    const pay = calculateNetSalary('39500.55', MK_2026);

    // 39,500.55 × 28% = 11,060.154 → 11,060.15
    expect(pay.contributions.toFixed(2)).toBe('11060.15');
    // (28,440.40 − 10,932) × 10% = 1,750.84
    expect(pay.incomeTax.toFixed(2)).toBe('1750.84');
    expect(pay.net.toFixed(2)).toBe('26689.56');
    expect(pay.gross.minus(pay.contributions).minus(pay.incomeTax).equals(pay.net)).toBe(true);
    expect(pay.baseAfterContributions.minus(pay.personalAllowance).equals(pay.taxableBase)).toBe(true);
  });

  it('pays nothing on a zero salary', () => {
    expect(calculateNetSalary('0', MK_2026).net.toFixed(2)).toBe('0.00');
  });

  it('refuses a negative gross rather than inventing a refund', () => {
    expect(() => calculateNetSalary('-1', MK_2026)).toThrow(RangeError);
  });
});

describe('calculateNetSalary — the year decides the allowance', () => {
  it('uses whatever allowance the parameters carry', () => {
    // 10% of the 662 MKD difference between the two allowances.
    const net2025 = calculateNetSalary('40000', MK_2025).net;
    const net2026 = calculateNetSalary('40000', MK_2026).net;

    expect(net2025.toFixed(2)).toBe('26947.00');
    expect(net2026.minus(net2025).toFixed(2)).toBe('66.20');
  });

  it('follows a changed rate without any code change', () => {
    const pay = calculateNetSalary('40000', { ...MK_2026, incomeTaxRate: new Decimal('18.00') });
    expect(pay.incomeTax.toFixed(2)).toBe('3216.24');
  });
});

describe('GROSS_SALARY_PATTERN', () => {
  it.each(['40000', '40000.5', '40000.55', '0.01'])('accepts %s', (value) => {
    expect(GROSS_SALARY_PATTERN.test(value)).toBe(true);
  });

  it.each(['0', '0.00', '-1', '40000.555', '40.000', '1e5', ''])('rejects %j', (value) => {
    expect(GROSS_SALARY_PATTERN.test(value)).toBe(false);
  });
});
