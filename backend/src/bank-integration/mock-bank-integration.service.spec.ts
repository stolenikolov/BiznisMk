import { describe, expect, it, vi } from 'vitest';
import { MockBankIntegrationProvider } from './mock-bank-integration.service.js';
import { TransactionDirection } from '../generated/prisma/enums.js';
import type { BankApiClient, BankApiResponse } from './bank-api.client.js';

const account = { bankName: 'Комерцијална банка АД Скопје', iban: 'MK07250120000058984' };

/** A bank that gives one answer to everything. */
function bankAnswering(response: BankApiResponse) {
  return { call: vi.fn().mockResolvedValue(response) };
}

const provider = (client = bankAnswering({ ok: true, status: 200, body: {} })) =>
  new MockBankIntegrationProvider(client as unknown as BankApiClient);

describe('MockBankIntegrationProvider.linkAccount', () => {
  const request = { companyId: 'co-1', iban: account.iban, holderName: 'Ана Тест' };

  it('asks the bank to claim the account for this company, in the owner’s name', async () => {
    const client = bankAnswering({
      ok: true,
      status: 200,
      body: { exists: true, linkStatus: 'CLAIMED', companyId: 'co-1' },
    });

    expect(await provider(client).linkAccount(request)).toEqual({ outcome: 'linked' });
    expect(client.call).toHaveBeenCalledWith('POST', '/accounts/verify', request);
  });

  it('accepts an account that is already this company’s', async () => {
    const client = bankAnswering({
      ok: true,
      status: 200,
      body: { exists: true, linkStatus: 'ALREADY_YOURS', companyId: 'co-1' },
    });
    expect(await provider(client).linkAccount(request)).toEqual({ outcome: 'linked' });
  });

  it.each([
    [{ ok: true, status: 200, body: { exists: false, errorCode: 'ACCOUNT_NOT_FOUND' } }, 'not_found'],
    [{ ok: true, status: 200, body: { exists: false, errorCode: 'INVALID_IBAN_FORMAT' } }, 'not_found'],
    [{ ok: false, status: 409, body: { errorCode: 'ACCOUNT_ALREADY_LINKED' } }, 'linked_elsewhere'],
    [{ ok: false, status: 409, body: { errorCode: 'ACCOUNT_CLOSED' } }, 'closed'],
  ])('reads a refusal as a reason not to connect: %j', async (answer, outcome) => {
    expect(await provider(bankAnswering(answer)).linkAccount(request)).toEqual({ outcome });
  });

  it('never treats an answer naming another company as linked', async () => {
    const client = bankAnswering({
      ok: true,
      status: 200,
      body: { exists: true, linkStatus: 'CLAIMED', companyId: 'co-2' },
    });
    await expect(provider(client).linkAccount(request)).rejects.toMatchObject({ status: 503 });
  });
});

describe('MockBankIntegrationProvider.checkAccount', () => {
  it('returns a well-formed result the add-account flow can branch on', async () => {
    const result = await provider().checkAccount(account);

    expect(typeof result.verified).toBe('boolean');
    expect(typeof result.hasSufficientFunds).toBe('boolean');
    expect(result.provider).toBe('mock');
    expect(result.mockBalance).toMatch(/^\d+\.\d{2}$/);
  });

  it('reports no funds whenever the account fails verification', async () => {
    const bank = provider();
    const results = await Promise.all(Array.from({ length: 20 }, () => bank.checkAccount(account)));

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
    const statement = await provider().fetchStatement(account);

    expect(statement.entries.length).toBeGreaterThan(20);
    expect(statement.entries.some((entry) => entry.direction === TransactionDirection.IN)).toBe(true);
    expect(statement.entries.some((entry) => entry.direction === TransactionDirection.OUT)).toBe(true);

    const months = new Set(statement.entries.map((entry) => entry.bookedAt.getMonth()));
    expect(months.size).toBeGreaterThan(3);
  });

  it('returns newest first, with decimal amounts and a non-negative balance', async () => {
    const statement = await provider().fetchStatement(account);

    for (const entry of statement.entries) {
      expect(entry.amount).toMatch(/^\d+\.\d{2}$/);
    }
    const timestamps = statement.entries.map((entry) => entry.bookedAt.getTime());
    expect([...timestamps].sort((a, b) => b - a)).toEqual(timestamps);
    expect(Number(statement.balance)).toBeGreaterThanOrEqual(0);
  });

  it('never books a transaction in the future', async () => {
    const statement = await provider().fetchStatement(account);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    for (const entry of statement.entries) {
      expect(entry.bookedAt.getTime()).toBeLessThanOrEqual(endOfToday.getTime());
    }
  });
});
