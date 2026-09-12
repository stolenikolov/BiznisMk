import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
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
  constructor(private readonly prisma: PrismaService) {}

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

  async create(companyId: string, dto: CreateBankAccountDto) {
    const existing = await this.prisma.bankAccount.findUnique({
      where: { companyId_iban: { companyId, iban: dto.iban } },
    });
    if (existing) {
      throw new ConflictException('This account is already registered for the company');
    }

    const account = await this.prisma.bankAccount.create({
      data: {
        companyId,
        bankName: dto.bankName,
        iban: dto.iban,
        currency: dto.currency ?? 'MKD',
        balance: new Decimal(dto.balance ?? 0),
      },
    });

    return {
      id: account.id,
      bankName: account.bankName,
      iban: account.iban,
      currency: account.currency,
      balance: account.balance.toFixed(2),
    };
  }
}
