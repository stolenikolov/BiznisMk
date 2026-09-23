import { Prisma } from '../generated/prisma/client.js';

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

/**
 * A gross monthly salary as the API accepts it: a positive decimal string with
 * at most two decimals, so the amount never passes through a float. Shared by
 * every endpoint that takes a salary.
 */
export const GROSS_SALARY_PATTERN = /^(?!0+(\.0+)?$)\d{1,10}(\.\d{1,2})?$/;

/**
 * The statutory figures a net salary depends on. They come from the
 * `tax_settings` table, one row per country and year — never from constants in
 * code — because UJP changes the allowance every year.
 */
export interface PayrollParameters {
  /** The tax year these parameters belong to. */
  year: number;
  /** Monthly personal allowance (лично ослободување). */
  personalAllowanceMonthly: Decimal;
  /** Flat personal income tax, in percent (10 = 10%). */
  incomeTaxRate: Decimal;
  /** Employee social contributions in total, in percent of gross (28 = 28%). */
  contributionsRate: Decimal;
}

/** Every step from gross to net, the way a payslip lists them. */
export interface SalaryBreakdown {
  gross: Decimal;
  /** Mandatory social contributions, `contributionsRate` of gross. */
  contributions: Decimal;
  /** Gross minus contributions. */
  baseAfterContributions: Decimal;
  /** The allowance as applied — never more than the base it is deducted from. */
  personalAllowance: Decimal;
  /** What income tax is charged on: base after contributions minus the allowance, at least 0. */
  taxableBase: Decimal;
  incomeTax: Decimal;
  /** Base after contributions minus income tax. */
  net: Decimal;
}

/**
 * Gross monthly salary → net, for North Macedonia's personal income tax.
 *
 *   1. contributions          = gross × contributionsRate
 *   2. base after contributions = gross − contributions
 *   3. taxable base           = max(base after contributions − allowance, 0)
 *   4. income tax             = taxable base × incomeTaxRate
 *   5. net                    = base after contributions − income tax
 *
 * Each charge is rounded to the deni (two decimals) as it is computed, and the
 * later steps work from the rounded figure, so the lines of the breakdown
 * always add up exactly.
 *
 * This is the only place the formula exists. Everything that shows or pays a
 * net salary goes through it, via PayrollService.
 */
export function calculateNetSalary(gross: string | Decimal, parameters: PayrollParameters): SalaryBreakdown {
  const grossAmount = new Decimal(gross);
  if (grossAmount.isNegative()) {
    throw new RangeError('A gross salary cannot be negative');
  }

  const contributions = percentOf(grossAmount, parameters.contributionsRate);
  const baseAfterContributions = grossAmount.minus(contributions);

  const personalAllowance = Decimal.min(parameters.personalAllowanceMonthly, baseAfterContributions);
  const taxableBase = baseAfterContributions.minus(personalAllowance);
  const incomeTax = percentOf(taxableBase, parameters.incomeTaxRate);

  return {
    gross: grossAmount,
    contributions,
    baseAfterContributions,
    personalAllowance,
    taxableBase,
    incomeTax,
    net: baseAfterContributions.minus(incomeTax),
  };
}

function percentOf(amount: Decimal, percent: Decimal): Decimal {
  return amount.times(percent).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}
