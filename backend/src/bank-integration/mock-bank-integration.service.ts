import { Injectable, Logger } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { BankIntegrationProvider } from './bank-integration.provider.js';
import { BankApiClient, bankBadResponse, text } from './bank-api.client.js';
import { BankAccountStatus, TransactionCategory, TransactionDirection } from '../generated/prisma/enums.js';
import type {
  AccountLinkRequest,
  AccountLinkResult,
  BankAccountRef,
  BankCreditLine,
  BankStatement,
  BankStatementEntry,
  BankVerificationResult,
} from './bank-integration.types.js';

/** Shape of the invented history: what an entry can be and how big it gets. */
const EXPENSE_TEMPLATES = [
  { description: 'Плати', category: TransactionCategory.SALARIES, min: 120_000_00, max: 210_000_00 },
  { description: 'Наем на деловен простор', category: TransactionCategory.RENT, min: 30_000_00, max: 55_000_00 },
  { description: 'Софтверски лиценци', category: TransactionCategory.SOFTWARE, min: 4_000_00, max: 18_000_00 },
  { description: 'Испорака и транспорт', category: TransactionCategory.LOGISTICS, min: 3_000_00, max: 22_000_00 },
  { description: 'Комунални трошоци', category: TransactionCategory.OTHER, min: 2_000_00, max: 9_000_00 },
] as const;

const INCOME_CLIENTS = [
  'Технолаб АД',
  'Комерц ДООЕЛ',
  'Градба Прилеп',
  'Медиа Принт',
  'Скопје Софтвер',
] as const;

/**
 * PLACEHOLDER — the checks and statements below talk to no bank. Every figure
 * they return is invented locally and is not connected to any real
 * institution, account or person.
 *
 * It exists so the app can be built and demoed end to end: connecting an
 * account returns a balance and a plausible statement, which the app then
 * stores as ordinary rows. Everything downstream reads those rows, so
 * replacing this with a real open-banking integration changes nothing but
 * this file and the binding in BankIntegrationModule.
 *
 * Linking is the exception, and goes to the Mock Bank API: whose account an
 * IBAN is decides whose salaries it may pay, so it must be the bank's answer
 * rather than one made up here.
 */
@Injectable()
export class MockBankIntegrationProvider extends BankIntegrationProvider {
  private readonly logger = new Logger(MockBankIntegrationProvider.name);

  constructor(private readonly client: BankApiClient) {
    super();
  }

  /** Roughly one in ten checks fails, so the unhappy path is reachable. */
  private static readonly FAILURE_RATE = 0.1;
  /** Nominal floor, in minor units of the account currency. */
  private static readonly MINIMUM_FUNDS = 50_000;
  /** Stand-in for network latency, so the UI's checking state is visible. */
  private static readonly LATENCY_MS = 900;
  private static readonly MONTHS_OF_HISTORY = 9;
  /** Share of connected accounts the bank reports as blocked. */
  private static readonly BLOCKED_RATE = 0.12;
  /** Share of connected accounts carrying an active loan. */
  private static readonly CREDIT_LINE_RATE = 0.35;

  async checkAccount(account: BankAccountRef): Promise<BankVerificationResult> {
    this.logger.debug(`Mock verification for ${account.bankName} (${account.iban})`);
    await this.simulateLatency();

    const verified = randomInt(0, 100) >= MockBankIntegrationProvider.FAILURE_RATE * 100;
    if (!verified) {
      return { verified: false, hasSufficientFunds: false, mockBalance: '0.00', provider: 'mock' };
    }

    const balanceMinor = randomInt(0, 25_000_000);
    return {
      verified: true,
      hasSufficientFunds: balanceMinor >= MockBankIntegrationProvider.MINIMUM_FUNDS,
      mockBalance: toDecimalString(balanceMinor),
      provider: 'mock',
    };
  }

  /**
   * Claims the account for the company at the bank. The first company to claim
   * a free account keeps it; asking again for one's own account is harmless.
   */
  async linkAccount(request: AccountLinkRequest): Promise<AccountLinkResult> {
    const { ok, body } = await this.client.call('POST', '/accounts/verify', {
      iban: request.iban,
      companyId: request.companyId,
      holderName: request.holderName,
    });

    const errorCode = text(body, 'errorCode');
    if (errorCode === 'ACCOUNT_NOT_FOUND' || errorCode === 'INVALID_IBAN_FORMAT') return { outcome: 'not_found' };
    if (errorCode === 'ACCOUNT_ALREADY_LINKED') return { outcome: 'linked_elsewhere' };
    if (errorCode === 'ACCOUNT_CLOSED') return { outcome: 'closed' };

    const linkStatus = text(body, 'linkStatus');
    if (
      ok &&
      body['exists'] === true &&
      (linkStatus === 'CLAIMED' || linkStatus === 'ALREADY_YOURS') &&
      text(body, 'companyId') === request.companyId
    ) {
      return { outcome: 'linked' };
    }

    this.logger.error(`Unexpected answer linking ${request.iban}: ${errorCode ?? linkStatus ?? 'no status'}`);
    throw bankBadResponse();
  }

  /**
   * Builds a plausible statement: a couple of client payments in and a spread
   * of recurring costs out, every month for the last nine. The closing balance
   * is derived from those entries so the figure and the history agree.
   */
  async fetchStatement(account: BankAccountRef): Promise<BankStatement> {
    this.logger.debug(`Mock statement for ${account.bankName} (${account.iban})`);
    await this.simulateLatency();

    const entries: BankStatementEntry[] = [];
    let balanceMinor = randomInt(40_000_00, 120_000_00); // opening balance
    const now = new Date();

    for (let monthsAgo = MockBankIntegrationProvider.MONTHS_OF_HISTORY - 1; monthsAgo >= 0; monthsAgo--) {
      const month = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
      // A statement never contains future entries, so the running month only
      // books up to today.
      const lastDay = monthsAgo === 0 ? now.getDate() : 27;

      for (let i = 0; i < randomInt(2, 4); i++) {
        const amountMinor = randomInt(60_000_00, 260_000_00);
        balanceMinor += amountMinor;
        entries.push({
          description: INCOME_CLIENTS[randomInt(0, INCOME_CLIENTS.length)]!,
          category: TransactionCategory.INVOICE,
          direction: TransactionDirection.IN,
          amount: toDecimalString(amountMinor),
          bookedAt: dayIn(month, randomInt(1, lastDay + 1)),
        });
      }

      for (const template of EXPENSE_TEMPLATES) {
        const amountMinor = randomInt(template.min, template.max);
        balanceMinor -= amountMinor;
        entries.push({
          description: template.description,
          category: template.category,
          direction: TransactionDirection.OUT,
          amount: toDecimalString(amountMinor),
          bookedAt: dayIn(month, randomInt(1, lastDay + 1)),
        });
      }
    }

    entries.sort((a, b) => b.bookedAt.getTime() - a.bookedAt.getTime());

    return {
      // A mock account should never read as overdrawn.
      balance: toDecimalString(Math.max(balanceMinor, 0)),
      status: this.inventStatus(),
      creditLine: this.inventCreditLine(),
      entries,
      provider: 'mock',
    };
  }

  /** Mostly ACTIVE, so the blocked-account treatment is still reachable. */
  private inventStatus(): BankAccountStatus {
    return randomInt(0, 100) < MockBankIntegrationProvider.BLOCKED_RATE * 100
      ? BankAccountStatus.BLOCKED
      : BankAccountStatus.ACTIVE;
  }

  /**
   * Roughly one account in three carries a loan, and it is part-way through
   * repayment — the remaining balance follows from the instalments left, so the
   * figure and the progress bar agree.
   */
  private inventCreditLine(): BankCreditLine | null {
    if (randomInt(0, 100) >= MockBankIntegrationProvider.CREDIT_LINE_RATE * 100) return null;

    const totalInstallments = [12, 24, 36, 48, 60][randomInt(0, 5)]!;
    const installmentsPaid = randomInt(1, totalInstallments);
    const creditAmountMinor = randomInt(300_000_00, 3_000_000_00);
    const installmentMinor = Math.round(creditAmountMinor / totalInstallments);

    const nextPaymentDate = new Date();
    nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1, randomInt(1, 28));
    nextPaymentDate.setHours(12, 0, 0, 0);

    return {
      creditAmount: toDecimalString(creditAmountMinor),
      remainingBalance: toDecimalString(installmentMinor * (totalInstallments - installmentsPaid)),
      nextPaymentDate,
      installmentAmount: toDecimalString(installmentMinor),
      totalInstallments,
      installmentsPaid,
    };
  }

  private simulateLatency(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, MockBankIntegrationProvider.LATENCY_MS));
  }
}

/** Minor units keep invented figures free of floating-point artefacts. */
function toDecimalString(minorUnits: number): string {
  return (minorUnits / 100).toFixed(2);
}

function dayIn(month: Date, day: number): Date {
  return new Date(month.getFullYear(), month.getMonth(), day, 12);
}
