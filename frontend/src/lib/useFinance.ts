import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.ts';

export const PERIOD_PRESETS = ['week', 'month', 'quarter', 'year', 'custom'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const GRANULARITIES = ['7d', '30d', '3m', '1y'] as const;
export type Granularity = (typeof GRANULARITIES)[number];

export interface CustomRange {
  from: string;
  to: string;
}

export interface FinanceSummary {
  income: string;
  expenses: string;
  profit: string;
  savingsRate: number | null;
  deltas: {
    income: number | null;
    expenses: number | null;
    profit: number | null;
    /** The difference between the two rates (20 → 22 is 2). Displayed with a % sign. */
    savingsRatePoints: number | null;
  };
}

export interface TrendPoint {
  date: string;
  income: string;
  expense: string;
}

export interface Finance {
  period: { preset: PeriodPreset; from: string; to: string };
  summary: FinanceSummary;
  categories: { category: string; percent: number; amount: string }[];
  trend: { granularity: Granularity; bucket: 'day' | 'week' | 'month'; points: TrendPoint[] };
  /** Whether the selected period holds anything at all. */
  hasData: boolean;
  /** The chart's window is its own, so it can be empty while the period is not. */
  trendHasData: boolean;
}

/**
 * Everything on the finance page comes from this one aggregate, fetched for
 * the selected period. There is deliberately no fallback shape: until the
 * request resolves the page shows skeletons, and a failure shows an error —
 * neither invents figures.
 */
export function useFinance() {
  const [finance, setFinance] = useState<Finance | null>(null);
  const [period, setPeriodState] = useState<PeriodPreset>('month');
  const [customRange, setCustomRangeState] = useState<CustomRange | null>(null);
  const [granularity, setGranularityState] = useState<Granularity>('30d');
  const [isLoading, setIsLoading] = useState(true);
  const [isTrendLoading, setIsTrendLoading] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);

  // Which control triggered the fetch decides what shows a loading state: a new
  // period replaces every figure, a new granularity only redraws the chart.
  const trendOnly = useRef(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    if (trendOnly.current) setIsTrendLoading(true);
    else setIsLoading(true);
    setHasFailed(false);

    const params = new URLSearchParams({ period, granularity });
    if (period === 'custom' && customRange) {
      params.set('from', customRange.from);
      params.set('to', customRange.to);
    }

    try {
      const { data } = await api.get<Finance>(`/transactions/finance?${params.toString()}`);
      // A slower earlier request must not overwrite a newer answer.
      if (id !== requestId.current) return;
      setFinance(data);
    } catch {
      if (id !== requestId.current) return;
      setHasFailed(true);
    } finally {
      if (id === requestId.current) {
        setIsLoading(false);
        setIsTrendLoading(false);
        trendOnly.current = false;
      }
    }
  }, [period, granularity, customRange]);

  useEffect(() => {
    void load();
  }, [load]);

  const setPeriod = useCallback((next: PeriodPreset) => {
    trendOnly.current = false;
    setPeriodState(next);
    if (next !== 'custom') setCustomRangeState(null);
  }, []);

  const setCustomRange = useCallback((range: CustomRange) => {
    trendOnly.current = false;
    setPeriodState('custom');
    setCustomRangeState(range);
  }, []);

  const setGranularity = useCallback((next: Granularity) => {
    trendOnly.current = true;
    setGranularityState(next);
  }, []);

  return {
    finance,
    period,
    customRange,
    granularity,
    isLoading,
    isTrendLoading,
    hasFailed,
    setPeriod,
    setCustomRange,
    setGranularity,
    reload: load,
  };
}
