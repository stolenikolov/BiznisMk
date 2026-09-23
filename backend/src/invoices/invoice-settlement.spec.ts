import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { InvoiceDirection } from '../generated/prisma/enums.js';
import { chooseSettlementAccount, type SettlementAccount } from './invoice-settlement.js';

const Decimal = Prisma.Decimal;

function account(overrides: Partial<SettlementAccount> = {}): SettlementAccount {
  return {
    id: 'acc-1',
    iban: 'MK07200000000000001',
    bankName: 'Стопанска банка',
    currency: 'MKD',
    balance: new Decimal('100000'),
    status: 'ACTIVE',
    ...overrides,
  };
}

const IN = InvoiceDirection.OUTGOING; // we issued it → money comes in
const OUT = InvoiceDirection.INCOMING; // supplier bill → money goes out

describe('chooseSettlementAccount — money coming in', () => {
  it('lands on the first account, whatever its balance', () => {
    const result = chooseSettlementAccount(
      [account({ id: 'first', balance: new Decimal('0') }), account({ id: 'second' })],
      IN,
      new Decimal('5000'),
      'MKD',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.account.id).toBe('first');
  });

  it('skips a blocked account and takes the next one', () => {
    const result = chooseSettlementAccount(
      [account({ id: 'blocked', status: 'BLOCKED' }), account({ id: 'usable' })],
      IN,
      new Decimal('5000'),
      'MKD',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.account.id).toBe('usable');
  });

  it('will not put denars into a euro account', () => {
    const result = chooseSettlementAccount(
      [account({ id: 'eur', currency: 'EUR' })],
      IN,
      new Decimal('5000'),
      'MKD',
    );

    expect(result).toEqual({ ok: false, reason: 'NO_ELIGIBLE_ACCOUNT' });
  });

  it('reports having nowhere to put the money', () => {
    expect(chooseSettlementAccount([], IN, new Decimal('1'), 'MKD')).toEqual({
      ok: false,
      reason: 'NO_ELIGIBLE_ACCOUNT',
    });
  });
});

describe('chooseSettlementAccount — money going out', () => {
  it('pays from the first account that can cover the whole bill', () => {
    const result = chooseSettlementAccount(
      [
        account({ id: 'thin', balance: new Decimal('1000') }),
        account({ id: 'fat', balance: new Decimal('90000') }),
      ],
      OUT,
      new Decimal('50000'),
      'MKD',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.account.id).toBe('fat');
  });

  it('prefers the earlier account when both can cover it', () => {
    const result = chooseSettlementAccount(
      [
        account({ id: 'first', balance: new Decimal('60000') }),
        account({ id: 'second', balance: new Decimal('90000') }),
      ],
      OUT,
      new Decimal('50000'),
      'MKD',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.account.id).toBe('first');
  });

  it('pays when the balance covers the bill exactly', () => {
    const result = chooseSettlementAccount(
      [account({ balance: new Decimal('50000') })],
      OUT,
      new Decimal('50000'),
      'MKD',
    );

    expect(result.ok).toBe(true);
  });

  it('never splits a bill across two accounts', () => {
    // 40k + 40k is more than enough together, but neither can pay 50k alone.
    const result = chooseSettlementAccount(
      [
        account({ id: 'a', balance: new Decimal('40000') }),
        account({ id: 'b', balance: new Decimal('40000') }),
      ],
      OUT,
      new Decimal('50000'),
      'MKD',
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('INSUFFICIENT_FUNDS');
  });

  it('reports the shortfall against the best-placed account', () => {
    const result = chooseSettlementAccount(
      [
        account({ id: 'a', balance: new Decimal('10000') }),
        account({ id: 'b', balance: new Decimal('42500.50') }),
      ],
      OUT,
      new Decimal('50000'),
      'MKD',
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    if (result.reason !== 'INSUFFICIENT_FUNDS') throw new Error('wrong reason');
    expect(result.shortfall.toFixed(2)).toBe('7499.50');
  });

  it('will not pay out of a blocked account even when it holds enough', () => {
    const result = chooseSettlementAccount(
      [account({ status: 'BLOCKED', balance: new Decimal('900000') })],
      OUT,
      new Decimal('50000'),
      'MKD',
    );

    expect(result).toEqual({ ok: false, reason: 'NO_ELIGIBLE_ACCOUNT' });
  });
});
