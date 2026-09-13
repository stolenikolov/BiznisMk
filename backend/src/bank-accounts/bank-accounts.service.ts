import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { BankIntegrationProvider } from '../bank-integration/bank-integration.provider.js';
import type { CreateBankAccountDto } from './dto/create-bank-account.dto.js';

const Decimal = Prisma.Decimal;

export interface BankAccountsOverview {
  accounts: {
    id: string;
    bankName: string;
    iban: string;
    currency: string;
    balance: string;
  }[];
  /** Combined balance per currency — summing across currencies would be wrong. */
  totalsByCurrency: { currency: string; total: string }[];
}

@Injectable()
export class BankAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bank: BankIntegrationProvider,
  ) {}

  async findAllForCompany(companyId: string): Promise<BankAccountsOverview> {
    const accounts = await this.prisma.bankAccount.findMany({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
    });

    const totals = new Map<string, Prisma.Decimal>();
    for (const account of accounts) {
      const running = totals.get(account.currency) ?? new Decimal(0);
      totals.set(account.currency, running.add(account.balance));
    }

    return {
      accounts: accounts.map((account) => ({
        id: account.id,
        bankName: account.bankName,
        iban: account.iban,
        currency: account.currency,
        balance: account.balance.toFixed(2),
      })),
      totalsByCurrency: [...totals.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([currency, total]) => ({ currency, total: total.toFixed(2) })),
    };
  }

  /**
   * Connects an account: pulls its statement from whichever bank integration
   * is bound, then stores the account and its history together. The rows are
   * ordinary transactions, so the dashboard reads them the same way it would
   * read a real feed.
   */
  async create(companyId: string, dto: CreateBankAccountDto) {
    const existing = await this.prisma.bankAccount.findUnique({
      where: { companyId_iban: { companyId, iban: dto.iban } },
    });
    if (existing) {
      throw new ConflictException('This account is already registered for the company');
    }

    const statement = await this.bank.fetchStatement({ bankName: dto.bankName, iban: dto.iban });

    const account = await this.prisma.bankAccount.create({
      data: {
        companyId,
        bankName: dto.bankName,
        iban: dto.iban,
        currency: dto.currency ?? 'MKD',
        balance: new Decimal(statement.balance),
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
      },
    });

    return {
      id: account.id,
      bankName: account.bankName,
      iban: account.iban,
      currency: account.currency,
      balance: account.balance.toFixed(2),
      importedTransactions: statement.entries.length,
    };
  }
}
