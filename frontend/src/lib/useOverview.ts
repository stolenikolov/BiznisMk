import { useCallback, useEffect, useState } from 'react';
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

export interface Overview {
  monthly: { income: string; expenses: string; profit: string };
  deltas: { income: number | null; expenses: number | null; profit: number | null };
  categories: { category: string; percent: number; amount: string }[];
  cashFlow: CashFlowPoint[];
  recentTransactions: OverviewTransaction[];
  /** False until the company has at least one booked transaction. */
  hasData: boolean;
}

const EMPTY: Overview = {
  monthly: { income: '0.00', expenses: '0.00', profit: '0.00' },
  deltas: { income: null, expenses: null, profit: null },
  categories: [],
  cashFlow: [],
  recentTransactions: [],
  hasData: false,
};

/** Everything on the overview comes from this one aggregate of stored rows. */
export function useOverview() {
  const [overview, setOverview] = useState<Overview>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<Overview>('/transactions/overview');
      setOverview(data);
    } catch {
      setOverview(EMPTY);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { overview, isLoading, reload: load };
}
