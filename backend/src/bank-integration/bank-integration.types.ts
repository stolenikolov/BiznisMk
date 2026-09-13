import type { TransactionCategory, TransactionDirection } from '../generated/prisma/enums.js';

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

export interface BankStatementEntry {
  description: string;
  category: TransactionCategory;
  direction: TransactionDirection;
  /** Decimal string, so precision survives the hand-off. */
  amount: string;
  bookedAt: Date;
}

/** What a connected account looks like to the app: balance plus history. */
export interface BankStatement {
  balance: string;
  entries: BankStatementEntry[];
  provider: string;
}
