import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { CompanyRole } from '../generated/prisma/enums.js';
import type { BankAccountStatus } from '../generated/prisma/enums.js';
import { BankIntegrationProvider } from '../bank-integration/bank-integration.provider.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { isFreshBooking } from '../notifications/notification-schedule.js';
import type { CreateBankAccountDto } from './dto/create-bank-account.dto.js';

const Decimal = Prisma.Decimal;

/** An active loan on one account, or null when the bank reports none. */
export interface CreditLineView {
  creditAmount: string;
  remainingBalance: string;
  nextPaymentDate: string;
  installmentAmount: string;
  totalInstallments: number;
  installmentsPaid: number;
}

export interface BankAccountView {
  id: string;
  bankName: string;
  iban: string;
  /** The company owner the account is in the name of. */
  holderName: string | null;
  currency: string;
  balance: string;
  status: BankAccountStatus;
  creditLine: CreditLineView | null;
}

export interface BankAccountsOverview {
  accounts: BankAccountView[];
  /** Combined balance per currency — summing across currencies would be wrong. */
  totalsByCurrency: { currency: string; total: string }[];
}

@Injectable()
export class BankAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bank: BankIntegrationProvider,
    private readonly notifications: NotificationsService,
  ) {}

  async findAllForCompany(companyId: string): Promise<BankAccountsOverview> {
    const accounts = await this.prisma.bankAccount.findMany({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
      include: { creditLine: true },
    });

    const totals = new Map<string, Prisma.Decimal>();
    for (const account of accounts) {
      const running = totals.get(account.currency) ?? new Decimal(0);
      totals.set(account.currency, running.add(account.balance));
    }

    return {
      accounts: accounts.map(toAccountView),
      totalsByCurrency: [...totals.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([currency, total]) => ({ currency, total: total.toFixed(2) })),
    };
  }

  /** One account with everything its own page shows. */
  async findOneForCompany(companyId: string, accountId: string): Promise<BankAccountView> {
    const account = await this.prisma.bankAccount.findFirst({
      where: { id: accountId, companyId },
      include: { creditLine: true },
    });

    if (!account) {
      throw new NotFoundException('No such account for this company');
    }

    return toAccountView(account);
  }

  /** That account's own statement, newest first. */
  async findTransactions(companyId: string, accountId: string, take = 50) {
    const account = await this.prisma.bankAccount.findFirst({
      where: { id: accountId, companyId },
      select: { id: true },
    });

    if (!account) {
      throw new NotFoundException('No such account for this company');
    }

    const rows = await this.prisma.transaction.findMany({
      where: { bankAccountId: account.id },
      orderBy: { bookedAt: 'desc' },
      take: Math.min(Math.max(take, 1), 200),
    });

    return {
      transactions: rows.map((row) => ({
        id: row.id,
        description: row.description,
        category: row.category,
        direction: row.direction,
        amount: row.amount.toFixed(2),
        bookedAt: row.bookedAt.toISOString().slice(0, 10),
      })),
    };
  }

  /**
   * Connects an account: the bank first confirms it is this company's, then
   * its statement is pulled and stored with the account. The rows are
   * ordinary transactions, so the dashboard reads them the same way it would
   * read a real feed.
   *
   * The bank's confirmation is what stops a company from connecting someone
   * else's IBAN — printed on every invoice — and paying salaries from it.
   */
  async create(companyId: string, dto: CreateBankAccountDto) {
    const existing = await this.prisma.bankAccount.findUnique({
      where: { iban: dto.iban },
      select: { companyId: true },
    });
    if (existing?.companyId === companyId) {
      throw new ConflictException('This account is already registered for the company');
    }
    if (existing) throw linkedElsewhere();

    // A business account stands in the name of the company's owner.
    const holderName = await this.companyOwnerName(companyId);
    const link = await this.bank.linkAccount({ companyId, iban: dto.iban, holderName: holderName ?? '' });

    if (link.outcome === 'linked_elsewhere') throw linkedElsewhere();
    if (link.outcome === 'not_found') {
      throw new UnprocessableEntityException({
        errorCode: 'BANK_ACCOUNT_NOT_FOUND',
        message: 'The bank has no account with this IBAN',
      });
    }
    if (link.outcome === 'closed') {
      throw new UnprocessableEntityException({
        errorCode: 'BANK_ACCOUNT_CLOSED',
        message: 'The bank reports this account as closed',
      });
    }

    const statement = await this.bank.fetchStatement({ bankName: dto.bankName, iban: dto.iban });

    const account = await this.prisma.bankAccount.create({
      data: {
        companyId,
        bankName: dto.bankName,
        iban: dto.iban,
        holderName,
        currency: dto.currency ?? 'MKD',
        balance: new Decimal(statement.balance),
        status: statement.status,
        transactions: {
          create: statement.entries.map((entry) => ({
            companyId,
            description: entry.description,
            category: entry.category,
            direction: entry.direction,
            amount: new Decimal(entry.amount),
            bookedAt: entry.bookedAt,
          })),
        },
        // Only accounts the bank reports a loan for get a row; the finance page
        // branches on its absence rather than rendering a zeroed-out loan.
        ...(statement.creditLine
          ? {
              creditLine: {
                create: {
                  creditAmount: new Decimal(statement.creditLine.creditAmount),
                  remainingBalance: new Decimal(statement.creditLine.remainingBalance),
                  nextPaymentDate: statement.creditLine.nextPaymentDate,
                  installmentAmount: new Decimal(statement.creditLine.installmentAmount),
                  totalInstallments: statement.creditLine.totalInstallments,
                  installmentsPaid: statement.creditLine.installmentsPaid,
                },
              },
            }
          : {}),
      },
      include: { creditLine: true, transactions: true },
    });

    // The statement that just arrived is mostly history: a year of past
    // transactions is not news and announcing all of it would bury whatever
    // actually just happened. Only today's bookings are announced, which is
    // also exactly what an ongoing feed delivers. Awaited rather than fired
    // and forgotten so a failure is logged in this request rather than
    // surfacing as an unhandled rejection later.
    const now = new Date();
    await this.notifications.transactionsRecorded(
      companyId,
      account,
      account.transactions
        .filter((transaction) => isFreshBooking(transaction.bookedAt, now))
        .map((transaction) => ({
          id: transaction.id,
          direction: transaction.direction,
          amount: transaction.amount.toFixed(2),
          description: transaction.description,
          bookedAt: transaction.bookedAt,
        })),
    );

    return { ...toAccountView(account), importedTransactions: statement.entries.length };
  }

  /**
   * The CEO of the company — its owner, and therefore the name the account is
   * held in. The earliest CEO membership is the company's creator.
   */
  private async companyOwnerName(companyId: string): Promise<string | null> {
    const owner = await this.prisma.companyMembership.findFirst({
      where: { companyId, role: CompanyRole.CEO },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    if (!owner) return null;
    return `${owner.user.firstName} ${owner.user.lastName}`.trim() || null;
  }
}

/**
 * Said plainly: the account's real owner needs to know why it cannot be
 * connected, and the bank gives the same answer to anyone who asks it.
 */
function linkedElsewhere() {
  return new ConflictException({
    errorCode: 'ACCOUNT_LINKED_ELSEWHERE',
    message: 'This account is linked to another company',
  });
}

function toAccountView(
  account: {
    id: string;
    bankName: string;
    iban: string;
    holderName: string | null;
    currency: string;
    balance: Prisma.Decimal;
    status: BankAccountStatus;
  } & { creditLine?: Parameters<typeof toCreditLineView>[0] },
): BankAccountView {
  return {
    id: account.id,
    bankName: account.bankName,
    iban: account.iban,
    holderName: account.holderName,
    currency: account.currency,
    balance: account.balance.toFixed(2),
    status: account.status,
    creditLine: toCreditLineView(account.creditLine ?? null),
  };
}

function toCreditLineView(
  creditLine: {
    creditAmount: Prisma.Decimal;
    remainingBalance: Prisma.Decimal;
    nextPaymentDate: Date;
    installmentAmount: Prisma.Decimal;
    totalInstallments: number;
    installmentsPaid: number;
  } | null,
): CreditLineView | null {
  if (!creditLine) return null;

  return {
    creditAmount: creditLine.creditAmount.toFixed(2),
    remainingBalance: creditLine.remainingBalance.toFixed(2),
    nextPaymentDate: creditLine.nextPaymentDate.toISOString().slice(0, 10),
    installmentAmount: creditLine.installmentAmount.toFixed(2),
    totalInstallments: creditLine.totalInstallments,
    installmentsPaid: creditLine.installmentsPaid,
  };
}
