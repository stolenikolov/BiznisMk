import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatAmount, useBankAccounts } from '../lib/useBankAccounts.ts';
import { AddBankAccountModal } from '../components/AddBankAccountModal.tsx';

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { totals, accounts, isLoading, reload } = useBankAccounts();
  const [isAdding, setIsAdding] = useState(false);

  // Totals never mix currencies; the first is the headline figure and any
  // others are listed beside it.
  const [headline, ...otherCurrencies] = totals;

  return (
    <section>
      <h1 className="page-title">{t('dashboard.title')}</h1>

      <div className="card balance-card">
        <span className="kpi-label label-caps">{t('dashboard.totalBalance')}</span>
        {isLoading ? (
          <span className="kpi-value">—</span>
        ) : (
          <span className="kpi-value kpi-value--accent">
            {headline ? `${formatAmount(headline.total, i18n.language)} ${headline.currency}` : `0,00 MKD`}
          </span>
        )}
        <span className="kpi-delta">
          {t('dashboard.accountCount', { count: accounts.length })}
        </span>

        {otherCurrencies.length > 0 && (
          <ul className="balance-other">
            {otherCurrencies.map((total) => (
              <li key={total.currency}>
                <span className="num">
                  {formatAmount(total.total, i18n.language)} {total.currency}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="balance-actions">
          <button type="button" className="btn-primary" onClick={() => setIsAdding(true)}>
            {t('accounts.addCta')}
          </button>
          <Link to="/finance/accounts" className="btn-ghost">
            {t('accounts.viewIndividually')}
          </Link>
        </div>
      </div>

      {isAdding && <AddBankAccountModal onClose={() => setIsAdding(false)} onCreated={() => void reload()} />}
    </section>
  );
}
