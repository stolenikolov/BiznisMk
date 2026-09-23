import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TransactionsService } from './transactions.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const Decimal = Prisma.Decimal;

interface StubRow {
  bookedAt: Date;
  direction: 'IN' | 'OUT';
  amount: string;
  category?: string;
}

/**
 * A company's ledger on 19 September 2026. Each row sits where it separates
 * the periods: this month, the rest of the quarter, the rest of the year, the
 * previous quarter, and last year — including a row older than the twelve
 * months the chart reads, which only the year comparison can reach.
 */
const LEDGER: StubRow[] = [
  { bookedAt: new Date(2026, 8, 10), direction: 'IN', amount: '1000.00' },
  { bookedAt: new Date(2026, 8, 12), direction: 'OUT', amount: '300.00', category: 'RENT' },
  { bookedAt: new Date(2026, 7, 5), direction: 'OUT', amount: '500.00', category: 'SALARIES' },
  { bookedAt: new Date(2026, 6, 3), direction: 'IN', amount: '2000.00', category: 'INVOICE' },
  { bookedAt: new Date(2026, 4, 15), direction: 'IN', amount: '600.00' },
  { bookedAt: new Date(2026, 1, 10), direction: 'OUT', amount: '100.00', category: 'SOFTWARE' },
  { bookedAt: new Date(2025, 10, 20), direction: 'IN', amount: '4000.00' },
  { bookedAt: new Date(2025, 2, 1), direction: 'OUT', amount: '800.00', category: 'LOGISTICS' },
];

/** Answers findMany the way the database would: by the booked-at window, newest first when asked. */
function serviceWithLedger(rows: StubRow[]) {
  const stored = rows.map((row, index) => ({
    id: `tx-${index}`,
    description: `Row ${index}`,
    category: row.category ?? 'OTHER',
    direction: row.direction,
    amount: new Decimal(row.amount),
    bookedAt: row.bookedAt,
  }));

  const findMany = vi.fn(
    async ({ where, orderBy }: { where: { bookedAt: { gte: Date; lt?: Date } }; orderBy?: unknown }) => {
      const { gte, lt } = where.bookedAt;
      const matching = stored.filter((row) => row.bookedAt >= gte && (!lt || row.bookedAt < lt));
      return orderBy ? [...matching].sort((a, b) => b.bookedAt.getTime() - a.bookedAt.getTime()) : matching;
    },
  );

  const prisma = { transaction: { findMany } } as unknown as PrismaService;
  return new TransactionsService(prisma);
}

describe('TransactionsService.buildOverview', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 19, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('defaults to this month against the whole of last month', async () => {
    const overview = await serviceWithLedger(LEDGER).buildOverview('company-1');

    expect(overview.summary).toEqual({ income: '1000.00', expenses: '300.00', profit: '700.00' });
    // Nothing came in last month, so there is no income change to show.
    expect(overview.deltas.income).toBeNull();
    expect(overview.deltas.expenses).toBe(-40);
    expect(overview.categories).toEqual([{ category: 'RENT', amount: '300.00', percent: 100 }]);
  });

  it('sums the quarter to date and compares it with the previous quarter', async () => {
    const overview = await serviceWithLedger(LEDGER).buildOverview('company-1', 'quarter');

    expect(overview.summary).toEqual({ income: '3000.00', expenses: '800.00', profit: '2200.00' });
    expect(overview.deltas.income).toBe(400);
    expect(overview.categories).toEqual([
      { category: 'SALARIES', amount: '500.00', percent: 63 },
      { category: 'RENT', amount: '300.00', percent: 38 },
    ]);
  });

  it('compares the year to date with all of last year, beyond the chart window', async () => {
    const overview = await serviceWithLedger(LEDGER).buildOverview('company-1', 'year');

    expect(overview.summary).toEqual({ income: '3600.00', expenses: '900.00', profit: '2700.00' });
    expect(overview.deltas.income).toBe(-10);
    // Last year's 800 includes the March row, older than the chart's twelve months.
    expect(overview.deltas.expenses).toBe(12.5);
  });

  it('keeps the chart and recent rows on their own window whatever the period', async () => {
    const service = serviceWithLedger(LEDGER);
    const month = await service.buildOverview('company-1', 'month');
    const year = await service.buildOverview('company-1', 'year');

    expect(year.cashFlow).toEqual(month.cashFlow);
    expect(year.recentTransactions).toEqual(month.recentTransactions);
    expect(month.cashFlow).toHaveLength(12);
    expect(month.cashFlow[0]).toEqual({ month: '2025-10', income: '0.00', expense: '0.00' });
    expect(month.cashFlow[11]).toEqual({ month: '2026-09', income: '1000.00', expense: '300.00' });
    expect(month.recentTransactions[0]?.id).toBe('tx-1');
  });
});
