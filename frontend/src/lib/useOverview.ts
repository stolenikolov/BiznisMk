import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.ts';

export interface CashFlowPoint {
  month: string;
  income: string;
  expense: string;
}

export interface OverviewTransaction {
  id: string;
  description: string;
  category: string;
  direction: 'IN' | 'OUT';
  amount: string;
  bookedAt: string;
}

/** The periods the overview's select offers; each runs from its start up to today. */
export const OVERVIEW_PERIODS = ['month', 'quarter', 'year'] as const;
export type OverviewPeriod = (typeof OVERVIEW_PERIODS)[number];

export interface Overview {
  /** The selected period up to today. */
  summary: { income: string; expenses: string; profit: string };
  /** Against the whole previous period — last month, quarter or year. */
  deltas: { income: number | null; expenses: number | null; profit: number | null };
  /** Spending within the selected period. */
  categories: { category: string; percent: number; amount: string }[];
  /** The last twelve months, whatever the period: the chart has its own range pills. */
  cashFlow: CashFlowPoint[];
  recentTransactions: OverviewTransaction[];
  /** False until the company has at least one booked transaction. */
  hasData: boolean;
}

const EMPTY: Overview = {
  summary: { income: '0.00', expenses: '0.00', profit: '0.00' },
  deltas: { income: null, expenses: null, profit: null },
  categories: [],
  cashFlow: [],
  recentTransactions: [],
  hasData: false,
};

/**
 * Everything on the overview comes from this one aggregate of stored rows.
 *
 * Switching the period keeps the figures on screen until the new ones arrive,
 * rather than dropping to zero in between.
 */
export function useOverview(period: OverviewPeriod) {
  const [overview, setOverview] = useState<Overview>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);
  // Only the latest request may land: switching month → year → month quickly
  // must not end on the year's figures because that answer came back last.
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    const request = ++latestRequest.current;
    try {
      const { data } = await api.get<Overview>('/transactions/overview', { params: { period } });
      if (request === latestRequest.current) setOverview(data);
    } catch {
      if (request === latestRequest.current) setOverview(EMPTY);
    } finally {
      if (request === latestRequest.current) setIsLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  return { overview, isLoading, reload: load };
}
