import { Injectable, Logger } from '@nestjs/common';
import { BankApiClient, isRecord, text } from './bank-api.client.js';
import {
  BankPayrollError,
  BankPayrollProvider,
  type PayrollAccountTotal,
  type PayrollAllocationEntry,
  type PayrollExecution,
  type PayrollIneligibleAccount,
  type PayrollQuote,
  type PayrollRequestInput,
} from './bank-payroll.provider.js';

/**
 * Pays salaries through the Mock Bank API over HTTP.
 *
 * Unlike the account-verification mock next door, this talks to something that
 * really holds the balances: it posts the run, the bank prices it, and
 * approving it debits the accounts and sends us back a signed
 * `PAYROLL_COMPLETED` webhook. Which means this file is the outbound half of a
 * round trip whose inbound half is `bank-webhook.controller.ts` — the balances
 * and the transactions come from there, never from the response here.
 *
 * Amounts cross as JSON numbers because that is the bank's contract; they are
 * turned back into decimal strings on the way in so nothing downstream does
 * arithmetic on a float.
 */
@Injectable()
export class HttpBankPayrollProvider extends BankPayrollProvider {
  private readonly logger = new Logger(HttpBankPayrollProvider.name);

  constructor(private readonly client: BankApiClient) {
    super();
  }

  isConfigured(): boolean {
    return this.client.isConfigured();
  }

  async requestPayroll(input: PayrollRequestInput): Promise<PayrollQuote> {
    const body = await this.call('POST', '/payroll/requests', {
      companyId: input.companyId,
      currency: input.currency,
      accounts: [...input.accounts],
      payments: input.payments.map((payment) => ({
        employeeId: payment.employeeId,
        employeeName: payment.employeeName,
        amount: Number(payment.amount),
      })),
    });

    return toQuote(body);
  }

  async getPayroll(requestId: string): Promise<PayrollQuote> {
    return toQuote(await this.call('GET', `/payroll/requests/${encodeURIComponent(requestId)}`));
  }

  async approvePayroll(requestId: string): Promise<PayrollExecution> {
    const body = await this.call(
      'POST',
      `/payroll/requests/${encodeURIComponent(requestId)}/approve`,
    );

    this.logger.log(`Bank executed payroll ${requestId}`);

    return {
      requestId: text(body, 'requestId') ?? requestId,
      currency: text(body, 'currency') ?? 'MKD',
      paymentCount: typeof body['paymentCount'] === 'number' ? body['paymentCount'] : 0,
      // `approve` answers with per-account transactions rather than the
      // totals `requestId` was priced with; the balances that matter arrive
      // in the webhook, so only what is present is read here.
      accountTotals: accountTotals(body['accountTotals']),
    };
  }

  /** One request, with the bank's refusal turned into a `BankPayrollError`. */
  private async call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Record<string, unknown>> {
    const response = await this.client.call(method, path, body);

    if (!response.ok) {
      const code = text(response.body, 'errorCode') ?? `HTTP_${response.status}`;
      const message = text(response.body, 'message') ?? 'The bank refused the payroll run';
      this.logger.warn(`Bank refused ${method} ${path}: ${code} — ${message}`);
      throw new BankPayrollError(code, message, uncovered(response.body['uncovered']));
    }

    return response.body;
  }
}

/** The bank sends amounts as JSON numbers; everything inland wants strings. */
function money(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '0.00';
}

function allocation(raw: unknown): PayrollAllocationEntry[] {
  if (!Array.isArray(raw)) return [];

  return raw.filter(isRecord).map((entry) => ({
    employeeId: text(entry, 'employeeId') ?? '',
    employeeName: text(entry, 'employeeName') ?? '',
    amount: money(entry['amount']),
    iban: text(entry, 'iban') ?? '',
  }));
}

function accountTotals(raw: unknown): PayrollAccountTotal[] {
  if (!Array.isArray(raw)) return [];

  return raw.filter(isRecord).map((total) => ({
    iban: text(total, 'iban') ?? '',
    currency: text(total, 'currency') ?? 'MKD',
    balanceBefore: money(total['balanceBefore']),
    totalDebited: money(total['totalDebited']),
    balanceAfter: money(total['balanceAfter']),
    paymentCount: typeof total['paymentCount'] === 'number' ? total['paymentCount'] : 0,
  }));
}

function ineligible(raw: unknown): PayrollIneligibleAccount[] {
  if (!Array.isArray(raw)) return [];

  return raw.filter(isRecord).map((account) => ({
    iban: text(account, 'iban') ?? '',
    reason: text(account, 'reason') ?? 'INELIGIBLE',
  }));
}

function uncovered(raw: unknown): { employeeId: string; employeeName: string; amount: string }[] {
  if (!Array.isArray(raw)) return [];

  return raw.filter(isRecord).map((entry) => ({
    employeeId: text(entry, 'employeeId') ?? '',
    employeeName: text(entry, 'employeeName') ?? '',
    amount: money(entry['amount']),
  }));
}

function toQuote(body: Record<string, unknown>): PayrollQuote {
  return {
    requestId: text(body, 'requestId') ?? '',
    companyId: text(body, 'companyId') ?? '',
    currency: text(body, 'currency') ?? 'MKD',
    allocation: allocation(body['allocation']),
    accountTotals: accountTotals(body['accountTotals']),
    ineligibleAccounts: ineligible(body['ineligibleAccounts']),
  };
}
