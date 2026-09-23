import type {
  AccountLinkRequest,
  AccountLinkResult,
  BankAccountRef,
  BankStatement,
  BankVerificationResult,
} from './bank-integration.types.js';

/**
 * The seam between the app and whoever actually holds the money.
 *
 * Everything outside this folder depends on this abstract class, never on a
 * concrete implementation. Swapping the mock for a real open-banking / PSD2
 * integration means writing a new subclass and changing the one `useClass`
 * binding in BankIntegrationModule — no caller moves.
 */
export abstract class BankIntegrationProvider {
  /** Confirms the account exists and is worth connecting. */
  abstract checkAccount(account: BankAccountRef): Promise<BankVerificationResult>;

  /**
   * Links the account to the company at the bank, which is the only one that
   * can say whose account it is. Knowing an IBAN proves nothing — it is printed
   * on every invoice — so nothing is connected without this.
   */
  abstract linkAccount(request: AccountLinkRequest): Promise<AccountLinkResult>;

  /** Balance plus booked history for a freshly connected account. */
  abstract fetchStatement(account: BankAccountRef): Promise<BankStatement>;
}
