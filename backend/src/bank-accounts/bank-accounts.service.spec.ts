import { describe, expect, it, vi } from 'vitest';
import { BankAccountsService } from './bank-accounts.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { BankIntegrationProvider } from '../bank-integration/bank-integration.provider.js';
import type { NotificationsService } from '../notifications/notifications.service.js';

/**
 * Connecting an account announces anything booked today. Most cases here are
 * not about that, so the notifier is stubbed — but the stub is inspectable,
 * because deciding what a fresh import is worth announcing is this service's
 * job rather than the notifier's.
 */
function silentNotifier(): NotificationsService {
  return { transactionsRecorded: vi.fn() } as unknown as NotificationsService;
}

/** The rows handed to the notifier by the last connect. */
function announced(notifications: NotificationsService) {
  const calls = (notifications.transactionsRecorded as ReturnType<typeof vi.fn>).mock.calls;
  return (calls[0]?.[2] ?? []) as { id: string }[];
}

const Decimal = Prisma.Decimal;

interface StubAccount {
  bankName: string;
  iban: string;
  currency: string;
  balance: string;
  status?: string;
  creditLine?: {
    creditAmount: Prisma.Decimal;
    remainingBalance: Prisma.Decimal;
    nextPaymentDate: Date;
    installmentAmount: Prisma.Decimal;
    totalInstallments: number;
    installmentsPaid: number;
  } | null;
}

function serviceWithAccounts(accounts: StubAccount[]) {
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
          status: account.status ?? "ACTIVE",
          creditLine: account.creditLine ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      ),
    },
  } as unknown as PrismaService;

  // These cases only exercise reads, so the bank integration is never called;
  // it is stubbed purely to satisfy the constructor.
  const bank = { fetchStatement: vi.fn() } as unknown as BankIntegrationProvider;

  return new BankAccountsService(prisma, bank, silentNotifier());
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

describe('BankAccountsService — account standing and loans', () => {
  it('passes the bank-reported status through to the caller', async () => {
    const service = serviceWithAccounts([
      { bankName: 'A', iban: 'MK0700000000000001', currency: 'MKD', balance: '10.00', status: 'BLOCKED' },
      { bankName: 'B', iban: 'MK0700000000000002', currency: 'MKD', balance: '10.00' },
    ]);

    const overview = await service.findAllForCompany('company-1');

    expect(overview.accounts[0]!.status).toBe('BLOCKED');
    expect(overview.accounts[1]!.status).toBe('ACTIVE');
  });

  it('reports no loan as null rather than a zeroed-out one', async () => {
    const service = serviceWithAccounts([
      { bankName: 'A', iban: 'MK0700000000000001', currency: 'MKD', balance: '10.00' },
    ]);

    const overview = await service.findAllForCompany('company-1');

    expect(overview.accounts[0]!.creditLine).toBeNull();
  });

  it('serializes a loan as decimal strings and a plain date', async () => {
    const service = serviceWithAccounts([
      {
        bankName: 'A',
        iban: 'MK0700000000000001',
        currency: 'MKD',
        balance: '10.00',
        creditLine: {
          creditAmount: new Decimal('600000'),
          remainingBalance: new Decimal('184200.5'),
          nextPaymentDate: new Date(2026, 9, 1, 12),
          installmentAmount: new Decimal('25000'),
          totalInstallments: 24,
          installmentsPaid: 9,
        },
      },
    ]);

    const overview = await service.findAllForCompany('company-1');

    expect(overview.accounts[0]!.creditLine).toEqual({
      creditAmount: '600000.00',
      remainingBalance: '184200.50',
      nextPaymentDate: '2026-10-01',
      installmentAmount: '25000.00',
      totalInstallments: 24,
      installmentsPaid: 9,
    });
  });

  it('stores the status and the loan when an account is connected', async () => {
    const created = {
      id: 'acc-1',
      bankName: 'A',
      iban: 'MK0700000000000001',
      currency: 'MKD',
      balance: new Decimal('1000'),
      status: 'BLOCKED',
      creditLine: null,
      transactions: [],
    };
    const prisma = {
      companyMembership: {
        findFirst: vi.fn().mockResolvedValue({
          user: { firstName: 'Столе', lastName: 'Николов' },
        }),
      },
      bankAccount: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    } as unknown as PrismaService;

    const bank = {
      linkAccount: vi.fn().mockResolvedValue({ outcome: 'linked' }),
      fetchStatement: vi.fn().mockResolvedValue({
        balance: '1000.00',
        status: 'BLOCKED',
        creditLine: {
          creditAmount: '600000.00',
          remainingBalance: '184200.00',
          nextPaymentDate: new Date(2026, 9, 1, 12),
          installmentAmount: '25000.00',
          totalInstallments: 24,
          installmentsPaid: 9,
        },
        entries: [],
        provider: 'mock',
      }),
    } as unknown as BankIntegrationProvider;

    const service = new BankAccountsService(prisma, bank, silentNotifier());
    await service.create('company-1', { bankName: 'A', iban: 'MK0700000000000001', currency: 'MKD' } as never);

    const data = (prisma.bankAccount.create as ReturnType<typeof vi.fn>).mock.calls[0]![0].data;
    expect(data.status).toBe('BLOCKED');
    expect(data.creditLine.create.totalInstallments).toBe(24);
    expect(data.creditLine.create.remainingBalance.toFixed(2)).toBe('184200.00');
  });

  it('writes no loan row when the bank reports none', async () => {
    const prisma = {
      companyMembership: {
        findFirst: vi.fn().mockResolvedValue({
          user: { firstName: 'Столе', lastName: 'Николов' },
        }),
      },
      bankAccount: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'acc-1',
          bankName: 'A',
          iban: 'MK0700000000000001',
          currency: 'MKD',
          balance: new Decimal('1000'),
          status: 'ACTIVE',
          creditLine: null,
          transactions: [],
        }),
      },
    } as unknown as PrismaService;

    const bank = {
      linkAccount: vi.fn().mockResolvedValue({ outcome: 'linked' }),
      fetchStatement: vi.fn().mockResolvedValue({
        balance: '1000.00',
        status: 'ACTIVE',
        creditLine: null,
        entries: [],
        provider: 'mock',
      }),
    } as unknown as BankIntegrationProvider;

    const service = new BankAccountsService(prisma, bank, silentNotifier());
    const result = await service.create('company-1', {
      bankName: 'A',
      iban: 'MK0700000000000001',
      currency: 'MKD',
    } as never);

    const data = (prisma.bankAccount.create as ReturnType<typeof vi.fn>).mock.calls[0]![0].data;
    expect(data.creditLine).toBeUndefined();
    expect(result.creditLine).toBeNull();
  });
});

describe('BankAccountsService — holder and per-account reads', () => {
  it('puts a connected account in the name of the company owner', async () => {
    const prisma = {
      companyMembership: {
        findFirst: vi.fn().mockResolvedValue({
          user: { firstName: 'Столе', lastName: 'Николов' },
        }),
      },
      bankAccount: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'acc-1',
          bankName: 'A',
          iban: 'MK0700000000000001',
          holderName: 'Столе Николов',
          currency: 'MKD',
          balance: new Decimal('1000'),
          status: 'ACTIVE',
          creditLine: null,
          transactions: [],
        }),
      },
    } as unknown as PrismaService;

    const bank = {
      linkAccount: vi.fn().mockResolvedValue({ outcome: 'linked' }),
      fetchStatement: vi.fn().mockResolvedValue({
        balance: '1000.00',
        status: 'ACTIVE',
        creditLine: null,
        entries: [],
        provider: 'mock',
      }),
    } as unknown as BankIntegrationProvider;

    const service = new BankAccountsService(prisma, bank, silentNotifier());
    const result = await service.create('company-1', {
      bankName: 'A',
      iban: 'MK0700000000000001',
      currency: 'MKD',
    } as never);

    const data = (prisma.bankAccount.create as ReturnType<typeof vi.fn>).mock.calls[0]![0].data;
    expect(data.holderName).toBe('Столе Николов');
    expect(result.holderName).toBe('Столе Николов');
  });

  it('leaves the holder unset when the company has no owner on record', async () => {
    const prisma = {
      companyMembership: { findFirst: vi.fn().mockResolvedValue(null) },
      bankAccount: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'acc-1',
          bankName: 'A',
          iban: 'MK0700000000000001',
          holderName: null,
          currency: 'MKD',
          balance: new Decimal('0'),
          status: 'ACTIVE',
          creditLine: null,
          transactions: [],
        }),
      },
    } as unknown as PrismaService;

    const bank = {
      linkAccount: vi.fn().mockResolvedValue({ outcome: 'linked' }),
      fetchStatement: vi.fn().mockResolvedValue({
        balance: '0.00',
        status: 'ACTIVE',
        creditLine: null,
        entries: [],
        provider: 'mock',
      }),
    } as unknown as BankIntegrationProvider;

    const service = new BankAccountsService(prisma, bank, silentNotifier());
    await service.create('company-1', {
      bankName: 'A',
      iban: 'MK0700000000000001',
      currency: 'MKD',
    } as never);

    const data = (prisma.bankAccount.create as ReturnType<typeof vi.fn>).mock.calls[0]![0].data;
    expect(data.holderName).toBeNull();
  });

  it('refuses to read an account that belongs to another company', async () => {
    const prisma = {
      bankAccount: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;

    const service = new BankAccountsService(prisma, {} as BankIntegrationProvider, silentNotifier());

    await expect(service.findOneForCompany('company-1', 'acc-other')).rejects.toThrow(
      /No such account/,
    );
    // The lookup is scoped by company, never by id alone.
    expect((prisma.bankAccount.findFirst as ReturnType<typeof vi.fn>).mock.calls[0]![0].where).toEqual({
      id: 'acc-other',
      companyId: 'company-1',
    });
  });

  it('returns only that account transactions, newest first', async () => {
    const prisma = {
      bankAccount: { findFirst: vi.fn().mockResolvedValue({ id: 'acc-1' }) },
      transaction: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'tx-1',
            description: 'Плати',
            category: 'SALARIES',
            direction: 'OUT',
            amount: new Decimal('1000'),
            bookedAt: new Date(2026, 8, 14, 12),
          },
        ]),
      },
    } as unknown as PrismaService;

    const service = new BankAccountsService(prisma, {} as BankIntegrationProvider, silentNotifier());
    const result = await service.findTransactions('company-1', 'acc-1');

    const query = (prisma.transaction.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(query.where).toEqual({ bankAccountId: 'acc-1' });
    expect(query.orderBy).toEqual({ bookedAt: 'desc' });
    expect(result.transactions[0]).toEqual({
      id: 'tx-1',
      description: 'Плати',
      category: 'SALARIES',
      direction: 'OUT',
      amount: '1000.00',
      bookedAt: '2026-09-14',
    });
  });

  it('caps how many transactions one request can pull', async () => {
    const prisma = {
      bankAccount: { findFirst: vi.fn().mockResolvedValue({ id: 'acc-1' }) },
      transaction: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;

    const service = new BankAccountsService(prisma, {} as BankIntegrationProvider, silentNotifier());
    await service.findTransactions('company-1', 'acc-1', 5000);

    expect((prisma.transaction.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0].take).toBe(200);
  });
});

describe('BankAccountsService.create — what a fresh connection announces', () => {
  const today = new Date();
  const lastYear = new Date(today.getFullYear() - 1, today.getMonth(), 1, 12);

  function serviceWithStatement(entries: { id: string; bookedAt: Date }[]) {
    const prisma = {
      companyMembership: { findFirst: vi.fn().mockResolvedValue(null) },
      bankAccount: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'acc-1',
          bankName: 'A',
          iban: 'MK0700000000000001',
          currency: 'MKD',
          balance: new Decimal('1000'),
          status: 'ACTIVE',
          creditLine: null,
          transactions: entries.map((entry) => ({
            id: entry.id,
            direction: 'IN',
            amount: new Decimal('500'),
            description: 'Уплата',
            bookedAt: entry.bookedAt,
          })),
        }),
      },
    } as unknown as PrismaService;

    const bank = {
      linkAccount: vi.fn().mockResolvedValue({ outcome: 'linked' }),
      fetchStatement: vi.fn().mockResolvedValue({
        balance: '1000.00',
        status: 'ACTIVE',
        creditLine: null,
        entries: [],
        provider: 'mock',
      }),
    } as unknown as BankIntegrationProvider;

    const notifications = silentNotifier();
    return { service: new BankAccountsService(prisma, bank, notifications), notifications };
  }

  // Connecting an account pulls its whole history at once. Announcing a year of
  // past transactions would bury whatever actually just happened.
  it('says nothing about imported history', async () => {
    const { service, notifications } = serviceWithStatement([
      { id: 'old-1', bookedAt: lastYear },
      { id: 'old-2', bookedAt: new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000) },
    ]);

    await service.create('company-1', { bankName: 'A', iban: 'MK0700000000000001' } as never);

    expect(announced(notifications)).toHaveLength(0);
  });

  it('announces what was booked today, which is what a live feed delivers', async () => {
    const { service, notifications } = serviceWithStatement([
      { id: 'old-1', bookedAt: lastYear },
      { id: 'fresh', bookedAt: today },
    ]);

    await service.create('company-1', { bankName: 'A', iban: 'MK0700000000000001' } as never);

    expect(announced(notifications).map((row) => row.id)).toEqual(['fresh']);
  });
});

/**
 * Knowing an IBAN is not owning it — IBANs are printed on every invoice — so
 * an account is only connected once the bank confirms it is this company's.
 */
describe('BankAccountsService.create — the bank decides whose account it is', () => {
  const IBAN = 'MK07300000000042425';

  function build(options: { onFileFor?: string; bankSays?: string } = {}) {
    const prisma = {
      companyMembership: {
        findFirst: vi.fn().mockResolvedValue({ user: { firstName: 'Ана', lastName: 'Тест' } }),
      },
      bankAccount: {
        findUnique: vi.fn().mockResolvedValue(options.onFileFor ? { companyId: options.onFileFor } : null),
        create: vi.fn(),
      },
    } as unknown as PrismaService;
    const bank = {
      linkAccount: vi.fn().mockResolvedValue({ outcome: options.bankSays ?? 'linked' }),
      fetchStatement: vi.fn(),
    };
    const service = new BankAccountsService(prisma, bank as unknown as BankIntegrationProvider, silentNotifier());
    const connect = () => service.create('company-1', { bankName: 'Банка', iban: IBAN } as never);
    return { prisma, bank, connect };
  }

  it('asks the bank to link the account to this company, in the owner’s name', async () => {
    const { bank, connect } = build({ bankSays: 'not_found' });
    await connect().catch(() => undefined);

    expect(bank.linkAccount).toHaveBeenCalledWith({ companyId: 'company-1', iban: IBAN, holderName: 'Ана Тест' });
  });

  it('refuses an IBAN another company here already has, without asking the bank', async () => {
    const { prisma, bank, connect } = build({ onFileFor: 'company-2' });

    await expect(connect()).rejects.toMatchObject({
      status: 409,
      response: { errorCode: 'ACCOUNT_LINKED_ELSEWHERE' },
    });
    expect(bank.linkAccount).not.toHaveBeenCalled();
    expect(prisma.bankAccount.create).not.toHaveBeenCalled();
  });

  it.each([
    ['linked_elsewhere', 409, 'ACCOUNT_LINKED_ELSEWHERE'],
    ['not_found', 422, 'BANK_ACCOUNT_NOT_FOUND'],
    ['closed', 422, 'BANK_ACCOUNT_CLOSED'],
  ])('stores nothing when the bank answers %s', async (bankSays, status, errorCode) => {
    const { prisma, bank, connect } = build({ bankSays });

    await expect(connect()).rejects.toMatchObject({ status, response: { errorCode } });
    expect(bank.fetchStatement).not.toHaveBeenCalled();
    expect(prisma.bankAccount.create).not.toHaveBeenCalled();
  });
});
