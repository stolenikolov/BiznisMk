import { describe, expect, it, vi } from 'vitest';
import { BankWebhookService } from './bank-webhook.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { TransactionDirection } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import type { PayrollRunService } from '../payroll/payroll-run.service.js';
import type { BankWebhookEvent } from './bank-webhook.types.js';

const Decimal = Prisma.Decimal;

const CONNECTED_ACCOUNT = {
  id: 'acc-1',
  companyId: 'co-1',
  bankName: 'Комерцијална банка',
  iban: 'MK07250120000058984',
  currency: 'MKD',
};

const duplicate = () =>
  new Prisma.PrismaClientKnownRequestError('duplicate', {
    code: 'P2002',
    clientVersion: '7.10.0',
  });

function stubPrisma(
  accounts: (typeof CONNECTED_ACCOUNT)[],
  createImpl?: ReturnType<typeof vi.fn>,
  latestOnFile: Date | null = null,
) {
  const create =
    createImpl ??
    vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: `tx-${String(create.mock.calls.length)}`,
        ...data,
        amount: new Decimal(String(data['amount'])),
      }),
    );

  return {
    bankAccount: {
      findUnique: vi.fn(({ where }: { where: { iban: string } }) =>
        Promise.resolve(accounts.find((account) => account.iban === where.iban) ?? null),
      ),
      update: vi.fn().mockResolvedValue({}),
    },
    transaction: {
      create,
      findFirst: vi.fn().mockResolvedValue(latestOnFile ? { bookedAt: latestOnFile } : null),
    },
    company: {
      findUnique: vi.fn().mockResolvedValue({ currency: 'MKD' }),
    },
  } as unknown as PrismaService;
}

function stubNotifications() {
  return { transactionsRecorded: vi.fn() } as unknown as NotificationsService;
}

/** Filing a completed payroll run is somebody else's job; this watches it happen. */
function stubPayrollRuns() {
  return {
    record: vi.fn().mockResolvedValue(undefined),
    periodFor: vi.fn().mockResolvedValue(new Date(2026, 8, 1)),
  } as unknown as PayrollRunService;
}

/** A deposit that has already been through the parser. The bank names the account's owner. */
const depositEvent = (
  iban = CONNECTED_ACCOUNT.iban,
  overrides: Partial<BankWebhookEvent['accounts'][number]> = {},
  companyId: string | null = CONNECTED_ACCOUNT.companyId,
): BankWebhookEvent => ({
  eventType: 'TRANSACTION_CREATED',
  companyId,
  payrollRequestId: null,
  accounts: [
    {
      iban,
      newBalance: '128400.50',
      movements: [
        {
          externalId: 'txn_01',
          direction: TransactionDirection.IN,
          amount: '4500',
          description: 'Simulated deposit',
          bookedAt: new Date('2026-09-15T12:30:00.000Z'),
        },
      ],
      ...overrides,
    },
  ],
});

describe('BankWebhookService.apply — a deposit on a connected account', () => {
  it('records the movement against the company that connected the account', async () => {
    const prisma = stubPrisma([CONNECTED_ACCOUNT]);
    const service = new BankWebhookService(prisma, stubNotifications(), stubPayrollRuns());

    const outcome = await service.apply(depositEvent());

    expect(outcome).toEqual({ recorded: 1, duplicates: 0, unknownAccounts: 0 });

    const { data } = (prisma.transaction.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(data).toMatchObject({
      companyId: 'co-1',
      bankAccountId: 'acc-1',
      externalId: 'txn_01',
      direction: TransactionDirection.IN,
      description: 'Simulated deposit',
    });
  });

  it('notifies that company, and only about what it just wrote', async () => {
    const notifications = stubNotifications();
    const service = new BankWebhookService(stubPrisma([CONNECTED_ACCOUNT]), notifications, stubPayrollRuns());

    await service.apply(depositEvent());

    expect(notifications.transactionsRecorded).toHaveBeenCalledTimes(1);
    const [companyId, account, recorded] = (
      notifications.transactionsRecorded as ReturnType<typeof vi.fn>
    ).mock.calls[0]!;

    expect(companyId).toBe('co-1');
    expect(account).toMatchObject({ id: 'acc-1', bankName: 'Комерцијална банка' });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ direction: TransactionDirection.IN, amount: '4500.00' });
  });

  // The bank is the account; we only mirror it. Adding up locally would drift
  // the moment one webhook is missed.
  it('takes the new balance from the bank rather than adding it up', async () => {
    const prisma = stubPrisma([CONNECTED_ACCOUNT]);
    const service = new BankWebhookService(prisma, stubNotifications(), stubPayrollRuns());

    await service.apply(depositEvent());

    const { where, data } = (prisma.bankAccount.update as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(where).toEqual({ id: 'acc-1' });
    expect(data.balance.toFixed(2)).toBe('128400.50');
  });

  it('leaves the balance alone when the bank did not report one', async () => {
    const prisma = stubPrisma([CONNECTED_ACCOUNT]);
    const service = new BankWebhookService(prisma, stubNotifications(), stubPayrollRuns());

    await service.apply(depositEvent(CONNECTED_ACCOUNT.iban, { newBalance: null }));

    expect(prisma.bankAccount.update).not.toHaveBeenCalled();
  });
});

describe('BankWebhookService.apply — an account nobody here has connected', () => {
  // The mock bank holds accounts no BiznisMk company has registered. There is
  // simply nobody to tell, which is not a failure.
  it('records nothing and notifies nobody', async () => {
    const prisma = stubPrisma([]);
    const notifications = stubNotifications();
    const service = new BankWebhookService(prisma, notifications, stubPayrollRuns());

    const outcome = await service.apply(depositEvent('MK07999999999999999'));

    expect(outcome).toEqual({ recorded: 0, duplicates: 0, unknownAccounts: 1 });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(prisma.bankAccount.update).not.toHaveBeenCalled();
    expect(notifications.transactionsRecorded).not.toHaveBeenCalled();
  });
});

describe('BankWebhookService.apply — an account the bank says is someone else’s', () => {
  // An account on file here for one company while the bank names another (or
  // nobody) was connected without the bank's say-so. Its money must not be
  // booked to, or announced to, a company that may not own it.
  it.each([
    ['another company', 'co-2'],
    ['no company at all', null],
  ])('records nothing when the bank names %s', async (_label, bankSays) => {
    const prisma = stubPrisma([CONNECTED_ACCOUNT]);
    const notifications = stubNotifications();
    const service = new BankWebhookService(prisma, notifications, stubPayrollRuns());

    const outcome = await service.apply(depositEvent(CONNECTED_ACCOUNT.iban, {}, bankSays));

    expect(outcome).toEqual({ recorded: 0, duplicates: 0, unknownAccounts: 1 });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(prisma.bankAccount.update).not.toHaveBeenCalled();
    expect(notifications.transactionsRecorded).not.toHaveBeenCalled();
  });
});

describe('BankWebhookService.apply — the bank redelivering', () => {
  // Deliveries are retried until acknowledged, so the same deposit can arrive
  // more than once. It must be booked once and announced once.
  it('books a movement already on file only once and stays quiet', async () => {
    const create = vi.fn().mockRejectedValue(duplicate());
    const prisma = stubPrisma([CONNECTED_ACCOUNT], create);
    const notifications = stubNotifications();
    const service = new BankWebhookService(prisma, notifications, stubPayrollRuns());

    const outcome = await service.apply(depositEvent());

    expect(outcome).toEqual({ recorded: 0, duplicates: 1, unknownAccounts: 0 });
    expect(notifications.transactionsRecorded).not.toHaveBeenCalled();
  });

  it('still records the new movements in a partly-seen delivery', async () => {
    let call = 0;
    const create = vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      call += 1;
      if (call === 1) return Promise.reject(duplicate());
      return Promise.resolve({ id: 'tx-new', ...data, amount: new Decimal(String(data['amount'])) });
    });

    const notifications = stubNotifications();
    const service = new BankWebhookService(stubPrisma([CONNECTED_ACCOUNT], create), notifications, stubPayrollRuns());

    const outcome = await service.apply({
      eventType: 'TRANSACTION_CREATED',
      companyId: CONNECTED_ACCOUNT.companyId,
      payrollRequestId: null,
      accounts: [
        {
          iban: CONNECTED_ACCOUNT.iban,
          newBalance: '1000',
          movements: [
            {
              externalId: 'seen',
              direction: TransactionDirection.IN,
              amount: '10',
              description: 'a',
              bookedAt: new Date(),
            },
            {
              externalId: 'fresh',
              direction: TransactionDirection.IN,
              amount: '20',
              description: 'b',
              bookedAt: new Date(),
            },
          ],
        },
      ],
    });

    expect(outcome).toEqual({ recorded: 1, duplicates: 1, unknownAccounts: 0 });
    const [, , recorded] = (notifications.transactionsRecorded as ReturnType<typeof vi.fn>).mock
      .calls[0]!;
    expect(recorded).toHaveLength(1);
  });

  it('lets a real database failure through so the bank retries', async () => {
    const create = vi.fn().mockRejectedValue(new Error('connection lost'));
    const service = new BankWebhookService(
      stubPrisma([CONNECTED_ACCOUNT], create),
      stubNotifications(),
      stubPayrollRuns(),
    );

    await expect(service.apply(depositEvent())).rejects.toThrow(/connection lost/);
  });
});

describe('BankWebhookService.apply — a payroll run across accounts', () => {
  it('records and notifies per account', async () => {
    const second = { ...CONNECTED_ACCOUNT, id: 'acc-2', iban: 'MK07200000012345678' };
    const prisma = stubPrisma([CONNECTED_ACCOUNT, second]);

    const notifications = stubNotifications();
    const service = new BankWebhookService(prisma, notifications, stubPayrollRuns());

    const outcome = await service.apply({
      eventType: 'PAYROLL_COMPLETED',
      companyId: CONNECTED_ACCOUNT.companyId,
      payrollRequestId: 'pr-1',
      accounts: [CONNECTED_ACCOUNT.iban, second.iban].map((iban) => ({
        iban,
        newBalance: '5000',
        movements: [
          {
            externalId: `p-${iban}`,
            direction: TransactionDirection.OUT,
            amount: '30000',
            description: 'Плата',
            bookedAt: new Date(),
          },
        ],
      })),
    });

    expect(outcome).toEqual({ recorded: 2, duplicates: 0, unknownAccounts: 0 });
    expect(notifications.transactionsRecorded).toHaveBeenCalledTimes(2);
  });

  it('applies the accounts it knows even when one is not connected here', async () => {
    const prisma = stubPrisma([CONNECTED_ACCOUNT]);
    const service = new BankWebhookService(prisma, stubNotifications(), stubPayrollRuns());

    const outcome = await service.apply({
      eventType: 'PAYROLL_COMPLETED',
      companyId: CONNECTED_ACCOUNT.companyId,
      payrollRequestId: 'pr-1',
      accounts: ['MK07999999999999999', CONNECTED_ACCOUNT.iban].map((iban) => ({
        iban,
        newBalance: '5000',
        movements: [
          {
            externalId: `p-${iban}`,
            direction: TransactionDirection.OUT,
            amount: '30000',
            description: 'Плата',
            bookedAt: new Date(),
          },
        ],
      })),
    });

    expect(outcome).toEqual({ recorded: 1, duplicates: 0, unknownAccounts: 1 });
  });
});

/**
 * A delivery that failed sits in the bank's retry queue carrying the balance as
 * it stood at the time. The queue is replayed one event at a time and in no
 * particular order, so an old event must not wind the account backwards.
 */
describe('BankWebhookService.apply — replaying a stale delivery', () => {
  const older = new Date('2026-09-14T12:50:00.000Z');
  const newer = new Date('2026-09-15T14:22:00.000Z');

  const eventAt = (bookedAt: Date, newBalance: string): BankWebhookEvent => ({
    eventType: 'TRANSACTION_CREATED',
    companyId: CONNECTED_ACCOUNT.companyId,
    payrollRequestId: null,
    accounts: [
      {
        iban: CONNECTED_ACCOUNT.iban,
        newBalance,
        movements: [
          {
            externalId: `tx-${bookedAt.toISOString()}`,
            direction: TransactionDirection.IN,
            amount: '5000',
            description: 'Simulated deposit',
            bookedAt,
          },
        ],
      },
    ],
  });

  it('keeps the current balance when the event predates what is on file', async () => {
    const prisma = stubPrisma([CONNECTED_ACCOUNT], undefined, newer);
    const service = new BankWebhookService(prisma, stubNotifications(), stubPayrollRuns());

    const outcome = await service.apply(eventAt(older, '2604638.42'));

    // The movement is real history and is still recorded...
    expect(outcome.recorded).toBe(1);
    // ...but the figure from back then is not written over a newer one.
    expect(prisma.bankAccount.update).not.toHaveBeenCalled();
  });

  it('applies the balance when the event is the newest thing on the account', async () => {
    const prisma = stubPrisma([CONNECTED_ACCOUNT], undefined, older);
    const service = new BankWebhookService(prisma, stubNotifications(), stubPayrollRuns());

    await service.apply(eventAt(newer, '2709638.42'));

    const { data } = (prisma.bankAccount.update as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(data.balance.toFixed(2)).toBe('2709638.42');
  });

  // An account the bank has never reported on has nothing to compare against,
  // so whatever it now sends is the best figure available.
  it('applies the balance on an account with no bank history yet', async () => {
    const prisma = stubPrisma([CONNECTED_ACCOUNT], undefined, null);
    const service = new BankWebhookService(prisma, stubNotifications(), stubPayrollRuns());

    await service.apply(eventAt(older, '2604638.42'));

    expect(prisma.bankAccount.update).toHaveBeenCalled();
  });

  // Read before writing: if this event's own movements counted as "on file",
  // every replay would look current and the guard would never fire.
  it('compares against what was on file before this event was written', async () => {
    const prisma = stubPrisma([CONNECTED_ACCOUNT], undefined, newer);
    const service = new BankWebhookService(prisma, stubNotifications(), stubPayrollRuns());

    await service.apply(eventAt(older, '2604638.42'));

    const findFirstCalls = (prisma.transaction.findFirst as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0]!;
    const createCalls = (prisma.transaction.create as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0]!;
    expect(findFirstCalls).toBeLessThan(createCalls);
  });
});

/**
 * A payroll run is the one event whose category is not a guess: the bank said
 * what the event is, so the salaries are booked as salaries — and the period
 * is filed as paid, which is what stops the app offering to pay it again.
 */
describe('BankWebhookService.apply — a completed payroll run', () => {
  const payrollEvent = (
    payrollRequestId: string | null = 'pr-1',
    companyId: string | null = CONNECTED_ACCOUNT.companyId,
  ): BankWebhookEvent => ({
    eventType: 'PAYROLL_COMPLETED',
    companyId,
    payrollRequestId,
    accounts: [
      {
        iban: CONNECTED_ACCOUNT.iban,
        newBalance: '3097292.02',
        movements: [
          {
            externalId: 'pay-1',
            direction: TransactionDirection.OUT,
            amount: '59413.20',
            description: 'Salary payment - Столе Николов',
            bookedAt: new Date('2026-09-21T10:00:00.000Z'),
          },
          {
            externalId: 'pay-2',
            direction: TransactionDirection.OUT,
            amount: '52933.20',
            description: 'Salary payment - Тамара Тодоровска',
            bookedAt: new Date('2026-09-21T10:00:01.000Z'),
          },
        ],
      },
    ],
  });

  it('books the movements as salaries rather than uncategorised', async () => {
    const prisma = stubPrisma([CONNECTED_ACCOUNT]);
    const service = new BankWebhookService(prisma, stubNotifications(), stubPayrollRuns());

    await service.apply(payrollEvent());

    const create = prisma.transaction.create as ReturnType<typeof vi.fn>;
    expect(create.mock.calls.map(([{ data }]) => data.category)).toEqual(['SALARIES', 'SALARIES']);
  });

  it('files the period as paid, with the bank\u2019s own run id', async () => {
    const payrollRuns = stubPayrollRuns();
    const service = new BankWebhookService(
      stubPrisma([CONNECTED_ACCOUNT]),
      stubNotifications(),
      payrollRuns,
    );

    await service.apply(payrollEvent());

    expect(payrollRuns.record).toHaveBeenCalledTimes(1);
    const [filed] = (payrollRuns.record as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(filed).toMatchObject({
      companyId: 'co-1',
      currency: 'MKD',
      paymentCount: 2,
      bankRequestId: 'pr-1',
    });
    expect(filed.totalAmount.toFixed(2)).toBe('112346.40');
    // Filed against when the salaries were booked, not when this arrived, so a
    // late delivery still lands in the month it paid.
    expect(filed.paidAt).toEqual(new Date('2026-09-21T10:00:01.000Z'));
  });

  it('files nothing for a run the bank says another company made', async () => {
    const payrollRuns = stubPayrollRuns();
    const prisma = stubPrisma([CONNECTED_ACCOUNT]);
    const service = new BankWebhookService(prisma, stubNotifications(), payrollRuns);

    const outcome = await service.apply(payrollEvent('pr-1', 'co-2'));

    expect(outcome).toEqual({ recorded: 0, duplicates: 0, unknownAccounts: 1 });
    expect(payrollRuns.record).not.toHaveBeenCalled();
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('records the money even if filing the run fails', async () => {
    const payrollRuns = stubPayrollRuns();
    (payrollRuns.record as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('write failed'));
    const prisma = stubPrisma([CONNECTED_ACCOUNT]);
    const service = new BankWebhookService(prisma, stubNotifications(), payrollRuns);

    const outcome = await service.apply(payrollEvent());

    expect(outcome).toEqual({ recorded: 2, duplicates: 0, unknownAccounts: 0 });
  });

  // An ordinary movement is still nobody's business to classify.
  it('leaves a plain transaction uncategorised', async () => {
    const prisma = stubPrisma([CONNECTED_ACCOUNT]);
    const service = new BankWebhookService(prisma, stubNotifications(), stubPayrollRuns());

    await service.apply(depositEvent());

    const create = prisma.transaction.create as ReturnType<typeof vi.fn>;
    expect(create.mock.calls[0]![0].data.category).toBe('OTHER');
  });
});
