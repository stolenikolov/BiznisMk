import { describe, expect, it, vi } from 'vitest';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PayrollRunService } from './payroll-run.service.js';
import { calculateNetSalary, type PayrollParameters } from './net-salary.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { PayrollService } from './payroll.service.js';
import {
  BankPayrollError,
  type BankPayrollProvider,
  type PayrollQuote,
} from '../bank-integration/bank-payroll.provider.js';

const Decimal = Prisma.Decimal;

/** 2026's published figures, the year the tests run in. */
const PARAMETERS: PayrollParameters = {
  year: 2026,
  personalAllowanceMonthly: new Decimal('10932.00'),
  incomeTaxRate: new Decimal('10.00'),
  contributionsRate: new Decimal('28.00'),
};

const EMPLOYEES = [
  {
    id: 'emp-1',
    firstName: 'Столе',
    lastName: 'Николов',
    salary: new Decimal('90000.00'),
    hireDate: new Date('2024-03-01'),
    iban: 'MK07250120000058984',
  },
  {
    id: 'emp-2',
    firstName: 'Тамара',
    lastName: 'Тодоровска',
    salary: new Decimal('80000.00'),
    hireDate: new Date('2025-06-15'),
    iban: 'MK07300000000042425',
  },
];

const breakdown = (gross: string) => calculateNetSalary(new Decimal(gross), PARAMETERS);
const net = (gross: string) => breakdown(gross).net.toFixed(2);

/** The two charges the same gross owes the state, summed over the team. */
const statutory = (kind: 'contributions' | 'incomeTax') =>
  EMPLOYEES.reduce((sum, e) => sum.plus(breakdown(e.salary.toFixed(2))[kind]), new Decimal(0)).toFixed(2);

/** Payday on the 21st, two staff, one account, nothing paid yet. */
function stubPrisma(
  overrides: {
    employees?: typeof EMPLOYEES;
    accounts?: { iban: string }[];
    run?: { paidAt: Date; totalAmount: Prisma.Decimal; paymentCount: number } | null;
    paydayDayOfMonth?: number | null;
    create?: ReturnType<typeof vi.fn>;
  } = {},
) {
  return {
    company: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        currency: 'MKD',
        country: 'MK',
        paydayDayOfMonth: overrides.paydayDayOfMonth ?? 21,
      }),
    },
    employee: { findMany: vi.fn().mockResolvedValue(overrides.employees ?? EMPLOYEES) },
    bankAccount: {
      findMany: vi.fn().mockResolvedValue(overrides.accounts ?? [{ iban: 'MK73200416857314952' }]),
    },
    payrollRun: {
      findUnique: vi.fn().mockResolvedValue(overrides.run ?? null),
      create: overrides.create ?? vi.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;
}

function stubPayroll(parameters: PayrollParameters | null = PARAMETERS) {
  return { parametersFor: vi.fn().mockResolvedValue(parameters) } as unknown as PayrollService;
}

const QUOTE: PayrollQuote = {
  requestId: 'req-1',
  companyId: 'co-1',
  currency: 'MKD',
  allocation: [
    { employeeId: 'emp-1', employeeName: 'Столе Николов', amount: net('90000.00'), iban: 'MK73200416857314952' },
    { employeeId: 'emp-2', employeeName: 'Тамара Тодоровска', amount: net('80000.00'), iban: 'MK73200416857314952' },
    {
      employeeId: 'statutory:CONTRIBUTIONS',
      employeeName: 'Придонеси од плата (УЈП)',
      amount: statutory('contributions'),
      iban: 'MK73200416857314952',
    },
    {
      employeeId: 'statutory:INCOME_TAX',
      employeeName: 'Персонален данок на доход (УЈП)',
      amount: statutory('incomeTax'),
      iban: 'MK73200416857314952',
    },
  ],
  accountTotals: [],
  ineligibleAccounts: [],
};

function stubBank(overrides: Partial<Record<keyof BankPayrollProvider, unknown>> = {}) {
  return {
    isConfigured: vi.fn().mockReturnValue(true),
    requestPayroll: vi.fn().mockResolvedValue(QUOTE),
    getPayroll: vi.fn().mockResolvedValue(QUOTE),
    approvePayroll: vi
      .fn()
      .mockResolvedValue({ requestId: 'req-1', currency: 'MKD', paymentCount: 4, accountTotals: [] }),
    ...overrides,
  } as unknown as BankPayrollProvider;
}

/** Inside the window: two days before the 21st. */
const IN_WINDOW = new Date(2026, 8, 19, 12);

describe('PayrollRunService.status', () => {
  it('offers the run with everyone on the period and what they take home', async () => {
    const service = new PayrollRunService(stubPrisma(), stubPayroll(), stubBank());

    const status = await service.status('co-1', IN_WINDOW);

    expect(status.period).toBe('2026-09');
    expect(status.payday).toBe('2026-09-21');
    expect(status.canPay).toBe(true);
    expect(status.paidAt).toBeNull();
    expect(status.lines).toEqual([
      {
        employeeId: 'emp-1',
        name: 'Столе Николов',
        net: net('90000.00'),
        gross: '90000.00',
        iban: EMPLOYEES[0]!.iban,
      },
      {
        employeeId: 'emp-2',
        name: 'Тамара Тодоровска',
        net: net('80000.00'),
        gross: '80000.00',
        iban: EMPLOYEES[1]!.iban,
      },
    ]);
  });

  // The question the figures have to answer: a run pays gross, so the total
  // off the account is net plus what the state is owed — 170,000 here, not the
  // 112,346.40 that reaches the two people.
  it('totals the gross, split into take-home pay and what the state is owed', async () => {
    const service = new PayrollRunService(stubPrisma(), stubPayroll(), stubBank());

    const status = await service.status('co-1', IN_WINDOW);

    expect(status.netTotal).toBe(new Decimal(net('90000.00')).plus(net('80000.00')).toFixed(2));
    expect(status.statutory).toEqual([
      { kind: 'CONTRIBUTIONS', amount: statutory('contributions') },
      { kind: 'INCOME_TAX', amount: statutory('incomeTax') },
    ]);
    expect(status.statutoryTotal).toBe(
      new Decimal(statutory('contributions')).plus(statutory('incomeTax')).toFixed(2),
    );
    // Everything adds back up to the gross salaries, to the deni.
    expect(status.total).toBe('170000.00');
    expect(new Decimal(status.netTotal).plus(status.statutoryTotal).toFixed(2)).toBe(status.total);
  });

  // The case the button exists for: somebody paid, and it was not us.
  it('stops offering it once a run is on file, however that run happened', async () => {
    const service = new PayrollRunService(
      stubPrisma({
        run: { paidAt: new Date('2026-09-21T09:00:00.000Z'), totalAmount: new Decimal('170000'), paymentCount: 4 },
      }),
      stubPayroll(),
      stubBank(),
    );

    const status = await service.status('co-1', IN_WINDOW);

    expect(status.canPay).toBe(false);
    expect(status.paidAt).toBe('2026-09-21T09:00:00.000Z');
    expect(status.blockedBy).toBeNull();
  });

  it('leaves out someone hired after the period ends', async () => {
    const service = new PayrollRunService(
      stubPrisma({
        employees: [
          EMPLOYEES[0]!,
          { ...EMPLOYEES[1]!, id: 'emp-3', hireDate: new Date('2026-10-01') },
        ],
      }),
      stubPayroll(),
      stubBank(),
    );

    const status = await service.status('co-1', IN_WINDOW);

    expect(status.lines.map((line) => line.employeeId)).toEqual(['emp-1']);
  });

  it.each([
    ['NO_EMPLOYEES', { employees: [] }, stubPayroll(), stubBank()],
    ['NO_ACCOUNTS', { accounts: [] }, stubPayroll(), stubBank()],
    ['TAX_SETTINGS_MISSING', {}, stubPayroll(null), stubBank()],
    ['BANK_NOT_CONFIGURED', {}, stubPayroll(), stubBank({ isConfigured: vi.fn().mockReturnValue(false) })],
  ])('says why it cannot pay: %s', async (blocker, prismaOverrides, payroll, bank) => {
    const service = new PayrollRunService(
      stubPrisma(prismaOverrides as Parameters<typeof stubPrisma>[0]),
      payroll,
      bank,
    );

    const status = await service.status('co-1', IN_WINDOW);

    expect(status.canPay).toBe(false);
    expect(status.blockedBy).toBe(blocker);
  });
});

describe('PayrollRunService.preview', () => {
  it('asks the bank for net pay per person and hands it every eligible account', async () => {
    const bank = stubBank();
    const service = new PayrollRunService(stubPrisma(), stubPayroll(), bank);

    const { quote } = await service.preview('co-1', IN_WINDOW);

    expect(quote.requestId).toBe('req-1');
    expect(bank.requestPayroll).toHaveBeenCalledWith({
      companyId: 'co-1',
      currency: 'MKD',
      accounts: ['MK73200416857314952'],
      payments: [
        { employeeId: 'emp-1', employeeName: 'Столе Николов', amount: net('90000.00') },
        { employeeId: 'emp-2', employeeName: 'Тамара Тодоровска', amount: net('80000.00') },
        {
          employeeId: 'statutory:CONTRIBUTIONS',
          employeeName: 'Придонеси од плата (УЈП)',
          amount: statutory('contributions'),
        },
        {
          employeeId: 'statutory:INCOME_TAX',
          employeeName: 'Персонален данок на доход (УЈП)',
          amount: statutory('incomeTax'),
        },
      ],
    });
  });

  it('refuses to price a period that is already paid', async () => {
    const bank = stubBank();
    const service = new PayrollRunService(
      stubPrisma({ run: { paidAt: new Date(), totalAmount: new Decimal('1'), paymentCount: 4 } }),
      stubPayroll(),
      bank,
    );

    await expect(service.preview('co-1', IN_WINDOW)).rejects.toThrow(UnprocessableEntityException);
    expect(bank.requestPayroll).not.toHaveBeenCalled();
  });
});

describe('PayrollRunService.confirm', () => {
  it('approves the run and files the period as paid', async () => {
    const create = vi.fn().mockResolvedValue({});
    const bank = stubBank();
    const service = new PayrollRunService(stubPrisma({ create }), stubPayroll(), bank);

    await service.confirm('co-1', 'req-1', IN_WINDOW);

    expect(bank.approvePayroll).toHaveBeenCalledWith('req-1');
    expect(create.mock.calls[0]![0].data).toMatchObject({
      companyId: 'co-1',
      currency: 'MKD',
      paymentCount: 4,
      bankRequestId: 'req-1',
    });
    expect(create.mock.calls[0]![0].data.totalAmount.toFixed(2)).toBe('170000.00');
    expect(create.mock.calls[0]![0].data.period).toEqual(new Date(2026, 8, 1));
  });

  // A request id comes back from the browser, so whose run it is gets checked
  // at the bank before anything is approved.
  it('will not approve another company’s run', async () => {
    const bank = stubBank({
      getPayroll: vi.fn().mockResolvedValue({ ...QUOTE, companyId: 'someone-else' }),
    });
    const service = new PayrollRunService(stubPrisma(), stubPayroll(), bank);

    await expect(service.confirm('co-1', 'req-1', IN_WINDOW)).rejects.toThrow(NotFoundException);
    expect(bank.approvePayroll).not.toHaveBeenCalled();
  });

  it('reports a run the bank has forgotten as gone rather than as a bank error', async () => {
    const bank = stubBank({
      getPayroll: vi
        .fn()
        .mockRejectedValue(new BankPayrollError('PAYROLL_REQUEST_NOT_FOUND', 'no such run')),
    });
    const service = new PayrollRunService(stubPrisma(), stubPayroll(), bank);

    await expect(service.confirm('co-1', 'req-1', IN_WINDOW)).rejects.toThrow(NotFoundException);
  });
});

describe('PayrollRunService.record', () => {
  // Our own confirm and the bank's webhook both file the same run; whichever
  // is second must be a no-op rather than an error.
  it('treats a period already on file as done', async () => {
    const create = vi.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '7.10.0',
      }),
    );
    const service = new PayrollRunService(stubPrisma({ create }), stubPayroll(), stubBank());

    await expect(
      service.record({
        companyId: 'co-1',
        period: new Date(2026, 8, 1),
        currency: 'MKD',
        totalAmount: new Decimal('170000'),
        paymentCount: 4,
        bankRequestId: 'req-1',
        paidAt: new Date(),
      }),
    ).resolves.toBeUndefined();
  });
});
