import { Injectable, Logger } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { BankIntegrationProvider } from './bank-integration.provider.js';
import { TransactionCategory, TransactionDirection } from '../generated/prisma/enums.js';
import type {
  BankAccountRef,
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
 * PLACEHOLDER — this talks to no bank. Every figure below is invented locally
 * and is not connected to any real institution, account or person.
 *
 * It exists so the app can be built and demoed end to end: connecting an
 * account returns a balance and a plausible statement, which the app then
 * stores as ordinary rows. Everything downstream reads those rows, so
 * replacing this with a real open-banking integration changes nothing but
 * this file and the binding in BankIntegrationModule.
 */
@Injectable()
export class MockBankIntegrationProvider extends BankIntegrationProvider {
  private readonly logger = new Logger(MockBankIntegrationProvider.name);

  /** Roughly one in ten checks fails, so the unhappy path is reachable. */
  private static readonly FAILURE_RATE = 0.1;
  /** Nominal floor, in minor units of the account currency. */
  private static readonly MINIMUM_FUNDS = 50_000;
  /** Stand-in for network latency, so the UI's checking state is visible. */
  private static readonly LATENCY_MS = 900;
  private static readonly MONTHS_OF_HISTORY = 9;

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
      entries,
      provider: 'mock',
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
