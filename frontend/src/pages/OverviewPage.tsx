import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.ts';
import { formatAmount, useBankAccounts } from '../lib/useBankAccounts.ts';
import { OVERVIEW_PERIODS, useOverview, type OverviewPeriod } from '../lib/useOverview.ts';
import { FinanceIcon, InvoiceIcon } from '../components/icons.tsx';

// ECharts is large and only this card needs it, so it loads on demand rather
// than riding along in the initial bundle.
const CashFlowChart = lazy(() =>
  import('../components/CashFlowChart.tsx').then((module) => ({ default: module.CashFlowChart })),
);

const RANGES = ['1y', '6m', '1m'] as const;
const RANGE_MONTHS: Record<(typeof RANGES)[number], number> = { '1y': 12, '6m': 6, '1m': 1 };

const PERIOD_LABELS: Record<OverviewPeriod, string> = {
  month: 'overview.thisMonth',
  quarter: 'overview.thisQuarter',
  year: 'overview.thisYear',
};

function greetingKey(hour = new Date().getHours()): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

/** Rendered only when there is something to compare against; `context` says against what. */
function Delta({ percent, invert = false, context }: { percent: number | null; invert?: boolean; context: string }) {
  if (percent === null) return null;
  const good = invert ? percent <= 0 : percent >= 0;
  return (
    <span className={`delta${good ? '' : ' is-negative'}`}>
      {percent >= 0 ? '▲' : '▼'} {Math.abs(percent).toFixed(1)}%{' '}
      <span className="delta-context">{context}</span>
    </span>
  );
}

function EmptyState({ icon, message, action }: { icon: React.ReactNode; message: string; action?: React.ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">{icon}</span>
      <p>{message}</p>
      {action}
    </div>
  );
}

export function OverviewPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { totals, accounts } = useBankAccounts();
  const [period, setPeriod] = useState<OverviewPeriod>('month');
  const { overview, isLoading } = useOverview(period);
  const [range, setRange] = useState<(typeof RANGES)[number]>('1y');

  const [headline] = totals;
  const cashFlow = overview.cashFlow.slice(-RANGE_MONTHS[range]);

  const stats = [
    { key: 'income', amount: overview.summary.income, delta: overview.deltas.income, invert: false },
    { key: 'expenses', amount: overview.summary.expenses, delta: overview.deltas.expenses, invert: true },
    { key: 'profit', amount: overview.summary.profit, delta: overview.deltas.profit, invert: false },
  ] as const;

  return (
    <div className="overview">
      <header className="overview-head">
        <div>
          <h1 className="type-heading">
            {t(`overview.greeting.${greetingKey()}`, { name: user?.firstName ?? '' })}
          </h1>
          <p className="overview-subtext">
            {t('overview.subtext', { company: user?.companyName ?? t('overview.yourCompany') })}
          </p>
        </div>
        <div className="overview-head-actions">
          <select
            className="range-select"
            value={period}
            onChange={(event) => setPeriod(event.target.value as OverviewPeriod)}
            aria-label={t('overview.range')}
          >
            {OVERVIEW_PERIODS.map((option) => (
              <option key={option} value={option}>
                {t(PERIOD_LABELS[option])}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="overview-row overview-row--balance">
        <section className="card balance-panel">
          <span className="label-caps">{t('dashboard.totalBalance')}</span>
          <div className="balance-panel-figure">
            <span className="balance-hero-figure">
              {headline
                ? `${formatAmount(headline.total, i18n.language)} ${headline.currency}`
                : '0 MKD'}
            </span>
          </div>
          <p className="overview-subtext">{t('overview.acrossAccounts', { count: accounts.length })}</p>

          <div className="mini-stats">
            {stats.map((stat) => (
              <div key={stat.key} className="mini-stat">
                <span className="label-caps">{t(`overview.stats.${stat.key}`)}</span>
                <span className="mini-stat-figure">
                  {formatAmount(stat.amount, i18n.language)} MKD
                </span>
                <Delta percent={stat.delta} invert={stat.invert} context={t(`overview.vsPrevious.${period}`)} />
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h2>{t('overview.spendingByCategory')}</h2>
          </div>
          {overview.categories.length === 0 ? (
            <EmptyState icon={<FinanceIcon />} message={t('overview.empty.categories')} />
          ) : (
            <ul className="category-list">
              {overview.categories.map((category, index) => (
                <li key={category.category}>
                  <div className="category-row">
                    <span>{t(`overview.categories.${category.category.toLowerCase()}`)}</span>
                    <span className="num">{category.percent}%</span>
                  </div>
                  {/* One accent, fading by rank — not a different hue per row. */}
                  <span className="category-bar">
                    <span
                      style={{ width: `${category.percent}%`, opacity: 1 - index * 0.16 }}
                      aria-hidden="true"
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="overview-row overview-row--flow">
        <section className="card">
          <div className="card-header card-header--chart">
            <div>
              <h2>{t('overview.cashFlow')}</h2>
              <div className="chart-legend">
                <span className="legend-item legend-item--income">{t('overview.income')}</span>
                <span className="legend-item legend-item--expense">{t('overview.expense')}</span>
              </div>
            </div>
            <div className="range-pills" role="group" aria-label={t('overview.range')}>
              {RANGES.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={option === range ? 'is-active' : ''}
                  onClick={() => setRange(option)}
                >
                  {t(`overview.ranges.${option}`)}
                </button>
              ))}
            </div>
          </div>
          {overview.hasData ? (
            <Suspense fallback={<div className="empty-state">{t('common.loading')}</div>}>
              <CashFlowChart points={cashFlow} />
            </Suspense>
          ) : (
            <EmptyState icon={<FinanceIcon />} message={t('overview.empty.cashFlow')} />
          )}
        </section>

        <section className="card">
          <div className="card-header">
            <h2>{t('overview.recentTransactions')}</h2>
            {overview.recentTransactions.length > 0 && (
              <Link to="/finance/transactions" className="link-arrow">
                {t('overview.seeAll')}
              </Link>
            )}
          </div>
          {overview.recentTransactions.length === 0 ? (
            <EmptyState
              icon={<InvoiceIcon />}
              message={isLoading ? t('common.loading') : t('overview.empty.transactions')}
              action={
                !isLoading && (
                  <Link to="/finance/accounts" className="btn-ghost">
                    {t('accounts.addCta')}
                  </Link>
                )
              }
            />
          ) : (
            <ul className="transaction-list">
              {overview.recentTransactions.map((transaction) => (
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
          )}
        </section>
      </div>
    </div>
  );
}
