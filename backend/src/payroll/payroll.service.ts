import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { calculateNetSalary, type PayrollParameters, type SalaryBreakdown } from './net-salary.js';

/** A breakdown as the API sends it: decimal strings, plus what it was computed with. */
export interface SalaryBreakdownView {
  gross: string;
  contributions: string;
  baseAfterContributions: string;
  personalAllowance: string;
  taxableBase: string;
  incomeTax: string;
  net: string;
  /** The parameters behind the figures, so a payslip can print its own rates. */
  taxYear: number;
  contributionsRate: string;
  incomeTaxRate: string;
  personalAllowanceMonthly: string;
}

/**
 * Net salaries for the rest of the app. It loads the tax year's parameters and
 * hands them to `calculateNetSalary`; nothing else computes pay.
 */
@Injectable()
export class PayrollService {
  constructor(private readonly prisma: PrismaService) {}

  /** The parameters for a country's tax year, or null when nobody has entered them yet. */
  async parametersFor(country: string, year: number): Promise<PayrollParameters | null> {
    const row = await this.prisma.taxSettings.findUnique({
      where: { country_year: { country, year } },
    });
    if (!row) return null;

    return {
      year: row.year,
      personalAllowanceMonthly: row.personalAllowanceMonthly,
      incomeTaxRate: row.incomeTaxRate,
      contributionsRate: row.contributionsRate,
    };
  }

  /**
   * The same, for callers that cannot go on without them — a preview, a
   * payroll run. Refused with a message that says what to fix.
   */
  async requireParametersFor(country: string, year: number): Promise<PayrollParameters> {
    const parameters = await this.parametersFor(country, year);
    if (!parameters) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        error: 'Unprocessable Entity',
        errorCode: 'TAX_SETTINGS_MISSING',
        message: `No payroll tax settings for ${country} ${year}; add that year to tax_settings`,
        country,
        year,
      });
    }
    return parameters;
  }

  /** Net salary for one gross amount in a company's country and tax year. */
  async calculateNetSalary(companyId: string, gross: string | Prisma.Decimal, year: number): Promise<SalaryBreakdownView> {
    const { country } = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { country: true },
    });
    const parameters = await this.requireParametersFor(country, year);
    return toBreakdownView(calculateNetSalary(gross, parameters), parameters);
  }
}

export function toBreakdownView(breakdown: SalaryBreakdown, parameters: PayrollParameters): SalaryBreakdownView {
  return {
    gross: breakdown.gross.toFixed(2),
    contributions: breakdown.contributions.toFixed(2),
    baseAfterContributions: breakdown.baseAfterContributions.toFixed(2),
    personalAllowance: breakdown.personalAllowance.toFixed(2),
    taxableBase: breakdown.taxableBase.toFixed(2),
    incomeTax: breakdown.incomeTax.toFixed(2),
    net: breakdown.net.toFixed(2),
    taxYear: parameters.year,
    contributionsRate: parameters.contributionsRate.toFixed(2),
    incomeTaxRate: parameters.incomeTaxRate.toFixed(2),
    personalAllowanceMonthly: parameters.personalAllowanceMonthly.toFixed(2),
  };
}
