import { describe, expect, it, vi } from 'vitest';
import { BankAccountsService } from './bank-accounts.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const Decimal = Prisma.Decimal;

function serviceWithAccounts(accounts: { bankName: string; iban: string; currency: string; balance: string }[]) {
  const prisma = {
    bankAccount: {
      findMany: vi.fn().mockResolvedValue(
        accounts.map((account, index) => ({
          id: `acc-${index}`,
          companyId: 'company-1',
          bankName: account.bankName,
          iban: account.iban,
          currency: account.currency,
          balance: new Decimal(account.balance),
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      ),
    },
  } as unknown as PrismaService;

  return new BankAccountsService(prisma);
}

describe('BankAccountsService.findAllForCompany', () => {
  it('sums balances across every account in the same currency', async () => {
    const service = serviceWithAccounts([
      { bankName: 'Комерцијална банка', iban: 'MK07250120000058984', currency: 'MKD', balance: '124500.50' },
      { bankName: 'Стопанска банка', iban: 'MK07200000012345678', currency: 'MKD', balance: '38200.25' },
    ]);

    const overview = await service.findAllForCompany('company-1');

    expect(overview.accounts).toHaveLength(2);
    expect(overview.totalsByCurrency).toEqual([{ currency: 'MKD', total: '162700.75' }]);
  });

  it('keeps currencies apart rather than adding unlike money together', async () => {
    const service = serviceWithAccounts([
      { bankName: 'Комерцијална банка', iban: 'MK07250120000058984', currency: 'MKD', balance: '100000.00' },
      { bankName: 'Halkbank', iban: 'MK07270000000123456', currency: 'EUR', balance: '2500.00' },
    ]);

    const overview = await service.findAllForCompany('company-1');

    expect(overview.totalsByCurrency).toEqual([
      { currency: 'EUR', total: '2500.00' },
      { currency: 'MKD', total: '100000.00' },
    ]);
  });

  it('reports a zero total when the company has no accounts yet', async () => {
    const overview = await serviceWithAccounts([]).findAllForCompany('company-1');

    expect(overview.accounts).toEqual([]);
    expect(overview.totalsByCurrency).toEqual([]);
  });

  it('adds fractional balances without floating-point drift', async () => {
    const service = serviceWithAccounts([
      { bankName: 'A', iban: 'MK0700000000000001', currency: 'MKD', balance: '0.10' },
      { bankName: 'B', iban: 'MK0700000000000002', currency: 'MKD', balance: '0.20' },
]);

    const overview = await service.findAllForCompany('company-1');

    // 0.1 + 0.2 is 0.30000000000000004 in floating point.
    expect(overview.totalsByCurrency[0]!.total).toBe('0.30');
  });
});
