import type { BankVerificationRequest, BankVerificationResult } from './bank-verification.types.js';

/**
 * The seam between the app and whoever actually confirms a bank account.
 *
 * Everything outside this folder depends on this abstract class, never on a
 * concrete implementation. Swapping the mock for a real open-banking / PSD2
 * integration means writing a new subclass and changing the one `useClass`
 * binding in BankVerificationModule — no caller changes.
 */
export abstract class BankVerificationProvider {
  abstract checkAccount(request: BankVerificationRequest): Promise<BankVerificationResult>;
}
