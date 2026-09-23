import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { TransactionDirection } from '../generated/prisma/enums.js';
import {
  bucketKey,
  isoDate,
  resolvePeriod,
  resolveTrendWindow,
  type BucketSize,
  type Granularity,
  type PeriodPreset,
} from './finance-period.js';

const Decimal = Prisma.Decimal;

export interface TransactionView {
  id: string;
  description: string;
  category: string;
  direction: TransactionDirection;
  amount: string;
  bookedAt: string;
}

export interface OverviewResponse {
  /** The selected period up to today, derived from booked transactions. */
  summary: { income: string; expenses: string; profit: string };
  /** Change against the whole previous period, null when there is nothing to compare. */
  deltas: { income: number | null; expenses: number | null; profit: number | null };
  /** Share of spending per category within the period, highest first. */
  categories: { category: string; percent: number; amount: string }[];
  /** Month-by-month totals for the cash-flow chart, oldest first. */
  cashFlow: { month: string; income: string; expense: string }[];
  recentTransactions: TransactionView[];
  hasData: boolean;
}

export interface FinanceSummary {
  income: string;
  expenses: string;
  profit: string;
  /** Share of income kept, as a percentage. Null when nothing came in. */
  savingsRate: number | null;
  deltas: {
    income: number | null;
    expenses: number | null;
    profit: number | null;
    /** In percentage points — a rate does not change by a percentage. */
    savingsRatePoints: number | null;
  };
}

export interface FinanceResponse {
  period: { preset: PeriodPreset; from: string; to: string };
  summary: FinanceSummary;
  categories: { category: string; percent: number; amount: string }[];
  trend: {
    granularity: Granularity;
    bucket: BucketSize;
    points: { date: string; income: string; expense: string }[];
  };
  /** Anything booked inside the selected period. */
  hasData: boolean;
  /** Anything booked inside the chart's own window, which differs from it. */
  trendHasData: boolean;
}

export interface FinanceQuery {
  preset: PeriodPreset;
  granularity: Granularity;
  from?: Date;
  to?: Date;
}

const MONTHS_OF_HISTORY = 12;

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function percentChange(current: Prisma.Decimal, previous: Prisma.Decimal): number | null {
  if (previous.isZero()) return null;
  return Number(current.minus(previous).div(previous).mul(100).toFixed(1));
}

function sumDirections(
  rows: { direction: TransactionDirection; amount: Prisma.Decimal }[],
): { income: Prisma.Decimal; expense: Prisma.Decimal } {
  let income = new Decimal(0);
  let expense = new Decimal(0);

  for (const row of rows) {
    if (row.direction === TransactionDirection.IN) income = income.add(row.amount);
    else expense = expense.add(row.amount);
  }

  return { income, expense };
}

/** Share of spending per category, highest first. */
function spendingByCategory(
  rows: { category: string; direction: TransactionDirection; amount: Prisma.Decimal }[],
): { category: string; percent: number; amount: string }[] {
  const byCategory = new Map<string, Prisma.Decimal>();
  for (const row of rows) {
    if (row.direction !== TransactionDirection.OUT) continue;
    byCategory.set(row.category, (byCategory.get(row.category) ?? new Decimal(0)).add(row.amount));
  }
  const spendTotal = [...byCategory.values()].reduce((sum, value) => sum.add(value), new Decimal(0));

  return [...byCategory.entries()]
    .sort(([, a], [, b]) => b.comparedTo(a))
    .map(([category, amount]) => ({
      category,
      amount: amount.toFixed(2),
      percent: spendTotal.isZero() ? 0 : Math.round(amount.div(spendTotal).mul(100).toNumber()),
    }));
}

/** Share of income kept. Undefined without income, so it stays null. */
function savingsRate(income: Prisma.Decimal, profit: Prisma.Decimal): number | null {
  if (income.isZero()) return null;
  return Number(profit.div(income).mul(100).toFixed(1));
}

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findRecent(companyId: string, take = 50): Promise<TransactionView[]> {
    const rows = await this.prisma.transaction.findMany({
      where: { companyId },
      orderBy: { bookedAt: 'desc' },
      take,
    });
    return rows.map(toView);
  }

  /**
   * Everything the finance page shows, for one selected period.
   *
   * The summary and the category split follow the period; the trend chart has
   * its own window, because its pills pick a range independently of it. Empty
   * periods come back as zeroes with `hasData` false — the page branches on
   * that rather than drawing zeroes as though they were figures.
   */
  async buildFinance(companyId: string, query: FinanceQuery): Promise<FinanceResponse> {
    const now = new Date();
    const { current, previous } = resolvePeriod(query.preset, now, { from: query.from, to: query.to });
    const window = resolveTrendWindow(query.granularity, now);

    // One read covers the period and its comparison window; the trend window
    // can start earlier or later than either, so it gets its own.
    const [periodRows, trendRows] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { companyId, bookedAt: { gte: previous.from, lt: current.to } },
        select: { category: true, direction: true, amount: true, bookedAt: true },
      }),
      this.prisma.transaction.findMany({
        where: { companyId, bookedAt: { gte: window.range.from, lt: window.range.to } },
        select: { direction: true, amount: true, bookedAt: true },
      }),
    ]);

    const currentRows = periodRows.filter(
      (row) => row.bookedAt >= current.from && row.bookedAt < current.to,
    );
    const previousRows = periodRows.filter(
      (row) => row.bookedAt >= previous.from && row.bookedAt < previous.to,
    );

    const currentTotals = sumDirections(currentRows);
    const previousTotals = sumDirections(previousRows);
    const currentProfit = currentTotals.income.minus(currentTotals.expense);
    const previousProfit = previousTotals.income.minus(previousTotals.expense);
    const currentRate = savingsRate(currentTotals.income, currentProfit);
    const previousRate = savingsRate(previousTotals.income, previousProfit);

    const buckets = new Map<string, { income: Prisma.Decimal; expense: Prisma.Decimal }>();
    for (const row of trendRows) {
      const key = bucketKey(row.bookedAt, window.bucket);
      const bucket = buckets.get(key) ?? { income: new Decimal(0), expense: new Decimal(0) };
      if (row.direction === TransactionDirection.IN) {
        bucket.income = bucket.income.add(row.amount);
      } else {
        bucket.expense = bucket.expense.add(row.amount);
      }
      buckets.set(key, bucket);
    }

    return {
      period: {
        preset: query.preset,
        from: isoDate(current.from),
        to: isoDate(new Date(current.to.getTime() - 1)),
      },
      summary: {
        income: currentTotals.income.toFixed(2),
        expenses: currentTotals.expense.toFixed(2),
        profit: currentProfit.toFixed(2),
        savingsRate: currentRate,
        deltas: {
          income: percentChange(currentTotals.income, previousTotals.income),
          expenses: percentChange(currentTotals.expense, previousTotals.expense),
          profit: percentChange(currentProfit, previousProfit),
          savingsRatePoints:
            currentRate === null || previousRate === null
              ? null
              : Number((currentRate - previousRate).toFixed(1)),
        },
      },
      categories: spendingByCategory(currentRows),
      trend: {
        granularity: query.granularity,
        bucket: window.bucket,
        // Every bucket is emitted, empty ones included, so the axis has no gaps.
        points: window.starts.map((start) => {
          const bucket = buckets.get(isoDate(start));
          return {
            date: isoDate(start),
            income: (bucket?.income ?? new Decimal(0)).toFixed(2),
            expense: (bucket?.expense ?? new Decimal(0)).toFixed(2),
          };
        }),
      },
      hasData: currentRows.length > 0,
      trendHasData: trendRows.length > 0,
    };
  }

  /**
   * Everything the overview shows, computed from stored transactions. With no
   * transactions the figures come back as zeroes and `hasData` is false, which
   * is what the UI branches on for its empty states — no invented numbers.
   *
   * The figures and the category split follow the selected period, compared
   * the way the finance page compares them; the cash-flow chart and the recent
   * transactions do not, because the chart has its own range pills.
   */
  async buildOverview(companyId: string, preset: PeriodPreset = 'month'): Promise<OverviewResponse> {
    const now = new Date();
    const since = new Date(now.getFullYear(), now.getMonth() - (MONTHS_OF_HISTORY - 1), 1);
    const { current, previous } = resolvePeriod(preset, now);

    // A year compared with the last one reaches further back than the chart's
    // twelve months, so the period gets its own read.
    const [rows, periodRows] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { companyId, bookedAt: { gte: since } },
        orderBy: { bookedAt: 'desc' },
      }),
      this.prisma.transaction.findMany({
        where: { companyId, bookedAt: { gte: previous.from, lt: current.to } },
        select: { category: true, direction: true, amount: true, bookedAt: true },
      }),
    ]);

    const currentRows = periodRows.filter((row) => row.bookedAt >= current.from && row.bookedAt < current.to);
    const previousRows = periodRows.filter((row) => row.bookedAt >= previous.from && row.bookedAt < previous.to);
    const currentTotals = sumDirections(currentRows);
    const previousTotals = sumDirections(previousRows);
    const currentProfit = currentTotals.income.minus(currentTotals.expense);
    const previousProfit = previousTotals.income.minus(previousTotals.expense);

    const byMonth = new Map<string, { income: Prisma.Decimal; expense: Prisma.Decimal }>();
    for (const row of rows) {
      const key = monthKey(row.bookedAt);
      const bucket = byMonth.get(key) ?? { income: new Decimal(0), expense: new Decimal(0) };
      if (row.direction === TransactionDirection.IN) bucket.income = bucket.income.add(row.amount);
      else bucket.expense = bucket.expense.add(row.amount);
      byMonth.set(key, bucket);
    }

    // Always emit a continuous run of months so the chart's x-axis has no gaps.
    const cashFlow = Array.from({ length: MONTHS_OF_HISTORY }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (MONTHS_OF_HISTORY - 1 - index), 1);
      const bucket = byMonth.get(monthKey(date));
      return {
        month: monthKey(date),
        income: (bucket?.income ?? new Decimal(0)).toFixed(2),
        expense: (bucket?.expense ?? new Decimal(0)).toFixed(2),
      };
    });

    return {
      summary: {
        income: currentTotals.income.toFixed(2),
        expenses: currentTotals.expense.toFixed(2),
        profit: currentProfit.toFixed(2),
      },
      deltas: {
        income: percentChange(currentTotals.income, previousTotals.income),
        expenses: percentChange(currentTotals.expense, previousTotals.expense),
        profit: percentChange(currentProfit, previousProfit),
      },
      categories: spendingByCategory(currentRows),
      cashFlow,
      recentTransactions: rows.slice(0, 5).map(toView),
      hasData: rows.length > 0,
    };
  }
}

function toView(row: {
  id: string;
  description: string;
  category: string;
  direction: TransactionDirection;
  amount: Prisma.Decimal;
  bookedAt: Date;
}): TransactionView {
  return {
    id: row.id,
    description: row.description,
    category: row.category,
    direction: row.direction,
    amount: row.amount.toFixed(2),
    bookedAt: row.bookedAt.toISOString().slice(0, 10),
  };
}
