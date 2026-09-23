import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { BankAccountStatus } from '../generated/prisma/enums.js';
import {
  BankPayrollError,
  BankPayrollProvider,
  type PayrollPayment,
  type PayrollQuote,
} from '../bank-integration/bank-payroll.provider.js';
import { PayrollService } from './payroll.service.js';
import { calculateNetSalary, type PayrollParameters } from './net-salary.js';
import { payrollPeriodFor, periodEnd, periodLabel } from './payroll-period.js';

const Decimal = Prisma.Decimal;

/** Why a period cannot be paid, when it otherwise would be due. */
export type PayrollBlocker =
  | 'NO_EMPLOYEES'
  | 'TAX_SETTINGS_MISSING'
  | 'NO_ACCOUNTS'
  | 'BANK_NOT_CONFIGURED';

/**
 * The two charges a payroll run owes the state, on top of what reaches the
 * employees. Both are withheld from gross pay and paid to the УЈП, and they
 * are separate payments there, so they stay separate here.
 */
export type StatutoryKind = 'CONTRIBUTIONS' | 'INCOME_TAX';

/**
 * How a statutory line is identified in the bank's payment list. The bank's
 * payroll API takes payments keyed by employee, which is who *most* of a run
 * pays; this prefix is what lets the app tell its own two lines apart again
 * when the priced run comes back.
 */
export const STATUTORY_PREFIX = 'statutory:';

/** What each charge is called on the statement the bank writes. */
const STATUTORY_NAMES: Record<StatutoryKind, string> = {
  CONTRIBUTIONS: 'Придонеси од плата (УЈП)',
  INCOME_TAX: 'Персонален данок на доход (УЈП)',
};

/** One person on a period's payroll, and what they take home for it. */
export interface PayrollLine {
  employeeId: string;
  name: string;
  /** Take-home pay: what the bank transfers to this person. */
  net: string;
  /** Their gross, which the net and the two charges below add up to. */
  gross: string;
  iban: string;
}

/** One charge the run pays to the state rather than to a person. */
export interface PayrollStatutoryLine {
  kind: StatutoryKind;
  amount: string;
}

/**
 * The state of one period's payroll — everything the Employees page needs to
 * decide whether to offer the button, and what to say if it does not.
 */
export interface PayrollRunStatus {
  /** `YYYY-MM`, the month the salaries are for. */
  period: string;
  /** The payday itself as `YYYY-MM-DD`, or null when none is configured. */
  payday: string | null;
  currency: string;
  lines: PayrollLine[];
  /** Contributions and income tax, withheld from gross and paid to the УЈП. */
  statutory: PayrollStatutoryLine[];
  /** What reaches the employees' own accounts. */
  netTotal: string;
  /** What goes to the УЈП. */
  statutoryTotal: string;
  /** Everything that leaves the company account: gross. */
  total: string;
  /** Set once the salaries are out, whoever started the run. */
  paidAt: string | null;
  /** The button shows on exactly this. */
  canPay: boolean;
  /** Why not, when `canPay` is false and the period is still unpaid. */
  blockedBy: PayrollBlocker | null;
}

/**
 * Paying a month's salaries.
 *
 * A run pays out gross, not net: each person's take-home goes to their own
 * account, and the contributions and income tax withheld from their gross go
 * to the УЈП. Those are separate transfers but one payroll — a run that moved
 * only the net amounts would leave the company owing the state, which is not
 * what "salaries are paid" means.
 *
 * The state that matters is not "did someone press the button" — it is
 * "have these salaries left the account", and only the bank knows that. So a
 * period counts as paid when a `PayrollRun` row exists for it, and that row is
 * written by this service's own confirm *and* by a `PAYROLL_COMPLETED` webhook
 * for a run approved at the bank instead. Both write it, the unique
 * `bankRequestId` keeps them from doubling up, and the button reads it — which
 * is what makes it disappear whether the money moved from here or from
 * somewhere else entirely.
 */
@Injectable()
export class PayrollRunService {
  private readonly logger = new Logger(PayrollRunService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payroll: PayrollService,
    private readonly bank: BankPayrollProvider,
  ) {}

  /** What the Employees page reads on every load. */
  async status(companyId: string, now = new Date()): Promise<PayrollRunStatus> {
    const context = await this.context(companyId, now);
    const { period, payday, currency, lines, statutory, parameters, accounts } = context;

    const run = await this.prisma.payrollRun.findUnique({
      where: { companyId_period: { companyId, period } },
      select: { paidAt: true, totalAmount: true, paymentCount: true },
    });

    // Counted before the net figures, not from them: with the tax year
    // missing there are no lines, and calling that "no employees" would send
    // the owner looking for staff instead of for the setting.
    const blockedBy = this.blocker(context.onPayrollCount, parameters, accounts.length);

    return {
      period: periodLabel(period),
      payday: payday ? isoDate(payday) : null,
      currency,
      lines,
      statutory,
      netTotal: context.netTotal,
      statutoryTotal: context.statutoryTotal,
      total: context.grossTotal,
      paidAt: run ? run.paidAt.toISOString() : null,
      canPay: run === null && blockedBy === null,
      blockedBy: run === null ? blockedBy : null,
    };
  }

  /**
   * Phase one: ask the bank to price the run. Nothing moves, and the quote it
   * answers with is what the owner confirms.
   */
  async preview(companyId: string, now = new Date()): Promise<{ status: PayrollRunStatus; quote: PayrollQuote }> {
    const status = await this.status(companyId, now);

    if (status.paidAt !== null) {
      throw new UnprocessableEntityException({
        errorCode: 'PAYROLL_ALREADY_PAID',
        message: `Salaries for ${status.period} are already paid`,
        period: status.period,
        paidAt: status.paidAt,
      });
    }
    if (!status.canPay) {
      throw new UnprocessableEntityException({
        errorCode: status.blockedBy ?? 'PAYROLL_NOT_PAYABLE',
        message: `Salaries for ${status.period} cannot be paid: ${status.blockedBy ?? 'unknown'}`,
        period: status.period,
      });
    }

    const { accounts } = await this.context(companyId, now);

    const quote = await this.bank.requestPayroll({
      companyId,
      currency: status.currency,
      accounts: accounts.map((account) => account.iban),
      payments: paymentsFor(status),
    });

    this.logger.log(
      `Priced payroll ${quote.requestId} for ${status.period}: ` +
        `${String(status.lines.length)} salary payment(s) of ${status.netTotal} plus ` +
        `${status.statutoryTotal} to the УЈП, ${status.total} ${status.currency} in total`,
    );

    return { status, quote };
  }

  /**
   * Phase two: execute a quote the owner confirmed.
   *
   * The request id comes back from the browser, so it is checked against the
   * bank's own record of who it belongs to before anything is approved — a
   * borrowed id from another company must not be payable from here.
   *
   * The row this writes is the app's copy of a fact the bank now owns. The
   * transactions and the new balances are not taken from the response: they
   * arrive in the `PAYROLL_COMPLETED` webhook, with the bank's own ids, which
   * is the one path that records money moving.
   */
  async confirm(companyId: string, requestId: string, now = new Date()): Promise<PayrollRunStatus> {
    const quote = await this.bank.getPayroll(requestId).catch((error: unknown) => {
      if (error instanceof BankPayrollError && error.code === 'PAYROLL_REQUEST_NOT_FOUND') {
        throw new NotFoundException({
          errorCode: 'PAYROLL_REQUEST_NOT_FOUND',
          message: 'That payroll run no longer exists at the bank; start it again',
        });
      }
      throw error;
    });

    if (quote.companyId !== companyId) {
      // Not "forbidden": from this company's side that run simply does not exist.
      throw new NotFoundException({
        errorCode: 'PAYROLL_REQUEST_NOT_FOUND',
        message: 'That payroll run does not belong to this company',
      });
    }

    const { period } = payrollPeriodFor(await this.paydayOf(companyId), now);

    const execution = await this.bank.approvePayroll(requestId);
    const total = quote.allocation.reduce((sum, entry) => sum.plus(entry.amount), new Decimal(0));

    await this.record({
      companyId,
      period,
      currency: execution.currency || quote.currency,
      totalAmount: total,
      paymentCount: quote.allocation.length,
      bankRequestId: requestId,
      paidAt: now,
    });

    return this.status(companyId, now);
  }

  /**
   * Files a period as paid, from either direction, once.
   *
   * Two things can race here: our own confirm and the webhook the bank fires
   * for the same run. Both are welcome and neither may duplicate, so a
   * collision on `(companyId, period)` or on `bankRequestId` is success — the
   * period is paid, which is all the row means.
   */
  async record(input: {
    companyId: string;
    period: Date;
    currency: string;
    totalAmount: Prisma.Decimal;
    /** Transfers in the run: one per person, plus the statutory ones. */
    paymentCount: number;
    bankRequestId: string | null;
    paidAt: Date;
  }): Promise<void> {
    try {
      await this.prisma.payrollRun.create({
        data: {
          companyId: input.companyId,
          period: input.period,
          currency: input.currency,
          totalAmount: input.totalAmount,
          paymentCount: input.paymentCount,
          bankRequestId: input.bankRequestId,
          paidAt: input.paidAt,
        },
      });

      this.logger.log(
        `Payroll for ${periodLabel(input.period)} recorded as paid ` +
          `(${input.totalAmount.toFixed(2)} ${input.currency})`,
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        this.logger.debug(`Payroll for ${periodLabel(input.period)} was already on file`);
        return;
      }
      throw error;
    }
  }

  /** The period the app would file a run against right now. */
  async periodFor(companyId: string, now = new Date()): Promise<Date> {
    return payrollPeriodFor(await this.paydayOf(companyId), now).period;
  }

  private blocker(
    onPayrollCount: number,
    parameters: PayrollParameters | null,
    accountCount: number,
  ): PayrollBlocker | null {
    // Ordered by what the owner would fix first, and what makes the rest moot:
    // no staff means nothing to pay however the bank is set up.
    if (onPayrollCount === 0) return 'NO_EMPLOYEES';
    if (!parameters) return 'TAX_SETTINGS_MISSING';
    if (accountCount === 0) return 'NO_ACCOUNTS';
    if (!this.bank.isConfigured()) return 'BANK_NOT_CONFIGURED';
    return null;
  }

  /**
   * Everything one period's payroll is computed from.
   *
   * Who is on it follows the same rule as the team page's "this month's
   * payroll" figure — everyone employed by the end of the month, whether or
   * not they are away — so the number on the page and the money sent to the
   * bank are the same number.
   *
   * Each person's gross splits three ways, all from the one formula in
   * `calculateNetSalary`: net to them, contributions and income tax to the
   * state. The three add up to gross exactly, which is what the run pays.
   */
  private async context(companyId: string, now: Date) {
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { currency: true, country: true, paydayDayOfMonth: true },
    });

    const { period, payday } = payrollPeriodFor(company.paydayDayOfMonth, now);
    const parameters = await this.payroll.parametersFor(company.country, period.getFullYear());

    const employees = await this.prisma.employee.findMany({
      where: { companyId },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, salary: true, hireDate: true, iban: true },
    });

    const monthEnd = periodEnd(period);
    const onPayroll = employees.filter(
      (employee) => employee.hireDate.toISOString().slice(0, 10) <= monthEnd,
    );

    const lines: PayrollLine[] = [];
    let netTotal = new Decimal(0);
    let contributions = new Decimal(0);
    let incomeTax = new Decimal(0);

    if (parameters) {
      for (const employee of onPayroll) {
        const breakdown = calculateNetSalary(employee.salary, parameters);

        lines.push({
          employeeId: employee.id,
          name: `${employee.firstName} ${employee.lastName}`,
          net: breakdown.net.toFixed(2),
          gross: breakdown.gross.toFixed(2),
          iban: employee.iban,
        });

        netTotal = netTotal.plus(breakdown.net);
        contributions = contributions.plus(breakdown.contributions);
        incomeTax = incomeTax.plus(breakdown.incomeTax);
      }
    }

    // Zero charges are left out rather than sent as a payment of nothing: the
    // bank refuses a non-positive amount, and rightly.
    const statutory: PayrollStatutoryLine[] = [];
    if (contributions.greaterThan(0)) {
      statutory.push({ kind: 'CONTRIBUTIONS', amount: contributions.toFixed(2) });
    }
    if (incomeTax.greaterThan(0)) {
      statutory.push({ kind: 'INCOME_TAX', amount: incomeTax.toFixed(2) });
    }

    const accounts = await this.prisma.bankAccount.findMany({
      // Only what the bank could actually pay from: it refuses the rest anyway,
      // and listing them as candidates would make a blocked account look usable.
      where: { companyId, status: BankAccountStatus.ACTIVE, currency: company.currency },
      select: { iban: true },
    });

    return {
      period,
      payday,
      currency: company.currency,
      parameters,
      lines,
      statutory,
      onPayrollCount: onPayroll.length,
      netTotal: netTotal.toFixed(2),
      statutoryTotal: contributions.plus(incomeTax).toFixed(2),
      grossTotal: netTotal.plus(contributions).plus(incomeTax).toFixed(2),
      accounts,
    };
  }

  private async paydayOf(companyId: string): Promise<number | null> {
    const { paydayDayOfMonth } = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { paydayDayOfMonth: true },
    });
    return paydayDayOfMonth;
  }
}

/**
 * The run as a list of payments for the bank: everyone's take-home pay, then
 * the two charges the same gross owes the state.
 */
export function paymentsFor(status: PayrollRunStatus): PayrollPayment[] {
  return [
    ...status.lines.map(
      (line): PayrollPayment => ({
        employeeId: line.employeeId,
        employeeName: line.name,
        amount: line.net,
      }),
    ),
    ...status.statutory.map(
      (line): PayrollPayment => ({
        employeeId: `${STATUTORY_PREFIX}${line.kind}`,
        employeeName: STATUTORY_NAMES[line.kind],
        amount: line.amount,
      }),
    ),
  ];
}

function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
