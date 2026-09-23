import { describe, expect, it } from 'vitest';
import { TransactionDirection } from '../generated/prisma/enums.js';
import { normalizeIban, parseBankWebhookEvent } from './bank-webhook.types.js';

/** A deposit, shaped exactly as the mock bank sends it. */
const deposit = (overrides: Record<string, unknown> = {}) => ({
  eventType: 'TRANSACTION_CREATED',
  iban: 'MK07250120000058984',
  currency: 'MKD',
  newBalance: 128400.5,
  transactions: [
    {
      id: 'txn_01',
      type: 'CREDIT',
      amount: 4500,
      currency: 'MKD',
      description: 'Simulated deposit',
      balanceAfter: 128400.5,
      createdAt: '2026-09-15T12:30:00.000Z',
    },
  ],
  timestamp: '2026-09-15T12:30:00.000Z',
  ...overrides,
});

describe('normalizeIban', () => {
  it('strips the spacing a person might type and upper-cases', () => {
    expect(normalizeIban('mk07 2501 2000 0058 984')).toBe('MK07250120000058984');
    expect(normalizeIban('MK07-2501-2000-0058-984')).toBe('MK07250120000058984');
  });
});

describe('parseBankWebhookEvent — a deposit', () => {
  it('reads a CREDIT as money arriving', () => {
    const event = parseBankWebhookEvent(deposit());

    expect(event?.eventType).toBe('TRANSACTION_CREATED');
    expect(event?.accounts).toHaveLength(1);

    const [account] = event!.accounts;
    expect(account?.iban).toBe('MK07250120000058984');
    expect(account?.newBalance).toBe('128400.5');
    expect(account?.movements[0]).toMatchObject({
      externalId: 'txn_01',
      direction: TransactionDirection.IN,
      amount: '4500',
      description: 'Simulated deposit',
    });
    expect(account?.movements[0]?.bookedAt.toISOString()).toBe('2026-09-15T12:30:00.000Z');
  });

  it('reads a DEBIT as money leaving', () => {
    const event = parseBankWebhookEvent(
      deposit({
        transactions: [
          {
            id: 'txn_02',
            type: 'DEBIT',
            amount: 900,
            currency: 'MKD',
            description: 'Simulated withdrawal',
            balanceAfter: 1,
            createdAt: '2026-09-15T12:30:00.000Z',
          },
        ],
      }),
    );

    expect(event?.accounts[0]?.movements[0]?.direction).toBe(TransactionDirection.OUT);
  });

  it('normalises the IBAN so it matches what we stored', () => {
    const event = parseBankWebhookEvent(deposit({ iban: 'mk07 2501 2000 0058 984' }));
    expect(event?.accounts[0]?.iban).toBe('MK07250120000058984');
  });

  // The bank may add fields; that must not stop a deposit being recorded.
  it('ignores fields it does not know about', () => {
    const event = parseBankWebhookEvent(deposit({ somethingNew: { nested: true } }));
    expect(event?.accounts[0]?.movements).toHaveLength(1);
  });

  it('falls back to generic wording when a description is missing', () => {
    const event = parseBankWebhookEvent(
      deposit({
        transactions: [
          { id: 't', type: 'CREDIT', amount: 10, createdAt: '2026-09-15T12:30:00.000Z' },
        ],
      }),
    );
    expect(event?.accounts[0]?.movements[0]?.description).toBe('Банкарска трансакција');
  });
});

describe('parseBankWebhookEvent — a payroll run', () => {
  const payroll = {
    eventType: 'PAYROLL_COMPLETED',
    requestId: 'req_1',
    companyId: 'co-1',
    ibans: ['MK07250120000058984', 'MK07200000012345678'],
    accounts: [
      {
        iban: 'MK07250120000058984',
        currency: 'MKD',
        newBalance: 50000,
        transactions: [
          { id: 'p1', type: 'DEBIT', amount: 30000, description: 'Плата', createdAt: '2026-09-15T08:00:00.000Z' },
        ],
      },
      {
        iban: 'MK07200000012345678',
        currency: 'MKD',
        newBalance: 12000,
        transactions: [
          { id: 'p2', type: 'DEBIT', amount: 18000, description: 'Плата', createdAt: '2026-09-15T08:00:00.000Z' },
        ],
      },
    ],
    // The same rows flattened, which is why the parser must not read both.
    transactions: [
      { id: 'p1', type: 'DEBIT', amount: 30000, description: 'Плата', createdAt: '2026-09-15T08:00:00.000Z' },
      { id: 'p2', type: 'DEBIT', amount: 18000, description: 'Плата', createdAt: '2026-09-15T08:00:00.000Z' },
    ],
    timestamp: '2026-09-15T08:00:00.000Z',
  };

  it('reads every account the run touched', () => {
    const event = parseBankWebhookEvent(payroll);

    expect(event?.eventType).toBe('PAYROLL_COMPLETED');
    expect(event?.accounts.map((a) => a.iban)).toEqual([
      'MK07250120000058984',
      'MK07200000012345678',
    ]);
  });

  // Reading the flattened top-level array as well would book every salary
  // twice — once per account and once again for the batch.
  it('counts each salary once, not once per copy in the payload', () => {
    const event = parseBankWebhookEvent(payroll);
    const ids = event!.accounts.flatMap((a) => a.movements.map((m) => m.externalId));

    expect(ids).toEqual(['p1', 'p2']);
  });
});

describe('parseBankWebhookEvent — nothing to act on', () => {
  it('returns null for an event type we do not handle', () => {
    expect(parseBankWebhookEvent({ eventType: 'ACCOUNT_CLOSED', iban: 'MK07' })).toBeNull();
  });

  it('returns null for a body that is not an object', () => {
    expect(parseBankWebhookEvent(null)).toBeNull();
    expect(parseBankWebhookEvent('deposit')).toBeNull();
    expect(parseBankWebhookEvent([deposit()])).toBeNull();
  });

  it('returns null when the event carries no transactions', () => {
    expect(parseBankWebhookEvent(deposit({ transactions: [] }))).toBeNull();
    expect(parseBankWebhookEvent(deposit({ transactions: undefined }))).toBeNull();
  });

  it('returns null without an IBAN to match on', () => {
    expect(parseBankWebhookEvent(deposit({ iban: '   ' }))).toBeNull();
    expect(parseBankWebhookEvent(deposit({ iban: 42 }))).toBeNull();
  });

  // A movement with no usable id, amount, direction or date cannot be recorded
  // safely — recording it without an id would make it undedupable on retry.
  it('drops a movement it cannot trust and keeps the rest', () => {
    const event = parseBankWebhookEvent(
      deposit({
        transactions: [
          { id: '', type: 'CREDIT', amount: 10, createdAt: '2026-09-15T12:00:00.000Z' },
          { id: 'ok', type: 'CREDIT', amount: 10, createdAt: '2026-09-15T12:00:00.000Z' },
          { id: 'bad-type', type: 'REVERSAL', amount: 10, createdAt: '2026-09-15T12:00:00.000Z' },
          { id: 'bad-amount', type: 'CREDIT', amount: 'lots', createdAt: '2026-09-15T12:00:00.000Z' },
          { id: 'bad-date', type: 'CREDIT', amount: 10, createdAt: 'whenever' },
        ],
      }),
    );

    expect(event?.accounts[0]?.movements.map((m) => m.externalId)).toEqual(['ok']);
  });

  it('keeps the movements when only the balance is unusable', () => {
    const event = parseBankWebhookEvent(deposit({ newBalance: null }));

    expect(event?.accounts[0]?.newBalance).toBeNull();
    expect(event?.accounts[0]?.movements).toHaveLength(1);
  });
});
