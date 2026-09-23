import { describe, expect, it } from 'vitest';
import { formatInvoiceNumber, nextSequence } from './invoice-number.js';

describe('formatInvoiceNumber', () => {
  it('zero-pads the counter to four digits', () => {
    expect(formatInvoiceNumber(2026, 1)).toBe('0001/2026');
    expect(formatInvoiceNumber(2026, 42)).toBe('0042/2026');
  });

  it('stops padding once the counter outgrows four digits', () => {
    expect(formatInvoiceNumber(2026, 12345)).toBe('12345/2026');
  });
});

describe('nextSequence', () => {
  it('starts a year that has no invoices yet at 1', () => {
    expect(nextSequence(null)).toBe(1);
  });

  it('continues from the highest counter already used', () => {
    expect(nextSequence(7)).toBe(8);
  });

  // The per-year reset is the whole point of scoping the lookup by year:
  // December's 0250/2026 is followed by January's 0001/2027, not 0251.
  it('restarts at 1 for a new year even after a busy previous year', () => {
    expect(formatInvoiceNumber(2027, nextSequence(null))).toBe('0001/2027');
  });
});
