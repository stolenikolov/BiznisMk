/**
 * PLACEHOLDER FIGURES — none of this is real company data.
 *
 * The overview's balance comes from the live /bank-accounts endpoint. Income,
 * expenses, categories, the cash-flow series and the transaction list have no
 * source yet: there is no transactions module. They are invented here so the
 * screen can be built and reviewed, and they are kept in one file so wiring
 * real endpoints later is a contained change rather than a hunt through JSX.
 *
 * Anything importing from this file is showing demo content.
 */

export interface MiniStat {
  key: 'income' | 'expenses' | 'profit';
  amount: string;
  deltaPercent: number;
}

export interface SpendingCategory {
  key: string;
  percent: number;
}

export interface CashFlowPoint {
  month: string;
  income: number;
  expense: number;
}

export interface RecentTransaction {
  id: string;
  description: string;
  categoryKey: string;
  date: string;
  amount: string;
  direction: 'in' | 'out';
}

export const PLACEHOLDER_MINI_STATS: MiniStat[] = [
  { key: 'income', amount: '412300.00', deltaPercent: 8.2 },
  { key: 'expenses', amount: '268450.00', deltaPercent: 3.1 },
  { key: 'profit', amount: '143850.00', deltaPercent: 12.4 },
];

export const PLACEHOLDER_BALANCE_DELTA = 12.4;

/** Ranked highest first; the bars fade by rank rather than changing hue. */
export const PLACEHOLDER_CATEGORIES: SpendingCategory[] = [
  { key: 'salaries', percent: 46 },
  { key: 'rent', percent: 21 },
  { key: 'software', percent: 15 },
  { key: 'logistics', percent: 11 },
  { key: 'other', percent: 7 },
];

export const PLACEHOLDER_CASH_FLOW: CashFlowPoint[] = [
  { month: 'jan', income: 286000, expense: 214000 },
  { month: 'feb', income: 301000, expense: 228000 },
  { month: 'mar', income: 279000, expense: 236000 },
  { month: 'apr', income: 338000, expense: 241000 },
  { month: 'may', income: 352000, expense: 252000 },
  { month: 'jun', income: 329000, expense: 247000 },
  { month: 'jul', income: 371000, expense: 258000 },
  { month: 'aug', income: 394000, expense: 263000 },
  { month: 'sep', income: 412300, expense: 268450 },
];

export const PLACEHOLDER_TRANSACTIONS: RecentTransaction[] = [
  {
    id: 'tx-1',
    description: 'Технолаб АД',
    categoryKey: 'invoice',
    date: '2026-09-11',
    amount: '96500.00',
    direction: 'in',
  },
  {
    id: 'tx-2',
    description: 'Плати — септември',
    categoryKey: 'salaries',
    date: '2026-09-10',
    amount: '184000.00',
    direction: 'out',
  },
  {
    id: 'tx-3',
    description: 'Наем на канцеларија',
    categoryKey: 'rent',
    date: '2026-09-05',
    amount: '42000.00',
    direction: 'out',
  },
  {
    id: 'tx-4',
    description: 'Комерц ДООЕЛ',
    categoryKey: 'invoice',
    date: '2026-09-03',
    amount: '184000.00',
    direction: 'in',
  },
  {
    id: 'tx-5',
    description: 'Хостинг и софтвер',
    categoryKey: 'software',
    date: '2026-09-02',
    amount: '12480.00',
    direction: 'out',
  },
];
