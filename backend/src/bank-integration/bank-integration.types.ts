import type {
  BankAccountStatus,
  TransactionCategory,
  TransactionDirection,
} from '../generated/prisma/enums.js';

export interface BankAccountRef {
  bankName: string;
  iban: string;
}

export interface BankVerificationResult {
  /** Whether the bank recognised the account at all. */
  verified: boolean;
  /** Whether the account holds enough to be worth tracking. */
  hasSufficientFunds: boolean;
  /** Balance the bank reports, in the account's own currency. */
  mockBalance: string;
  /** Which implementation answered — useful once a real provider exists. */
  provider: string;
}

export interface AccountLinkRequest {
  companyId: string;
  iban: string;
  /** Who the account goes into the name of: the company's owner. */
  holderName: string;
}

/**
 * The bank's answer to "this account is ours". Only `linked` lets the app
 * connect it; the others are the reasons it may not.
 */
export type AccountLinkResult =
  | { outcome: 'linked' }
  | { outcome: 'not_found' }
  | { outcome: 'linked_elsewhere' }
  | { outcome: 'closed' };

export interface BankStatementEntry {
  description: string;
  category: TransactionCategory;
  direction: TransactionDirection;
  /** Decimal string, so precision survives the hand-off. */
  amount: string;
  bookedAt: Date;
}

/**
 * An active loan against the account, as the bank reports it. Null for the
 * majority of accounts — no loan is not a zeroed-out loan.
 */
export interface BankCreditLine {
  /** Decimal strings throughout, so precision survives the hand-off. */
  creditAmount: string;
  remainingBalance: string;
  nextPaymentDate: Date;
  installmentAmount: string;
  totalInstallments: number;
  installmentsPaid: number;
}

/** What a connected account looks like to the app: balance plus history. */
export interface BankStatement {
  balance: string;
  /** Standing at the bank: a blocked account still has a statement. */
  status: BankAccountStatus;
  creditLine: BankCreditLine | null;
  entries: BankStatementEntry[];
  provider: string;
}
