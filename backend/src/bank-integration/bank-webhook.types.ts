import { TransactionDirection } from '../generated/prisma/enums.js';

/**
 * What the bank sends us, and the one shape the rest of the app reads it as.
 *
 * The bank has two events — a transaction on one account, and a payroll run
 * that touched several — but both reduce to the same fact: money moved on some
 * accounts, and here is each account's new balance. Normalising them here means
 * the recording and notifying code has one path rather than two, and a third
 * event of the same kind needs no new path at all.
 *
 * Parsing is done by hand rather than with class-validator: this is an external
 * contract, the payload must be checked before it is trusted, and the app's
 * global `forbidNonWhitelisted` pipe would reject fields the bank adds later.
 * Being liberal about unknown fields and strict about the ones we read is what
 * keeps a bank-side addition from breaking deposits.
 */

/** One movement, as the bank reports it. */
export interface BankMovement {
  /** The bank's own id. What makes a redelivered webhook a no-op. */
  externalId: string;
  direction: TransactionDirection;
  /** Decimal string, so precision survives the rest of the way. */
  amount: string;
  description: string;
  bookedAt: Date;
}

/** Everything that happened on one account in one event. */
export interface AccountMovements {
  /** Normalised: no spaces or dashes, upper case. */
  iban: string;
  /** The balance the bank says the account now holds. Authoritative. */
  newBalance: string | null;
  movements: BankMovement[];
}

export interface BankWebhookEvent {
  eventType: 'TRANSACTION_CREATED' | 'PAYROLL_COMPLETED';
  accounts: AccountMovements[];
  /**
   * Whose accounts the bank says these are: the account's owner on a
   * transaction, the company that ran the payroll on a run. Null when the
   * bank names nobody, which matches no company here.
   */
  companyId: string | null;
  /**
   * The bank's id for a payroll run, on a `PAYROLL_COMPLETED` event. It is
   * what files the run as paid exactly once, whether the run was started from
   * this app or approved at the bank — and null on anything else.
   */
  payrollRequestId: string | null;
}

/** Matches the bank's own `normalizeIban`, so the two sides agree on a match. */
export function normalizeIban(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Money as a decimal string.
 *
 * The bank serialises amounts as JSON numbers, so some precision is already
 * spent by the time they arrive; going via the number's own string form rather
 * than through Decimal(number) at least avoids adding any more.
 */
function money(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return String(value);
}

function parseMovement(raw: unknown): BankMovement | null {
  if (!isRecord(raw)) return null;

  const { id, type, amount, description, createdAt } = raw;
  if (typeof id !== 'string' || !id) return null;
  if (type !== 'CREDIT' && type !== 'DEBIT') return null;

  const parsedAmount = money(amount);
  if (parsedAmount === null) return null;

  const bookedAt = typeof createdAt === 'string' ? new Date(createdAt) : new Date(Number.NaN);
  if (Number.isNaN(bookedAt.getTime())) return null;

  return {
    externalId: id,
    // CREDIT is money arriving, DEBIT is money leaving. The bank always sends a
    // positive amount and says which way it went.
    direction: type === 'CREDIT' ? TransactionDirection.IN : TransactionDirection.OUT,
    amount: parsedAmount,
    description: typeof description === 'string' && description ? description : 'Банкарска трансакција',
    bookedAt,
  };
}

function parseAccount(raw: unknown): AccountMovements | null {
  if (!isRecord(raw)) return null;
  if (typeof raw['iban'] !== 'string' || !raw['iban'].trim()) return null;

  const movements = Array.isArray(raw['transactions'])
    ? raw['transactions'].map(parseMovement).filter((m): m is BankMovement => m !== null)
    : [];

  if (movements.length === 0) return null;

  return {
    iban: normalizeIban(raw['iban']),
    newBalance: money(raw['newBalance']),
    movements,
  };
}

/**
 * Reads a webhook body into the normalised shape, or null when it is not
 * something we can act on.
 *
 * Null covers a malformed body and an event type we do not handle alike —
 * both mean "nothing to do", and the caller answers 200 either way so the bank
 * stops retrying something that will never succeed.
 */
export function parseBankWebhookEvent(body: unknown): BankWebhookEvent | null {
  if (!isRecord(body)) return null;

  const eventType = body['eventType'];
  const companyId = typeof body['companyId'] === 'string' && body['companyId'] ? body['companyId'] : null;

  if (eventType === 'TRANSACTION_CREATED') {
    // The whole body is one account's event.
    const account = parseAccount(body);
    return account ? { eventType, accounts: [account], companyId, payrollRequestId: null } : null;
  }

  if (eventType === 'PAYROLL_COMPLETED') {
    // One batched call carrying every account the run touched. The top-level
    // `transactions` array is the same rows flattened, so it is deliberately
    // ignored — reading both would book every salary twice.
    const accounts = Array.isArray(body['accounts'])
      ? body['accounts'].map(parseAccount).filter((a): a is AccountMovements => a !== null)
      : [];

    if (accounts.length === 0) return null;

    const requestId = body['requestId'];

    return {
      eventType,
      accounts,
      companyId,
      payrollRequestId: typeof requestId === 'string' && requestId ? requestId : null,
    };
  }

  return null;
}
