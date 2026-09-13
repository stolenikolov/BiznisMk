export interface BankVerificationRequest {
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
