import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { TransactionDirection } from '../generated/prisma/enums.js';

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
  /** Current calendar month, derived from booked transactions. */
  monthly: { income: string; expenses: string; profit: string };
  /** Change against the previous month, null when there is nothing to compare. */
  deltas: { income: number | null; expenses: number | null; profit: number | null };
  /** Share of spending per category, highest first. */
  categories: { category: string; percent: number; amount: string }[];
  /** Month-by-month totals for the cash-flow chart, oldest first. */
  cashFlow: { month: string; income: string; expense: string }[];
  recentTransactions: TransactionView[];
  hasData: boolean;
}

const MONTHS_OF_HISTORY = 12;

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function percentChange(current: Prisma.Decimal, previous: Prisma.Decimal): number | null {
  if (previous.isZero()) return null;
  return Number(current.minus(previous).div(previous).mul(100).toFixed(1));
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
   * Everything the overview shows, computed from stored transactions. With no
   * transactions the figures come back as zeroes and `hasData` is false, which
   * is what the UI branches on for its empty states — no invented numbers.
   */
  async buildOverview(companyId: string): Promise<OverviewResponse> {
    const since = new Date();
    since.setMonth(since.getMonth() - (MONTHS_OF_HISTORY - 1), 1);
    since.setHours(0, 0, 0, 0);

    const rows = await this.prisma.transaction.findMany({
      where: { companyId, bookedAt: { gte: since } },
      orderBy: { bookedAt: 'desc' },
    });

    const now = new Date();
    const thisMonth = monthKey(now);
    const previousMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));

    const byMonth = new Map<string, { income: Prisma.Decimal; expense: Prisma.Decimal }>();
    const byCategory = new Map<string, Prisma.Decimal>();

    for (const row of rows) {
      const key = monthKey(row.bookedAt);
      const bucket = byMonth.get(key) ?? { income: new Decimal(0), expense: new Decimal(0) };

      if (row.direction === TransactionDirection.IN) {
        bucket.income = bucket.income.add(row.amount);
      } else {
        bucket.expense = bucket.expense.add(row.amount);
        byCategory.set(row.category, (byCategory.get(row.category) ?? new Decimal(0)).add(row.amount));
      }
      byMonth.set(key, bucket);
    }

    const current = byMonth.get(thisMonth) ?? { income: new Decimal(0), expense: new Decimal(0) };
    const previous = byMonth.get(previousMonth) ?? { income: new Decimal(0), expense: new Decimal(0) };
    const currentProfit = current.income.minus(current.expense);
    const previousProfit = previous.income.minus(previous.expense);

    const spendTotal = [...byCategory.values()].reduce((sum, value) => sum.add(value), new Decimal(0));
    const categories = [...byCategory.entries()]
      .sort(([, a], [, b]) => b.comparedTo(a))
      .map(([category, amount]) => ({
        category,
        amount: amount.toFixed(2),
        percent: spendTotal.isZero() ? 0 : Math.round(amount.div(spendTotal).mul(100).toNumber()),
      }));

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
      monthly: {
        income: current.income.toFixed(2),
        expenses: current.expense.toFixed(2),
        profit: currentProfit.toFixed(2),
      },
      deltas: {
        income: percentChange(current.income, previous.income),
        expenses: percentChange(current.expense, previous.expense),
        profit: percentChange(currentProfit, previousProfit),
      },
      categories,
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
