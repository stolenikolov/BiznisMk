import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PeriodMenu } from '../components/PeriodMenu.tsx';
import { CategoryDonut } from '../components/CategoryDonut.tsx';
import { DownloadIcon, FinanceIcon, TrendArrowIcon } from '../components/icons.tsx';
import { formatAmount, maskAccount, useBankAccounts } from '../lib/useBankAccounts.ts';
import { GRANULARITIES, useFinance, type Granularity } from '../lib/useFinance.ts';
import type { BankAccount } from '../lib/useBankAccounts.ts';

// ECharts is large and only this card needs it.
const FinanceTrendChart = lazy(() =>
  import('../components/FinanceTrendChart.tsx').then((module) => ({
    default: module.FinanceTrendChart,
  })),
);

/** Six fixed slots, assigned by rank so a category keeps its colour. */
const CATEGORY_SLOTS = ['--cat-1', '--cat-2', '--cat-3', '--cat-4', '--cat-5', '--cat-6'];

function EmptyState({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">
        <FinanceIcon />
      </span>
      <p>{message}</p>
      {action}
    </div>
  );
}

/**
 * Whether a movement is good news depends on the metric, not on the sign:
 * spending 4% more is not an improvement even though the number went up.
 */
function StatDelta({ value, goodWhenUp }: { value: number | null; goodWhenUp: boolean }) {
  const { t } = useTranslation();

  if (value === null) {
    return <span className="stat-delta">{t('finance.noComparison')}</span>;
  }

  const isUp = value >= 0;
  const isGood = goodWhenUp ? isUp : !isUp;
  const formatted = `${isUp ? '+' : '−'}${Math.abs(value).toLocaleString(undefined, {
    maximumFractionDigits: 1,
  })}`;

  return (
    <span className={`stat-delta ${isGood ? 'is-good' : 'is-bad'}`}>
      <TrendArrowIcon direction={isUp ? 'up' : 'down'} />
      {t('finance.deltaPercent', { value: formatted })}
    </span>
  );
}

function StatSkeleton() {
  return (
    <article className="card stat-tile" aria-hidden="true">
      <span className="skeleton skeleton-line skeleton-line--label" />
      <span className="skeleton skeleton-line skeleton-line--value" />
      <span className="skeleton skeleton-line skeleton-line--delta" />
    </article>
  );
}

export function FinancePage() {
  const { t, i18n } = useTranslation();
  const {
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
    reload,
  } = useFinance();
  const { accounts, isLoading: accountsLoading } = useBankAccounts();

  const money = (amount: string) => `${formatAmount(amount, i18n.language)} ${t('finance.currency')}`;
  const creditAccounts = accounts.filter((account) => account.creditLine !== null);

  const stats = finance && [
    {
      key: 'income',
      value: money(finance.summary.income),
      delta: finance.summary.deltas.income,
      goodWhenUp: true,
    },
    {
      key: 'expenses',
      value: money(finance.summary.expenses),
      delta: finance.summary.deltas.expenses,
      // More spending is bad news even though the figure rose.
      goodWhenUp: false,
    },
    {
      key: 'profit',
      value: money(finance.summary.profit),
      delta: finance.summary.deltas.profit,
      goodWhenUp: true,
    },
    {
      key: 'savingsRate',
      value:
        finance.summary.savingsRate === null
          ? '—'
          : `${Math.round(finance.summary.savingsRate)}%`,
      // Every tile reads its change in %. For the savings rate that figure is
      // the difference between the two rates (20% → 22% shows +2%), not a
      // relative change.
      delta: finance.summary.deltas.savingsRatePoints,
      goodWhenUp: true,
    },
  ];

  const categoryTotal = finance?.categories.reduce(
    (sum, category) => sum + Number(category.amount),
    0,
  );

  const exportReport = () => {
    if (!finance) return;

    const rows = [
      [t('finance.stats.income'), finance.summary.income],
      [t('finance.stats.expenses'), finance.summary.expenses],
      [t('finance.stats.profit'), finance.summary.profit],
      [
        t('finance.stats.savingsRate'),
        finance.summary.savingsRate === null ? '' : String(finance.summary.savingsRate),
      ],
      [],
      [t('finance.categoryTitle'), t('finance.amount'), '%'],
      ...finance.categories.map((category) => [
        t(`overview.categories.${category.category.toLowerCase()}`),
        category.amount,
        String(category.percent),
      ]),
      [],
      [t('finance.date'), t('finance.income'), t('finance.expense')],
      ...finance.trend.points.map((point) => [point.date, point.income, point.expense]),
    ];

    const csv = rows.map((row) => row.join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `biznismk-${finance.period.from}-${finance.period.to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="finance">
      <header className="finance-head">
        <h1 className="page-title">{t('nav.finance')}</h1>
        <div className="finance-head-actions">
          <PeriodMenu
            period={period}
            customRange={customRange}
            onSelect={setPeriod}
            onSelectCustom={setCustomRange}
          />
          <button type="button" className="btn-ghost" onClick={exportReport} disabled={!finance}>
            <DownloadIcon />
            {t('finance.exportReport')}
          </button>
        </div>
      </header>

      {hasFailed && (
        <section className="card">
          <EmptyState
            message={t('finance.loadFailed')}
            action={
              <button type="button" className="btn-ghost" onClick={() => void reload()}>
                {t('finance.retry')}
              </button>
            }
          />
        </section>
      )}

      {/* Stat row ---------------------------------------------------------- */}
      {isLoading ? (
        <div className="finance-stats">
          {[0, 1, 2, 3].map((index) => (
            <StatSkeleton key={index} />
          ))}
        </div>
      ) : finance && finance.hasData && stats ? (
        <div className="finance-stats">
          {stats.map((stat) => (
            <article key={stat.key} className="card stat-tile">
              <span className="label-caps">{t(`finance.stats.${stat.key}`)}</span>
              <span className="stat-value">{stat.value}</span>
              <StatDelta value={stat.delta} goodWhenUp={stat.goodWhenUp} />
            </article>
          ))}
        </div>
      ) : (
        !hasFailed && (
          <section className="card">
            <EmptyState message={t('finance.empty.period')} />
          </section>
        )
      )}

      {/* Trend + categories ------------------------------------------------ */}
      <div className="finance-row">
        <section className="card">
          <div className="card-header">
            <h2 className="finance-card-title">{t('finance.trendTitle')}</h2>
            <div className="range-pills" role="group" aria-label={t('finance.granularity')}>
              {GRANULARITIES.map((option: Granularity) => (
                <button
                  key={option}
                  type="button"
                  className={option === granularity ? 'is-active' : ''}
                  aria-pressed={option === granularity}
                  onClick={() => setGranularity(option)}
                >
                  {t(`finance.granularities.${option}`)}
                </button>
              ))}
            </div>
          </div>

          {isLoading || isTrendLoading ? (
            <div className="skeleton skeleton-block" aria-hidden="true" />
          ) : finance && finance.trendHasData ? (
            <>
              <Suspense fallback={<div className="skeleton skeleton-block" aria-hidden="true" />}>
                <FinanceTrendChart points={finance.trend.points} bucket={finance.trend.bucket} />
              </Suspense>
              <div className="trend-legend">
                <span className="legend-income">{t('finance.income')}</span>
                <span className="legend-expense">{t('finance.expense')}</span>
              </div>
            </>
          ) : (
            <EmptyState message={t('finance.empty.trend')} />
          )}
        </section>

        <section className="card">
          <div className="card-header">
            <h2 className="finance-card-title">{t('finance.categoryTitle')}</h2>
          </div>

          {isLoading ? (
            <div className="skeleton skeleton-donut" aria-hidden="true" />
          ) : finance && finance.categories.length > 0 ? (
            <>
              <CategoryDonut
                title={t('finance.categoryTitle')}
                label={t('finance.total')}
                total={formatAmount(String(categoryTotal ?? 0), i18n.language)}
                segments={finance.categories.map((category, index) => ({
                  key: category.category,
                  percent: category.percent,
                  color: `var(${CATEGORY_SLOTS[Math.min(index, CATEGORY_SLOTS.length - 1)]})`,
                }))}
              />
              <ul className="category-rank">
                {finance.categories.map((category, index) => (
                  <li key={category.category}>
                    <span
                      className="category-dot"
                      style={{
                        background: `var(${CATEGORY_SLOTS[Math.min(index, CATEGORY_SLOTS.length - 1)]})`,
                      }}
                      aria-hidden="true"
                    />
                    <span className="category-name">
                      {t(`overview.categories.${category.category.toLowerCase()}`)}
                    </span>
                    <span className="num category-amount">
                      {formatAmount(category.amount, i18n.language)}
                    </span>
                    <span className="num category-pct">{category.percent}%</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <EmptyState message={t('finance.empty.categories')} />
          )}
        </section>
      </div>

      {/* Accounts ---------------------------------------------------------- */}
      <section>
        <div className="finance-section-head">
          <h2 className="finance-section-title">{t('finance.accountsTitle')}</h2>
          <Link to="/finance/accounts" className="link-arrow">
            {t('finance.seeAll')}
          </Link>
        </div>

        {accountsLoading ? (
          <div className="finance-accounts">
            {[0, 1, 2, 3].map((index) => (
              <article key={index} className="card account-chip" aria-hidden="true">
                <span className="skeleton skeleton-line skeleton-line--label" />
                <span className="skeleton skeleton-line skeleton-line--value" />
                <span className="skeleton skeleton-line skeleton-line--delta" />
              </article>
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <div className="card">
            <EmptyState
              message={t('finance.empty.accounts')}
              action={
                <Link to="/finance/accounts" className="btn-ghost">
                  {t('accounts.addCta')}
                </Link>
              }
            />
          </div>
        ) : (
          <div className="finance-accounts">
            {accounts.map((account) => (
              <AccountChip key={account.id} account={account} />
            ))}
          </div>
        )}
      </section>

      {/* Credits ----------------------------------------------------------- */}
      <section>
        <div className="finance-section-head">
          <div>
            <h2 className="finance-section-title">{t('finance.creditsTitle')}</h2>
            {creditAccounts.length > 0 && (
              <p className="finance-section-note">
                {t('finance.totalDebt', { amount: totalDebt(creditAccounts, i18n.language, t) })}
              </p>
            )}
          </div>
        </div>

        {accountsLoading ? (
          <div className="credit-grid">
            {[0, 1].map((index) => (
              <article key={index} className="card credit-card" aria-hidden="true">
                <span className="skeleton skeleton-line skeleton-line--label" />
                <span className="skeleton skeleton-line skeleton-line--value" />
                <span className="skeleton skeleton-line" />
              </article>
            ))}
          </div>
        ) : creditAccounts.length === 0 ? (
          <div className="card">
            <EmptyState message={t('finance.empty.credits')} />
          </div>
        ) : (
          <div className="credit-grid">
            {creditAccounts.map((account) => (
              <CreditCard key={account.id} account={account} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AccountChip({ account }: { account: BankAccount }) {
  const { t, i18n } = useTranslation();
  const isBlocked = account.status !== 'ACTIVE';

  return (
    <Link
      to={`/finance/accounts/${account.id}`}
      className={`card account-chip${isBlocked ? ' is-blocked' : ''}`}
    >
      <span className="account-chip-bank">
        <span
          className={`status-dot ${isBlocked ? 'is-blocked' : 'is-active'}`}
          aria-hidden="true"
        />
        {account.bankName}
        {/* The dot never carries the status on its own. */}
        {isBlocked && <span className="status-word">{t(`finance.status.${account.status}`)}</span>}
      </span>
      <span className="account-chip-balance">
        {formatAmount(account.balance, i18n.language, account.currency)} {account.currency}
      </span>
      <span className="num account-chip-iban">{maskAccount(account.iban)}</span>
      <span className="account-chip-link">{t('finance.details')}</span>
    </Link>
  );
}

function CreditCard({ account }: { account: BankAccount }) {
  const { t, i18n } = useTranslation();
  const credit = account.creditLine!;
  const paidPercent = Math.round((credit.installmentsPaid / credit.totalInstallments) * 100);

  return (
    <article className="card credit-card">
      <div className="credit-card-head">
        <span className="credit-bank">{account.bankName}</span>
        <span className="num credit-account">{maskAccount(account.iban)}</span>
      </div>

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
          <dt>{t('finance.nextInstallment')}</dt>
          <dd>
            {formatAmount(credit.installmentAmount, i18n.language, account.currency)} {account.currency}
          </dd>
        </div>
        <div>
          <dt>{t('finance.date')}</dt>
          <dd className="num">{credit.nextPaymentDate}</dd>
        </div>
      </dl>
    </article>
  );
}

/** Debt is summed per currency — adding denars to euros would be nonsense. */
function totalDebt(
  accounts: BankAccount[],
  locale: string,
  t: (key: string) => string,
): string {
  const totals = new Map<string, number>();

  for (const account of accounts) {
    const current = totals.get(account.currency) ?? 0;
    totals.set(account.currency, current + Number(account.creditLine!.remainingBalance));
  }

  return [...totals.entries()]
    .map(([currency, total]) => {
      const amount = formatAmount(total.toFixed(2), locale, currency);
      return `${amount} ${currency === 'MKD' ? t('finance.currency') : currency}`;
    })
    .join(' · ');
}
