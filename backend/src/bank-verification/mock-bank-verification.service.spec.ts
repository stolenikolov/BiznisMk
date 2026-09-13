import { describe, expect, it } from 'vitest';
import { MockBankVerificationProvider } from './mock-bank-verification.service.js';

const request = { bankName: 'Комерцијална банка АД Скопје', iban: 'MK07250120000058984' };

describe('MockBankVerificationProvider', () => {
  it('returns a well-formed result the add-account flow can branch on', async () => {
    const result = await new MockBankVerificationProvider().checkAccount(request);

    expect(typeof result.verified).toBe('boolean');
    expect(typeof result.hasSufficientFunds).toBe('boolean');
    expect(result.provider).toBe('mock');
    expect(result.mockBalance).toMatch(/^\d+\.\d{2}$/);
  });

  it('reports no funds whenever the account fails verification', async () => {
    const provider = new MockBankVerificationProvider();
    const results = await Promise.all(Array.from({ length: 25 }, () => provider.checkAccount(request)));

    for (const result of results) {
      if (!result.verified) {
        expect(result.hasSufficientFunds).toBe(false);
        expect(result.mockBalance).toBe('0.00');
      }
    }
  });

  it('never claims sufficient funds on a balance below the floor', async () => {
    const provider = new MockBankVerificationProvider();
    const results = await Promise.all(Array.from({ length: 25 }, () => provider.checkAccount(request)));

    for (const result of results) {
      if (result.hasSufficientFunds) {
        expect(Number(result.mockBalance)).toBeGreaterThanOrEqual(500);
      }
    }
  });
});
