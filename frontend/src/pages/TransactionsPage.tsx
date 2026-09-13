import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.ts';
import { formatAmount } from '../lib/useBankAccounts.ts';
import type { OverviewTransaction } from '../lib/useOverview.ts';
import { InvoiceIcon } from '../components/icons.tsx';

export function TransactionsPage() {
  const { t, i18n } = useTranslation();
  const [transactions, setTransactions] = useState<OverviewTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ transactions: OverviewTransaction[] }>('/transactions')
      .then(({ data }) => setTransactions(data.transactions))
      .catch(() => setTransactions([]))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <section>
      <h1 className="page-title">{t('nav.transactions')}</h1>

      {isLoading ? (
        <p className="dashboard-placeholder">{t('common.loading')}</p>
      ) : transactions.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <span className="empty-state-icon">
              <InvoiceIcon />
            </span>
            <p>{t('overview.empty.transactions')}</p>
            <Link to="/finance/accounts" className="btn-ghost">
              {t('accounts.addCta')}
            </Link>
          </div>
        </div>
      ) : (
        <div className="card">
          <ul className="transaction-list">
            {transactions.map((transaction) => (
              <li key={transaction.id}>
                <div className="transaction-main">
                  <span className="transaction-description">{transaction.description}</span>
                  <span className="badge">{t(`overview.categories.${transaction.category.toLowerCase()}`)}</span>
                </div>
                <div className="transaction-meta">
                  <span className="num transaction-date">{transaction.bookedAt}</span>
                  <span
                    className={`num transaction-amount${transaction.direction === 'OUT' ? ' is-negative' : ''}`}
                  >
                    {transaction.direction === 'OUT' ? '−' : '+'}
                    {formatAmount(transaction.amount, i18n.language)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
