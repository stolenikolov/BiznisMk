import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EmployeesService, parseCalendarDate } from './employees.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { Employee } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { PayrollService } from '../payroll/payroll.service.js';
import type { PayrollParameters } from '../payroll/net-salary.js';
import type { CreateEmployeeDto } from './dto/create-employee.dto.js';

const Decimal = Prisma.Decimal;

/** What tax_settings holds for MK 2026, as the payroll service would return it. */
const MK_2026: PayrollParameters = {
  year: 2026,
  personalAllowanceMonthly: new Decimal('10932.00'),
  incomeTaxRate: new Decimal('10.00'),
  contributionsRate: new Decimal('28.00'),
};

function employeeRow(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'emp-1',
    companyId: 'company-1',
    userId: null,
    firstName: 'Марко',
    lastName: 'Стојановски',
    photoUrl: null,
    email: 'marko@firma.mk',
    phone: '070 234 567',
    role: 'EMPLOYEE',
    status: 'ACTIVE',
    salary: new Decimal('40000'),
    hireDate: new Date('2025-03-01T00:00:00.000Z'),
    vacationDaysTotal: 20,
    vacationDaysRemaining: 18,
    iban: 'MK07300000000042425',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createDto(overrides: Partial<CreateEmployeeDto> = {}): CreateEmployeeDto {
  return {
    firstName: 'Ивана',
    lastName: 'Николовска',
    email: 'ivana@firma.mk',
    phone: '071 345 678',
    role: 'MANAGER',
    salary: '62000',
    hireDate: '2026-09-17',
    iban: 'MK07210000000011111',
    ...overrides,
  };
}

function serviceWith(
  prismaOverrides: Record<string, unknown> = {},
  parameters: PayrollParameters | null = MK_2026,
) {
  const employee = {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn(async ({ data }: { data: Partial<Employee> }) => employeeRow({ ...data, id: 'new' })),
    update: vi.fn(async ({ data }: { data: Partial<Employee> }) => employeeRow(stripUndefined(data))),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    ...prismaOverrides,
  };
  const prisma = {
    company: { findUnique: vi.fn().mockResolvedValue({ country: 'MK', currency: 'MKD' }) },
    employee,
  } as unknown as PrismaService;
  const payroll = { parametersFor: vi.fn().mockResolvedValue(parameters) };

  return { service: new EmployeesService(prisma, payroll as unknown as PayrollService), employee, payroll };
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

describe('EmployeesService.findAllForCompany — team summary', () => {
  const september = new Date(2026, 8, 17);

  it('sums take-home pay, not gross, for everyone on this month’s payroll', async () => {
    const { service } = serviceWith({
      findMany: vi.fn().mockResolvedValue([
        employeeRow({ id: 'a', salary: new Decimal('40000') }),
        employeeRow({ id: 'b', salary: new Decimal('40000') }),
      ]),
    });

    const { summary } = await service.findAllForCompany('company-1', september);

    // 27,013.20 net each — see net-salary.spec.ts.
    expect(summary.netPayrollThisMonth).toBe('54026.40');
    expect(summary.currency).toBe('MKD');
  });

  it('counts a hire later this month, but not one starting next month', async () => {
    const { service } = serviceWith({
      findMany: vi.fn().mockResolvedValue([
        employeeRow({ id: 'late-sept', hireDate: new Date('2026-09-30T00:00:00.000Z') }),
        employeeRow({ id: 'october', hireDate: new Date('2026-10-01T00:00:00.000Z') }),
      ]),
    });

    const { summary } = await service.findAllForCompany('company-1', september);

    expect(summary.total).toBe(2);
    expect(summary.netPayrollThisMonth).toBe('27013.20');
  });

  it('counts leave and sick leave together as absent', async () => {
    const { service } = serviceWith({
      findMany: vi.fn().mockResolvedValue([
        employeeRow({ id: 'a', status: 'ACTIVE' }),
        employeeRow({ id: 'b', status: 'ON_LEAVE' }),
        employeeRow({ id: 'c', status: 'SICK_LEAVE' }),
      ]),
    });

    const { summary } = await service.findAllForCompany('company-1', september);

    expect(summary.absent).toBe(2);
  });

  it('looks up the tax settings for the company’s country and the current year', async () => {
    const { service, payroll } = serviceWith();

    const { summary } = await service.findAllForCompany('company-1', september);

    expect(payroll.parametersFor).toHaveBeenCalledWith('MK', 2026);
    expect(summary.taxYear).toBe(2026);
  });

  it('reports no net figures when the tax year has not been entered, rather than guessing', async () => {
    const { service } = serviceWith({ findMany: vi.fn().mockResolvedValue([employeeRow()]) }, null);

    const { employees, summary } = await service.findAllForCompany('company-1', september);

    expect(summary.netPayrollThisMonth).toBeNull();
    expect(employees[0]!.pay).toBeNull();
  });

  it('gives every employee the full gross → net breakdown', async () => {
    const { service } = serviceWith({ findMany: vi.fn().mockResolvedValue([employeeRow()]) });

    const { employees } = await service.findAllForCompany('company-1', september);

    expect(employees[0]!.pay).toEqual({
      gross: '40000.00',
      contributions: '11200.00',
      baseAfterContributions: '28800.00',
      personalAllowance: '10932.00',
      taxableBase: '17868.00',
      incomeTax: '1786.80',
      net: '27013.20',
      taxYear: 2026,
      contributionsRate: '28.00',
      incomeTaxRate: '10.00',
      personalAllowanceMonthly: '10932.00',
    });
  });

  it('serialises money as a decimal string and the hire date as a plain date', async () => {
    const { service } = serviceWith({ findMany: vi.fn().mockResolvedValue([employeeRow()]) });

    const { employees } = await service.findAllForCompany('company-1', september);

    expect(employees[0]).toMatchObject({ salary: '40000.00', hireDate: '2025-03-01' });
  });

  it('only ever reads the caller’s own company', async () => {
    const { service, employee } = serviceWith();

    await service.findAllForCompany('company-1', september);

    expect(employee.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: 'company-1' } }));
  });
});

describe('EmployeesService.create', () => {
  it('gives a new hire the full 20 days unless told otherwise', async () => {
    const { service, employee } = serviceWith();

    await service.create('company-1', createDto());

    expect(employee.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'company-1',
        status: 'ACTIVE',
        vacationDaysTotal: 20,
        vacationDaysRemaining: 20,
      }),
    });
  });

  it('refuses more days remaining than the entitlement', async () => {
    const { service, employee } = serviceWith();

    await expect(service.create('company-1', createDto({ vacationDaysRemaining: 21 }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(employee.create).not.toHaveBeenCalled();
  });

  it('turns a duplicate email into a conflict the form can show', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const { service } = serviceWith({ create: vi.fn().mockRejectedValue(duplicate) });

    await expect(service.create('company-1', createDto())).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('EmployeesService.update', () => {
  it('checks the vacation balance against the edited result, not only the sent fields', async () => {
    const { service, employee } = serviceWith({
      findFirst: vi.fn().mockResolvedValue(employeeRow({ vacationDaysTotal: 20, vacationDaysRemaining: 18 })),
    });

    // Lowering the entitlement below the 18 days still remaining.
    await expect(service.update('company-1', 'emp-1', { vacationDaysTotal: 15 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(employee.update).not.toHaveBeenCalled();
  });

  it('reads another company’s employee as not found', async () => {
    const { service, employee } = serviceWith({ findFirst: vi.fn().mockResolvedValue(null) });

    await expect(service.update('company-1', 'emp-of-company-2', { phone: '070 000 000' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(employee.findFirst).toHaveBeenCalledWith({ where: { id: 'emp-of-company-2', companyId: 'company-1' } });
  });

  it('changes only what was sent', async () => {
    const { service } = serviceWith({ findFirst: vi.fn().mockResolvedValue(employeeRow()) });

    const updated = await service.update('company-1', 'emp-1', { status: 'SICK_LEAVE' });

    expect(updated.status).toBe('SICK_LEAVE');
    expect(updated.email).toBe('marko@firma.mk');
  });
});

describe('EmployeesService.remove', () => {
  it('deletes within the company and reports a miss as not found', async () => {
    const { service, employee } = serviceWith({ deleteMany: vi.fn().mockResolvedValue({ count: 0 }) });

    await expect(service.remove('company-1', 'emp-9')).rejects.toBeInstanceOf(NotFoundException);
    expect(employee.deleteMany).toHaveBeenCalledWith({ where: { id: 'emp-9', companyId: 'company-1' } });
  });
});

describe('parseCalendarDate', () => {
  it('stores a date as UTC midnight, so the DATE column keeps the same day', () => {
    expect(parseCalendarDate('2026-09-17').toISOString()).toBe('2026-09-17T00:00:00.000Z');
  });

  it('rejects a day the month does not have instead of rolling into the next', () => {
    expect(() => parseCalendarDate('2026-02-30')).toThrow(BadRequestException);
  });
});
