import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatAmount, maskAccount, useBankAccounts } from '../lib/useBankAccounts.ts';
import { AddBankAccountModal } from '../components/AddBankAccountModal.tsx';

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { totals, accounts, isLoading, reload } = useBankAccounts();
  const [isAdding, setIsAdding] = useState(false);

  // Totals never mix currencies; the first is the headline figure and any
  // others sit beside it.
  const [headline, ...otherCurrencies] = totals;

  return (
    <section className="accounts-page">
      <div className="balance-hero">
        <span className="kpi-label label-caps">{t('dashboard.totalBalance')}</span>
        <span className="balance-hero-figure">
          {isLoading
            ? '—'
            : headline
              ? `${formatAmount(headline.total, i18n.language)} ${headline.currency}`
              : `0,00 MKD`}
        </span>
        {otherCurrencies.length > 0 && (
          <span className="balance-hero-other">
            {otherCurrencies
              .map((total) => `${formatAmount(total.total, i18n.language)} ${total.currency}`)
              .join(' · ')}
          </span>
        )}
      </div>

      <div className="accounts-strip-header">
        <h2>{t('accounts.linked')}</h2>
        <Link to="/finance/accounts" className="link-arrow">
          {t('accounts.viewIndividually')}
        </Link>
      </div>

      <div className="accounts-strip">
        {accounts.map((account) => (
          <Link key={account.id} to={`/finance/accounts/${account.id}`} className="account-card">
            <span className="account-card-bank">{account.bankName}</span>
            <span className="account-card-number num">{maskAccount(account.iban)}</span>
            <span className="account-card-balance">
              {formatAmount(account.balance, i18n.language)} {account.currency}
            </span>
          </Link>
        ))}

        <button type="button" className="account-card account-card--add" onClick={() => setIsAdding(true)}>
          <span className="account-card-plus" aria-hidden="true">
            +
          </span>
          <span>{t('accounts.addCta')}</span>
        </button>
      </div>

      {isAdding && <AddBankAccountModal onClose={() => setIsAdding(false)} onCreated={() => void reload()} />}
    </section>
  );
}
