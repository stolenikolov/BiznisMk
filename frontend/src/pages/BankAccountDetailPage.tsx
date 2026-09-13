import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { formatAmount, maskAccount, useBankAccounts } from '../lib/useBankAccounts.ts';

export function BankAccountDetailPage() {
  const { t, i18n } = useTranslation();
  const { accountId } = useParams();
  const { accounts, isLoading } = useBankAccounts();

  const account = accounts.find((item) => item.id === accountId);

  if (isLoading) {
    return <p className="dashboard-placeholder">{t('common.loading')}</p>;
  }

  if (!account) {
    return (
      <section>
        <h1 className="page-title">{t('accounts.notFound')}</h1>
        <Link to="/finance/accounts" className="btn-ghost">
          {t('accounts.backToList')}
        </Link>
      </section>
    );
  }

  return (
    <section>
      <Link to="/finance/accounts" className="link-arrow">
        {t('accounts.backToList')}
      </Link>

      <div className="account-detail-head">
        <h1 className="page-title">{account.bankName}</h1>
        <span className="num account-detail-number">{maskAccount(account.iban)}</span>
      </div>

      <div className="card balance-card">
        <span className="kpi-label label-caps">{t('accounts.balance')}</span>
        <span className="kpi-value kpi-value--accent">
          {formatAmount(account.balance, i18n.language)} {account.currency}
        </span>
      </div>

      <div className="card account-detail-transactions">
        <div className="card-header">
          <h2>{t('accounts.transactions')}</h2>
        </div>
        <p className="dashboard-placeholder">{t('accounts.transactionsPending')}</p>
      </div>
    </section>
  );
}
