import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { formatAmount, groupIban, useBankAccount } from '../lib/useBankAccounts.ts';
import { FinanceIcon } from '../components/icons.tsx';

export function BankAccountDetailPage() {
  const { t, i18n } = useTranslation();
  const { accountId } = useParams();
  const { account, transactions, isLoading, notFound } = useBankAccount(accountId);

  if (isLoading) {
    return <p className="dashboard-placeholder">{t('common.loading')}</p>;
  }

  if (notFound || !account) {
    return (
      <section>
        <h1 className="page-title">{t('accounts.notFound')}</h1>
        <Link to="/finance/accounts" className="btn-ghost">
          {t('accounts.backToList')}
        </Link>
      </section>
    );
  }

  const credit = account.creditLine;
  const paidPercent = credit
    ? Math.round((credit.installmentsPaid / credit.totalInstallments) * 100)
    : 0;
  const isBlocked = account.status !== 'ACTIVE';

  return (
    <section className="finance account-detail">
      <Link to="/finance/accounts" className="link-arrow">
        {t('accounts.backToList')}
      </Link>

      <div className="account-detail-head">
        <div>
          <h1 className="page-title">{account.bankName}</h1>
          <span className="account-detail-status">
            <span
              className={`status-dot ${isBlocked ? 'is-blocked' : 'is-active'}`}
              aria-hidden="true"
            />
            {t(`finance.status.${account.status}`)}
          </span>
        </div>
        <div className="card balance-card">
          <span className="kpi-label label-caps">{t('accounts.balance')}</span>
          <span className="kpi-value kpi-value--accent">
            {formatAmount(account.balance, i18n.language, account.currency)} {account.currency}
          </span>
        </div>
      </div>

      {/* Identity ---------------------------------------------------------- */}
      <section className="card">
        <div className="card-header">
          <h2 className="finance-card-title">{t('accounts.detailsTitle')}</h2>
        </div>
        <dl className="account-facts">
          <div>
            <dt>{t('accounts.iban')}</dt>
            <dd className="num">{groupIban(account.iban)}</dd>
          </div>
          <div>
            <dt>{t('accounts.bankName')}</dt>
            <dd>{account.bankName}</dd>
          </div>
          <div>
            <dt>{t('accounts.holder')}</dt>
            {/* Older accounts predate the holder being recorded. */}
            <dd>{account.holderName ?? <span className="muted">{t('accounts.holderUnknown')}</span>}</dd>
          </div>
          <div>
            <dt>{t('accounts.currency')}</dt>
            <dd>{account.currency}</dd>
          </div>
        </dl>
      </section>

      {/* Credit line ------------------------------------------------------- */}
      <section className="card">
        <div className="card-header">
          <h2 className="finance-card-title">{t('accounts.creditTitle')}</h2>
        </div>

        {credit ? (
          <div className="credit-card credit-card--flush">
            <div>
              <span className="label-caps">{t('finance.remainingDebt')}</span>
              <div className="credit-remaining">
                {formatAmount(credit.remainingBalance, i18n.language, account.currency)} {account.currency}
              </div>
            </div>

            <div
              className="credit-progress"
              role="progressbar"
              aria-valuenow={paidPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t('finance.paidOff', { percent: paidPercent })}
            >
              <span style={{ width: `${paidPercent}%` }} />
            </div>

            <dl className="credit-foot">
              <div>
                <dt>{t('accounts.creditAmount')}</dt>
                <dd>
                  {formatAmount(credit.creditAmount, i18n.language, account.currency)} {account.currency}
                </dd>
              </div>
              <div>
                <dt>{t('finance.nextInstallment')}</dt>
                <dd>
                  {formatAmount(credit.installmentAmount, i18n.language, account.currency)} {account.currency}
                </dd>
              </div>
              <div>
                <dt>{t('finance.date')}</dt>
                <dd className="num">{credit.nextPaymentDate}</dd>
              </div>
              <div>
                <dt>{t('accounts.installments')}</dt>
                <dd className="num">
                  {credit.installmentsPaid} / {credit.totalInstallments}
                </dd>
              </div>
            </dl>
          </div>
        ) : (
          <div className="empty-state">
            <span className="empty-state-icon">
              <FinanceIcon />
            </span>
            <p>{t('accounts.noCredit')}</p>
          </div>
        )}
      </section>

      {/* This account's own statement -------------------------------------- */}
      <section className="card">
        <div className="card-header">
          <h2 className="finance-card-title">{t('accounts.transactions')}</h2>
        </div>

        {transactions.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon">
              <FinanceIcon />
            </span>
            <p>{t('accounts.noTransactions')}</p>
          </div>
        ) : (
          <ul className="transaction-list">
            {transactions.map((transaction) => (
              <li key={transaction.id}>
                <div className="transaction-main">
                  <span className="transaction-description">{transaction.description}</span>
                  <span className="badge">
                    {t(`overview.categories.${transaction.category.toLowerCase()}`)}
                  </span>
                </div>
                <div className="transaction-meta">
                  <span className="num transaction-date">{transaction.bookedAt}</span>
                  <span
                    className={`num transaction-amount${
                      transaction.direction === 'OUT' ? ' is-negative' : ''
                    }`}
                  >
                    {transaction.direction === 'OUT' ? '−' : '+'}
                    {formatAmount(transaction.amount, i18n.language, account.currency)} {account.currency}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
