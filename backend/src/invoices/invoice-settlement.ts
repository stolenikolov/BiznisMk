import { Prisma } from '../generated/prisma/client.js';
import { InvoiceDirection } from '../generated/prisma/enums.js';

/**
 * Which account an invoice settles against.
 *
 * Kept pure so the rule can be tested without a database: this decides where
 * real money lands or leaves, and it is the same first-fit rule payroll uses —
 * one account covers the whole amount, never two.
 */

export interface SettlementAccount {
  id: string;
  iban: string;
  bankName: string;
  currency: string;
  balance: Prisma.Decimal;
  status: string;
}

export type SettlementFailure =
  | { reason: 'NO_ELIGIBLE_ACCOUNT' }
  | { reason: 'INSUFFICIENT_FUNDS'; shortfall: Prisma.Decimal };

export type SettlementChoice =
  | { ok: true; account: SettlementAccount }
  | ({ ok: false } & SettlementFailure);

/**
 * @param accounts the company's accounts, oldest first — "the first card".
 * @param direction OUTGOING money comes in, INCOMING money goes out.
 */
export function chooseSettlementAccount(
  accounts: SettlementAccount[],
  direction: InvoiceDirection,
  amount: Prisma.Decimal,
  currency: string,
): SettlementChoice {
  // A blocked or closed account cannot move money, and denars cannot land in a
  // euro account, so neither is a candidate at all.
  const eligible = accounts.filter(
    (account) => account.status === 'ACTIVE' && account.currency === currency,
  );

  if (eligible.length === 0) {
    return { ok: false, reason: 'NO_ELIGIBLE_ACCOUNT' };
  }

  if (direction === InvoiceDirection.OUTGOING) {
    // Money coming in fits anywhere: the first account takes it.
    return { ok: true, account: eligible[0]! };
  }

  const payer = eligible.find((account) => account.balance.greaterThanOrEqualTo(amount));
  if (payer) {
    return { ok: true, account: payer };
  }

  // Paying half a bill from one account and half from another is not how a
  // transfer works, so the whole payment is refused — reporting how much the
  // best-placed account is short by.
  const richest = eligible.reduce((best, account) =>
    account.balance.greaterThan(best.balance) ? account : best,
  );

  return {
    ok: false,
    reason: 'INSUFFICIENT_FUNDS',
    shortfall: amount.minus(richest.balance),
  };
}
