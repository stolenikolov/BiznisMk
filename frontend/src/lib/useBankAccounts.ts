import { useCallback, useEffect, useState } from 'react';
import { api } from './api.ts';

// The formatting helpers moved to money.ts; re-exported so existing imports
// keep working.
export { formatAmount, groupIban, maskAccount } from './money.ts';

export type BankAccountStatus = 'ACTIVE' | 'BLOCKED' | 'CLOSED';

/** An active loan on the account. Null on the accounts that carry none. */
export interface CreditLine {
  creditAmount: string;
  remainingBalance: string;
  nextPaymentDate: string;
  installmentAmount: string;
  totalInstallments: number;
  installmentsPaid: number;
}

export interface BankAccount {
  id: string;
  bankName: string;
  iban: string;
  /** The company owner the account stands in the name of. */
  holderName: string | null;
  currency: string;
  balance: string;
  status: BankAccountStatus;
  creditLine: CreditLine | null;
}

export interface AccountTransaction {
  id: string;
  description: string;
  category: string;
  direction: 'IN' | 'OUT';
  amount: string;
  bookedAt: string;
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
 * One account and its own statement, for the account's page. Kept separate
 * from the list: the detail view must not depend on the whole list having
 * loaded, and it reads that account's transactions rather than the company's.
 */
export function useBankAccount(accountId: string | undefined) {
  const [account, setAccount] = useState<BankAccount | null>(null);
  const [transactions, setTransactions] = useState<AccountTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!accountId) return;
    setIsLoading(true);
    setNotFound(false);

    try {
      const [details, statement] = await Promise.all([
        api.get<{ account: BankAccount }>(`/bank-accounts/${accountId}`),
        api.get<{ transactions: AccountTransaction[] }>(
          `/bank-accounts/${accountId}/transactions?limit=50`,
        ),
      ]);
      setAccount(details.data.account);
      setTransactions(statement.data.transactions);
    } catch {
      setAccount(null);
      setNotFound(true);
    } finally {
      setIsLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { account, transactions, isLoading, notFound, reload: load };
}
