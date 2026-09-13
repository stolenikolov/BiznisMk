import { describe, expect, it } from 'vitest';
import { MockBankIntegrationProvider } from './mock-bank-integration.service.js';
import { TransactionDirection } from '../generated/prisma/enums.js';

const account = { bankName: 'Комерцијална банка АД Скопје', iban: 'MK07250120000058984' };

describe('MockBankIntegrationProvider.checkAccount', () => {
  it('returns a well-formed result the add-account flow can branch on', async () => {
    const result = await new MockBankIntegrationProvider().checkAccount(account);

    expect(typeof result.verified).toBe('boolean');
    expect(typeof result.hasSufficientFunds).toBe('boolean');
    expect(result.provider).toBe('mock');
    expect(result.mockBalance).toMatch(/^\d+\.\d{2}$/);
  });

  it('reports no funds whenever the account fails verification', async () => {
    const provider = new MockBankIntegrationProvider();
    const results = await Promise.all(Array.from({ length: 20 }, () => provider.checkAccount(account)));

    for (const result of results) {
      if (!result.verified) {
        expect(result.hasSufficientFunds).toBe(false);
        expect(result.mockBalance).toBe('0.00');
      }
    }
  });
});

describe('MockBankIntegrationProvider.fetchStatement', () => {
  it('returns history spanning several months in both directions', async () => {
    const statement = await new MockBankIntegrationProvider().fetchStatement(account);

    expect(statement.entries.length).toBeGreaterThan(20);
    expect(statement.entries.some((entry) => entry.direction === TransactionDirection.IN)).toBe(true);
    expect(statement.entries.some((entry) => entry.direction === TransactionDirection.OUT)).toBe(true);

    const months = new Set(statement.entries.map((entry) => entry.bookedAt.getMonth()));
    expect(months.size).toBeGreaterThan(3);
  });

  it('returns newest first, with decimal amounts and a non-negative balance', async () => {
    const statement = await new MockBankIntegrationProvider().fetchStatement(account);

    for (const entry of statement.entries) {
      expect(entry.amount).toMatch(/^\d+\.\d{2}$/);
    }
    const timestamps = statement.entries.map((entry) => entry.bookedAt.getTime());
    expect([...timestamps].sort((a, b) => b - a)).toEqual(timestamps);
    expect(Number(statement.balance)).toBeGreaterThanOrEqual(0);
  });

  it('never books a transaction in the future', async () => {
    const statement = await new MockBankIntegrationProvider().fetchStatement(account);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    for (const entry of statement.entries) {
      expect(entry.bookedAt.getTime()).toBeLessThanOrEqual(endOfToday.getTime());
    }
  });
});
