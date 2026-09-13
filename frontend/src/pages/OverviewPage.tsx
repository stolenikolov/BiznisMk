import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.ts';
import { formatAmount, useBankAccounts } from '../lib/useBankAccounts.ts';
import { CashFlowChart } from '../components/CashFlowChart.tsx';
import {
  PLACEHOLDER_BALANCE_DELTA,
  PLACEHOLDER_CASH_FLOW,
  PLACEHOLDER_CATEGORIES,
  PLACEHOLDER_MINI_STATS,
  PLACEHOLDER_TRANSACTIONS,
} from '../lib/overviewPlaceholderData.ts';

const RANGES = ['1y', '6m', '1m'] as const;

function greetingKey(hour = new Date().getHours()): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

function Delta({ percent }: { percent: number }) {
  const positive = percent >= 0;
  return (
    <span className={`delta${positive ? '' : ' is-negative'}`}>
      {positive ? '▲' : '▼'} {Math.abs(percent).toFixed(1)}%
    </span>
  );
}

export function OverviewPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { totals, accounts, isLoading } = useBankAccounts();
  const [range, setRange] = useState<(typeof RANGES)[number]>('1y');

  const [headline] = totals;

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
          <select className="range-select" defaultValue="month" aria-label={t('overview.range')}>
            <option value="month">{t('overview.thisMonth')}</option>
            <option value="quarter">{t('overview.thisQuarter')}</option>
            <option value="year">{t('overview.thisYear')}</option>
          </select>
          <button type="button" className="btn-ghost">
            {t('overview.exportReport')}
          </button>
        </div>
      </header>

      <div className="overview-row overview-row--balance">
        <section className="card balance-panel">
          <span className="label-caps">{t('dashboard.totalBalance')}</span>
          <div className="balance-panel-figure">
            <span className="balance-hero-figure">
              {isLoading
                ? '—'
                : headline
                  ? `${formatAmount(headline.total, i18n.language)} ${headline.currency}`
                  : '0,00 MKD'}
            </span>
            <Delta percent={PLACEHOLDER_BALANCE_DELTA} />
          </div>
          <p className="overview-subtext">
            {t('overview.acrossAccounts', { count: accounts.length })}
          </p>

          <div className="mini-stats">
            {PLACEHOLDER_MINI_STATS.map((stat) => (
              <div key={stat.key} className="mini-stat">
                <span className="label-caps">{t(`overview.stats.${stat.key}`)}</span>
                <span className="mini-stat-figure">{formatAmount(stat.amount, i18n.language)}</span>
                <Delta percent={stat.key === 'expenses' ? -stat.deltaPercent : stat.deltaPercent} />
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h2>{t('overview.spendingByCategory')}</h2>
          </div>
          <ul className="category-list">
            {PLACEHOLDER_CATEGORIES.map((category, index) => (
              <li key={category.key}>
                <div className="category-row">
                  <span>{t(`overview.categories.${category.key}`)}</span>
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
          <CashFlowChart points={PLACEHOLDER_CASH_FLOW} />
        </section>

        <section className="card">
          <div className="card-header">
            <h2>{t('overview.recentTransactions')}</h2>
            <Link to="/finance/transactions" className="link-arrow">
              {t('overview.seeAll')}
            </Link>
          </div>
          <ul className="transaction-list">
            {PLACEHOLDER_TRANSACTIONS.map((transaction) => (
              <li key={transaction.id}>
                <div className="transaction-main">
                  <span className="transaction-description">{transaction.description}</span>
                  <span className="badge">{t(`overview.categories.${transaction.categoryKey}`)}</span>
                </div>
                <div className="transaction-meta">
                  <span className="num transaction-date">{transaction.date}</span>
                  <span className={`num transaction-amount${transaction.direction === 'out' ? ' is-negative' : ''}`}>
                    {transaction.direction === 'out' ? '−' : '+'}
                    {formatAmount(transaction.amount, i18n.language)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
