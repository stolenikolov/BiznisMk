import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { EmployeeStatus, type CompanyRole } from '../generated/prisma/enums.js';
import type { Employee } from '../generated/prisma/client.js';
import { PayrollService, toBreakdownView, type SalaryBreakdownView } from '../payroll/payroll.service.js';
import { calculateNetSalary, type PayrollParameters } from '../payroll/net-salary.js';
import type { CreateEmployeeDto } from './dto/create-employee.dto.js';
import type { UpdateEmployeeDto } from './dto/update-employee.dto.js';

const Decimal = Prisma.Decimal;

/** Prisma's unique-constraint violation. */
const UNIQUE_VIOLATION = 'P2002';

/** The statutory minimum, and what a new hire gets unless told otherwise. */
export const DEFAULT_VACATION_DAYS = 20;

export interface EmployeeView {
  id: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  email: string;
  phone: string;
  role: CompanyRole;
  status: EmployeeStatus;
  /** Monthly gross, as a decimal string. */
  salary: string;
  /** YYYY-MM-DD. */
  hireDate: string;
  vacationDaysTotal: number;
  vacationDaysRemaining: number;
  iban: string;
  /**
   * This month's salary from gross to net, under the current tax year's
   * settings. Null when that year has not been entered in tax_settings.
   */
  pay: SalaryBreakdownView | null;
}

export interface TeamSummary {
  total: number;
  /** On leave or on sick leave today. */
  absent: number;
  /**
   * Take-home pay for everyone employed by the end of this month. Null when
   * the tax year's settings are missing: a wrong net figure is worse than none.
   */
  netPayrollThisMonth: string | null;
  /** The tax year the net figures were computed for, and must be entered for. */
  taxYear: number;
  currency: string;
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payroll: PayrollService,
  ) {}

  async findAllForCompany(
    companyId: string,
    now = new Date(),
  ): Promise<{ employees: EmployeeView[]; summary: TeamSummary }> {
    const { company, parameters } = await this.payContext(companyId, now);

    const rows = await this.prisma.employee.findMany({
      where: { companyId },
      // CompanyRole is declared CEO, MANAGER, EMPLOYEE, and Postgres sorts an
      // enum by declaration order — so the list reads top of the company down.
      orderBy: [{ role: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }],
    });

    return {
      employees: rows.map((row) => toView(row, parameters)),
      summary: summarize(rows, company.currency, parameters, now),
    };
  }

  async findOne(companyId: string, employeeId: string): Promise<EmployeeView> {
    const employee = await this.loadScoped(companyId, employeeId);
    return toView(employee, (await this.payContext(companyId)).parameters);
  }

  async create(companyId: string, dto: CreateEmployeeDto): Promise<EmployeeView> {
    const vacationDaysTotal = dto.vacationDaysTotal ?? DEFAULT_VACATION_DAYS;
    const vacationDaysRemaining = dto.vacationDaysRemaining ?? vacationDaysTotal;
    assertVacationBalance(vacationDaysTotal, vacationDaysRemaining);

    const employee = await this.withUniqueEmail(() =>
      this.prisma.employee.create({
        data: {
          companyId,
          firstName: dto.firstName,
          lastName: dto.lastName,
          photoUrl: dto.photoUrl ?? null,
          email: dto.email,
          phone: dto.phone,
          role: dto.role,
          status: dto.status ?? EmployeeStatus.ACTIVE,
          salary: new Decimal(dto.salary),
          hireDate: parseCalendarDate(dto.hireDate),
          vacationDaysTotal,
          vacationDaysRemaining,
          iban: dto.iban,
        },
      }),
    );

    return toView(employee, (await this.payContext(companyId)).parameters);
  }

  async update(companyId: string, employeeId: string, dto: UpdateEmployeeDto): Promise<EmployeeView> {
    const current = await this.loadScoped(companyId, employeeId);

    // The balance rule spans two fields, so it is checked against the result
    // of the edit, not just the fields that happened to be sent.
    assertVacationBalance(
      dto.vacationDaysTotal ?? current.vacationDaysTotal,
      dto.vacationDaysRemaining ?? current.vacationDaysRemaining,
    );

    const employee = await this.withUniqueEmail(() =>
      this.prisma.employee.update({
        where: { id: current.id },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          photoUrl: dto.photoUrl,
          email: dto.email,
          phone: dto.phone,
          role: dto.role,
          status: dto.status,
          salary: dto.salary === undefined ? undefined : new Decimal(dto.salary),
          hireDate: dto.hireDate === undefined ? undefined : parseCalendarDate(dto.hireDate),
          vacationDaysTotal: dto.vacationDaysTotal,
          vacationDaysRemaining: dto.vacationDaysRemaining,
          iban: dto.iban,
        },
      }),
    );

    return toView(employee, (await this.payContext(companyId)).parameters);
  }

  async remove(companyId: string, employeeId: string): Promise<void> {
    // deleteMany scoped by company: an id from another tenant deletes nothing
    // and reads as not found, never as someone else's employee.
    const { count } = await this.prisma.employee.deleteMany({ where: { id: employeeId, companyId } });
    if (count === 0) {
      throw new NotFoundException('Employee not found');
    }
  }

  /**
   * The company's currency and this tax year's payroll parameters. Pay is
   * always shown for the current month, so the current year decides.
   */
  private async payContext(companyId: string, now = new Date()) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { country: true, currency: true },
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    return { company, parameters: await this.payroll.parametersFor(company.country, now.getFullYear()) };
  }

  private async loadScoped(companyId: string, employeeId: string): Promise<Employee> {
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, companyId } });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    return employee;
  }

  /** Two people in one company cannot share a contact address. */
  private async withUniqueEmail<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION) {
        throw new ConflictException('An employee with this email already exists in this company');
      }
      throw error;
    }
  }
}

function assertVacationBalance(total: number, remaining: number): void {
  if (remaining > total) {
    throw new BadRequestException('vacationDaysRemaining cannot exceed vacationDaysTotal');
  }
}

/**
 * YYYY-MM-DD to the UTC midnight Prisma stores in a DATE column. The DTO has
 * already checked the shape; this rejects dates that do not exist, like
 * 2026-02-30, which `new Date` would silently roll into March.
 */
export function parseCalendarDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException('hireDate is not a real calendar date');
  }
  return date;
}

function toView(employee: Employee, parameters: PayrollParameters | null): EmployeeView {
  return {
    id: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    photoUrl: employee.photoUrl,
    email: employee.email,
    phone: employee.phone,
    role: employee.role,
    status: employee.status,
    salary: employee.salary.toFixed(2),
    hireDate: employee.hireDate.toISOString().slice(0, 10),
    vacationDaysTotal: employee.vacationDaysTotal,
    vacationDaysRemaining: employee.vacationDaysRemaining,
    iban: employee.iban,
    pay: parameters ? toBreakdownView(calculateNetSalary(employee.salary, parameters), parameters) : null,
  };
}

function summarize(
  employees: Employee[],
  currency: string,
  parameters: PayrollParameters | null,
  now: Date,
): TeamSummary {
  // Someone starting later this month is paid for it; someone starting next
  // month is not on this month's payroll yet. Compared as calendar-date
  // strings, because a DATE column carries no time zone to convert.
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const monthEnd = [
    lastDay.getFullYear(),
    String(lastDay.getMonth() + 1).padStart(2, '0'),
    String(lastDay.getDate()).padStart(2, '0'),
  ].join('-');

  const netPayroll = parameters
    ? employees
        .filter((employee) => employee.hireDate.toISOString().slice(0, 10) <= monthEnd)
        .reduce((sum, employee) => sum.plus(calculateNetSalary(employee.salary, parameters).net), new Decimal(0))
    : null;

  return {
    total: employees.length,
    absent: employees.filter((employee) => employee.status !== EmployeeStatus.ACTIVE).length,
    netPayrollThisMonth: netPayroll ? netPayroll.toFixed(2) : null,
    taxYear: now.getFullYear(),
    currency,
  };
}
