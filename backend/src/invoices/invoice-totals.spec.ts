import { describe, expect, it } from 'vitest';
import { calculateInvoiceTotals } from './invoice-totals.js';

const lines = [
  { description: 'Консалтинг', quantity: 10, unitPrice: '1500.00' },
  { description: 'Хостинг', quantity: 1, unitPrice: '2450.50' },
];

describe('calculateInvoiceTotals', () => {
  describe('when the issuer is not VAT-registered', () => {
    it('omits VAT entirely rather than reporting a zero rate', () => {
      const totals = calculateInvoiceTotals(lines, { isVatPayer: false });

      expect(totals.vatApplied).toBe(false);
      expect(totals.vatBreakdown).toEqual([]);
      expect(totals.vatTotal.toFixed(2)).toBe('0.00');
      expect(totals.net.toFixed(2)).toBe('17450.50');
      expect(totals.total.toFixed(2)).toBe('17450.50');
    });

    it('ignores per-line VAT rates that were supplied anyway', () => {
      const totals = calculateInvoiceTotals(
        [{ description: 'Услуга', quantity: 1, unitPrice: '1000.00', vatRate: 18 }],
        { isVatPayer: false, defaultVatRate: 18 },
      );

      expect(totals.vatBreakdown).toEqual([]);
      expect(totals.total.toFixed(2)).toBe('1000.00');
    });
  });

  describe('when the issuer is VAT-registered', () => {
    it("applies the company's default rate to lines without an explicit rate", () => {
      const totals = calculateInvoiceTotals(lines, { isVatPayer: true, defaultVatRate: 18 });

      expect(totals.vatApplied).toBe(true);
      expect(totals.vatBreakdown).toHaveLength(1);
      expect(totals.vatBreakdown[0]!.rate.toString()).toBe('18');
      expect(totals.vatBreakdown[0]!.base.toFixed(2)).toBe('17450.50');
      expect(totals.vatBreakdown[0]!.amount.toFixed(2)).toBe('3141.09');
      expect(totals.total.toFixed(2)).toBe('20591.59');
    });

    it('groups mixed rates into one breakdown row per rate, highest first', () => {
      const totals = calculateInvoiceTotals(
        [
          { description: 'Стандардна', quantity: 1, unitPrice: '1000.00', vatRate: 18 },
          { description: 'Повластена', quantity: 2, unitPrice: '500.00', vatRate: 5 },
          { description: 'Уште стандардна', quantity: 1, unitPrice: '200.00', vatRate: 18 },
        ],
        { isVatPayer: true },
      );

      expect(totals.vatBreakdown.map((entry) => entry.rate.toString())).toEqual(['18', '5']);
      expect(totals.vatBreakdown[0]!.base.toFixed(2)).toBe('1200.00');
      expect(totals.vatBreakdown[0]!.amount.toFixed(2)).toBe('216.00');
      expect(totals.vatBreakdown[1]!.base.toFixed(2)).toBe('1000.00');
      expect(totals.vatBreakdown[1]!.amount.toFixed(2)).toBe('50.00');
      expect(totals.net.toFixed(2)).toBe('2200.00');
      expect(totals.total.toFixed(2)).toBe('2466.00');
    });

    it('keeps decimal precision that float arithmetic would lose', () => {
      const totals = calculateInvoiceTotals(
        [{ description: 'Ставка', quantity: 3, unitPrice: '0.10' }],
        { isVatPayer: true, defaultVatRate: 18 },
      );

      // 3 * 0.1 is 0.30000000000000004 in floating point.
      expect(totals.net.toFixed(2)).toBe('0.30');
      expect(totals.total.toFixed(2)).toBe('0.35');
    });
  });

  it('returns zeroed totals for an invoice with no lines', () => {
    const totals = calculateInvoiceTotals([], { isVatPayer: true });

    expect(totals.net.toFixed(2)).toBe('0.00');
    expect(totals.total.toFixed(2)).toBe('0.00');
    expect(totals.vatBreakdown).toEqual([]);
  });
});
