import { useCallback, useEffect, useState } from 'react';
import { api } from './api.ts';

export interface BankAccount {
  id: string;
  bankName: string;
  iban: string;
  currency: string;
  balance: string;
}

export interface CurrencyTotal {
  currency: string;
  total: string;
}

export function useBankAccounts() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [totals, setTotals] = useState<CurrencyTotal[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ accounts: BankAccount[]; totalsByCurrency: CurrencyTotal[] }>(
        '/bank-accounts',
      );
      setAccounts(data.accounts);
      setTotals(data.totalsByCurrency);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { accounts, totals, isLoading, reload: load };
}

/**
 * Formats a decimal string for display.
 *
 * Deliberately not Intl.NumberFormat: not every browser ships Macedonian
 * locale data, and the ones that don't silently fall back to English
 * separators — which would print 124.500,50 ден as "124,500.50". Grouping the
 * digit string directly also avoids Number(), so large amounts keep every
 * digit the database stored.
 */
export function formatAmount(amount: string, locale: string): string {
  const match = /^(-?)(\d+)(?:\.(\d*))?$/.exec(amount.trim());
  if (!match) return amount;

  const [, sign = '', whole = '0', fraction = ''] = match;
  const isMk = locale.startsWith('mk');
  const groupSeparator = isMk ? '.' : ',';
  const decimalSeparator = isMk ? ',' : '.';
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, groupSeparator);

  return `${sign}${grouped}${decimalSeparator}${fraction.padEnd(2, '0').slice(0, 2)}`;
}
