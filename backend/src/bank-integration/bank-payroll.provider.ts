/**
 * The seam for paying salaries at the bank.
 *
 * Separate from `BankIntegrationProvider`, which answers questions about an
 * account (does it exist, what is on it). This one moves money, and it is the
 * only place in the app that does. Same rule as its neighbour: nothing outside
 * this folder names an implementation.
 */

/** One salary, as the bank is asked to pay it. */
export interface PayrollPayment {
  /** Our employee id, so the bank's allocation can be matched back. */
  employeeId: string;
  employeeName: string;
  /** Decimal string, so precision survives the hand-off. */
  amount: string;
}

export interface PayrollRequestInput {
  companyId: string;
  currency: string;
  payments: readonly PayrollPayment[];
  /** Every IBAN the company has connected; the bank picks which ones pay. */
  accounts: readonly string[];
}

/** Which account the bank assigned one salary to. */
export interface PayrollAllocationEntry {
  employeeId: string;
  employeeName: string;
  amount: string;
  iban: string;
}

/** What one account carries in the run, before and after. */
export interface PayrollAccountTotal {
  iban: string;
  currency: string;
  balanceBefore: string;
  totalDebited: string;
  balanceAfter: string;
  paymentCount: number;
}

/** An account the bank refused to use, and why. */
export interface PayrollIneligibleAccount {
  iban: string;
  reason: string;
}

/**
 * A priced run the bank is holding but has not executed. Nothing has moved
 * yet: this is the preview the owner confirms or walks away from.
 */
export interface PayrollQuote {
  requestId: string;
  companyId: string;
  currency: string;
  allocation: PayrollAllocationEntry[];
  accountTotals: PayrollAccountTotal[];
  ineligibleAccounts: PayrollIneligibleAccount[];
}

/** What came back once the money actually moved. */
export interface PayrollExecution {
  requestId: string;
  currency: string;
  paymentCount: number;
  accountTotals: PayrollAccountTotal[];
}

/**
 * Why a run could not be priced or executed, in terms the UI can explain.
 *
 * `code` is the bank's own error code — `INSUFFICIENT_FUNDS`,
 * `NO_ELIGIBLE_ACCOUNTS`, `ACCOUNT_NOT_FOUND` … — and `uncovered` names the
 * people nobody's balance could cover, which is the one case worth listing by
 * name rather than as a number.
 */
export class BankPayrollError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly uncovered: { employeeId: string; employeeName: string; amount: string }[] = [],
  ) {
    super(message);
    this.name = 'BankPayrollError';
  }
}

export abstract class BankPayrollProvider {
  /** Whether the app is configured to reach the bank at all. */
  abstract isConfigured(): boolean;

  /** Phase one: price the run. Moves no money. */
  abstract requestPayroll(input: PayrollRequestInput): Promise<PayrollQuote>;

  /** Reads a priced run back, to check who it belongs to before approving. */
  abstract getPayroll(requestId: string): Promise<PayrollQuote>;

  /** Phase two: execute a priced run. This is what debits the accounts. */
  abstract approvePayroll(requestId: string): Promise<PayrollExecution>;
}
