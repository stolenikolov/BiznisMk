import { useTranslation } from 'react-i18next';
import { formatAmount } from '../../lib/money.ts';
import { formatWeekRange } from '../../lib/schedule.ts';
import {
  BellIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LockIcon,
  MoonIcon,
  PersonIcon,
  TrendArrowIcon,
} from '../icons.tsx';

/**
 * The landing page's product pictures: the real screens, drawn from sample
 * data with the app's own tokens, so they follow the theme and the language
 * the visitor picked and never go stale the way a screenshot file does.
 *
 * The figures are one invented bakery's month and hang together — the
 * overview's income is the finance page's income, and the category shares
 * add up to 100.
 */

/** The names and sentences that change with the language; the figures do not. */
interface Sample {
  company: string;
  owner: string;
  transactions: string[];
  employees: string[];
  shifts: { morning: string; afternoon: string };
  clients: string[];
}

function useSample() {
  const { t, i18n } = useTranslation();
  const sample = t('landing.sample', { returnObjects: true }) as Sample;
  const money = (amount: number) => formatAmount(amount.toFixed(2), i18n.language);
  // One decimal, with the reader's decimal mark.
  const percent = (value: number) => {
    const fixed = Math.abs(value).toFixed(1);
    return i18n.language.startsWith('mk') ? fixed.replace('.', ',') : fixed;
  };
  return { t, sample, money, percent };
}

const MONTH_KEYS = ['oct', 'nov', 'dec', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep'];
/** October 2025 to September 2026, in thousands of denars. */
const INCOME = [980, 1040, 1210, 870, 910, 1020, 1080, 1150, 1190, 1230, 1170, 1284.5];
const EXPENSE = [760, 790, 880, 720, 740, 800, 830, 860, 890, 920, 905, 912.34];

const MONTH = { income: 1_284_500, expenses: 912_340, profit: 372_160 };

/** Share of September's spending, highest first — the same order both screens rank by. */
const CATEGORIES = [
  { key: 'salaries', percent: 46, color: 'var(--pv-cat-1)' },
  { key: 'rent', percent: 18, color: 'var(--pv-cat-2)' },
  { key: 'logistics', percent: 14, color: 'var(--pv-cat-3)' },
  { key: 'other', percent: 13, color: 'var(--pv-cat-4)' },
  { key: 'software', percent: 9, color: 'var(--pv-cat-5)' },
] as const;

function monthLabel(t: (key: string) => string, index: number) {
  return t(`months.${MONTH_KEYS[index]}`);
}

// Overview ---------------------------------------------------------------------------

const TRANSACTIONS = [
  { category: 'invoice', amount: 186_400, direction: 'IN', date: '2026-09-18' },
  { category: 'salaries', amount: 412_000, direction: 'OUT', date: '2026-09-15' },
  { category: 'rent', amount: 96_000, direction: 'OUT', date: '2026-09-10' },
  { category: 'logistics', amount: 58_750, direction: 'OUT', date: '2026-09-08' },
] as const;

/** The dashboard as a signed-in owner sees it first: the app bar, the month, the trend. */
export function OverviewPreview() {
  const { t, sample, money, percent } = useSample();

  const stats = [
    { key: 'income', amount: MONTH.income, delta: 8.2, good: true },
    { key: 'expenses', amount: MONTH.expenses, delta: -3.1, good: true },
    { key: 'profit', amount: MONTH.profit, delta: 14.6, good: true },
  ];

  return (
    <div className="pv-app">
      <div className="pv-topnav">
        <div className="pv-topnav-left">
          <span className="pv-brand">{t('app.name')}</span>
          {(['dashboard', 'finance', 'employees', 'invoices', 'schedule', 'settings'] as const).map((key) => (
            <span key={key} className={`pv-tab${key === 'dashboard' ? ' is-active' : ''}`}>
              {t(`nav.${key}`)}
            </span>
          ))}
        </div>
        <div className="pv-topnav-right">
          <span className="pv-icon has-dot">
            <BellIcon />
          </span>
          <span className="pv-icon">
            <MoonIcon />
          </span>
          <span className="pv-divider" />
          <span className="pv-avatar">
            <PersonIcon />
          </span>
        </div>
      </div>

      <div className="pv-page">
        <div className="pv-head">
          <div>
            <div className="pv-h1">{t('overview.greeting.morning', { name: sample.owner })}</div>
            <div className="pv-sub">{t('overview.subtext', { company: sample.company })}</div>
          </div>
          <span className="pv-select">
            {t('overview.thisMonth')}
            <ChevronDownIcon />
          </span>
        </div>

        <div className="pv-row pv-row--balance">
          <div className="pv-card">
            <span className="pv-caps">{t('dashboard.totalBalance')}</span>
            <div className="pv-hero-figure">{money(2_847_320)} MKD</div>
            <div className="pv-sub">{t('overview.acrossAccounts', { count: 3 })}</div>
            <div className="pv-mini-stats">
              {stats.map((stat) => (
                <div key={stat.key} className="pv-mini-stat">
                  <span className="pv-caps">{t(`overview.stats.${stat.key}`)}</span>
                  <span className="pv-mini-figure">{money(stat.amount)} MKD</span>
                  <span className={`pv-delta${stat.good ? '' : ' is-negative'}`}>
                    {stat.delta >= 0 ? '▲' : '▼'} {percent(stat.delta)}%{' '}
                    <span className="pv-delta-context">{t('overview.vsPrevious.month')}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="pv-card">
            <div className="pv-card-title">{t('overview.spendingByCategory')}</div>
            <ul className="pv-cats">
              {CATEGORIES.map((category, index) => (
                <li key={category.key}>
                  <div className="pv-cat-row">
                    <span>{t(`overview.categories.${category.key}`)}</span>
                    <span className="pv-num">{category.percent}%</span>
                  </div>
                  <span className="pv-bar">
                    <span style={{ width: `${category.percent}%`, opacity: 1 - index * 0.16 }} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="pv-row pv-row--flow">
          <div className="pv-card">
            <div className="pv-card-head">
              <div>
                <div className="pv-card-title">{t('overview.cashFlow')}</div>
                <div className="pv-legend">
                  <span className="pv-legend-item pv-legend-item--accent">{t('overview.income')}</span>
                  <span className="pv-legend-item pv-legend-item--muted">{t('overview.expense')}</span>
                </div>
              </div>
              <span className="pv-pills">
                {(['1y', '6m', '1m'] as const).map((range) => (
                  <span key={range} className={range === '1y' ? 'is-active' : ''}>
                    {t(`overview.ranges.${range}`)}
                  </span>
                ))}
              </span>
            </div>
            <FlowChart labels={INCOME.map((_, index) => monthLabel(t, index))} />
          </div>

          <div className="pv-card">
            <div className="pv-card-head">
              <div className="pv-card-title">{t('overview.recentTransactions')}</div>
              <span className="pv-link">{t('overview.seeAll')}</span>
            </div>
            <ul className="pv-transactions">
              {TRANSACTIONS.map((transaction, index) => (
                <li key={transaction.date}>
                  <div className="pv-transaction-main">
                    <span className="pv-transaction-name">{sample.transactions[index]}</span>
                    <span className="pv-badge">{t(`overview.categories.${transaction.category}`)}</span>
                  </div>
                  <div className="pv-transaction-meta">
                    <span className="pv-num pv-faint">{transaction.date}</span>
                    <span className={`pv-num${transaction.direction === 'OUT' ? ' pv-negative' : ''}`}>
                      {transaction.direction === 'OUT' ? '−' : '+'}
                      {money(transaction.amount)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A Catmull-Rom-derived Bezier path through the points, echoing the dashboard's `smooth: 0.3` line. */
function smoothPath(points: [number, number][]) {
  const smoothing = 0.2;
  const controlPoint = (
    current: [number, number],
    previous: [number, number] | undefined,
    next: [number, number] | undefined,
    reverse?: boolean,
  ) => {
    const p = previous ?? current;
    const n = next ?? current;
    const angle = Math.atan2(n[1] - p[1], n[0] - p[0]) + (reverse ? Math.PI : 0);
    const length = Math.hypot(n[0] - p[0], n[1] - p[1]) * smoothing;
    return [current[0] + Math.cos(angle) * length, current[1] + Math.sin(angle) * length];
  };

  return points.reduce((path, point, index, all) => {
    if (index === 0) return `M ${point[0]},${point[1]}`;
    const [csx, csy] = controlPoint(all[index - 1]!, all[index - 2], point);
    const [cex, cey] = controlPoint(point, all[index - 1], all[index + 1], true);
    return `${path} C ${csx},${csy} ${cex},${cey} ${point[0]},${point[1]}`;
  }, '');
}

/** Income and expense as smooth curves, matching the real dashboard's chart. */
function FlowChart({ labels }: { labels: string[] }) {
  const width = 620;
  const height = 210;
  const top = 10;
  const bottom = 26;
  const max = 1400;
  const plot = height - top - bottom;
  const step = width / (INCOME.length - 1);
  const point = (value: number, index: number): [number, number] => [index * step, top + plot - (value / max) * plot];

  const incomeLine = smoothPath(INCOME.map(point));
  const expenseLine = smoothPath(EXPENSE.map(point));
  const incomeArea = `${incomeLine} L ${width},${top + plot} L 0,${top + plot} Z`;

  return (
    <svg className="pv-chart" viewBox={`0 -2 ${width} ${height + 2}`} preserveAspectRatio="none">
      {[0, 350, 700, 1050, 1400].map((tick) => {
        const y = top + plot - (tick / max) * plot;
        return <line key={tick} x1="0" x2={width} y1={y} y2={y} className="pv-gridline" />;
      })}
      <path d={incomeArea} className="pv-area-flow" />
      <path d={incomeLine} className="pv-line-flow-income" />
      <path d={expenseLine} className="pv-line-flow-expense" />
      {labels.map((label, index) =>
        index % 2 === 1 ? null : (
          <text key={label} x={Math.min(Math.max(index * step, 12), width - 12)} y={height - 6} textAnchor="middle" className="pv-axis">
            {label}
          </text>
        ),
      )}
    </svg>
  );
}

// Finance ----------------------------------------------------------------------------

/** The finance page: the month's figures against last month, the trend and where money went. */
export function FinancePreview() {
  const { t, money, percent } = useSample();
  const currency = t('finance.currency');

  const stats = [
    { key: 'income', value: `${money(MONTH.income)} ${currency}`, delta: 8.2, good: true },
    { key: 'expenses', value: `${money(MONTH.expenses)} ${currency}`, delta: -3.1, good: true },
    { key: 'profit', value: `${money(MONTH.profit)} ${currency}`, delta: 14.6, good: true },
    { key: 'savingsRate', value: '29%', delta: 2.1, good: true },
  ];

  return (
    <div className="pv-page">
      <div className="pv-head">
        <div className="pv-h2">{t('nav.finance')}</div>
        <span className="pv-select">
          {t('overview.thisMonth')}
          <ChevronDownIcon />
        </span>
      </div>

      <div className="pv-row pv-row--four">
        {stats.map((stat) => (
          <div key={stat.key} className="pv-card pv-stat">
            <span className="pv-caps">{t(`finance.stats.${stat.key}`)}</span>
            <span className="pv-stat-value">{stat.value}</span>
            <span className={`pv-stat-delta ${stat.good ? 'is-good' : 'is-bad'}`}>
              <TrendArrowIcon direction={stat.delta >= 0 ? 'up' : 'down'} />
              {t('finance.deltaPercent', { value: `${stat.delta >= 0 ? '+' : '−'}${percent(stat.delta)}` })}
            </span>
          </div>
        ))}
      </div>

      <div className="pv-row pv-row--trend">
        <div className="pv-card">
          <div className="pv-card-head">
            <div className="pv-card-title">{t('finance.trendTitle')}</div>
            <span className="pv-pills">
              {(['7d', '30d', '3m', '1y'] as const).map((option) => (
                <span key={option} className={option === '1y' ? 'is-active' : ''}>
                  {t(`finance.granularities.${option}`)}
                </span>
              ))}
            </span>
          </div>
          <LineChart labels={INCOME.map((_, index) => monthLabel(t, index))} />
          <div className="pv-legend">
            <span className="pv-legend-item pv-legend-item--income">{t('finance.income')}</span>
            <span className="pv-legend-item pv-legend-item--expense">{t('finance.expense')}</span>
          </div>
        </div>

        <div className="pv-card">
          <div className="pv-card-title">{t('finance.categoryTitle')}</div>
          <Donut label={t('finance.total')} total={money(MONTH.expenses)} />
          <ul className="pv-rank">
            {CATEGORIES.map((category) => (
              <li key={category.key}>
                <span className="pv-dot" style={{ background: category.color }} />
                <span className="pv-rank-name">{t(`overview.categories.${category.key}`)}</span>
                <span className="pv-num pv-muted">{money((MONTH.expenses * category.percent) / 100)}</span>
                <span className="pv-num pv-rank-pct">{category.percent}%</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function LineChart({ labels }: { labels: string[] }) {
  const width = 560;
  const height = 200;
  const top = 10;
  const bottom = 26;
  const max = 1400;
  const plot = height - top - bottom;
  const step = width / (INCOME.length - 1);
  const point = (value: number, index: number) => `${(index * step).toFixed(1)},${(top + plot - (value / max) * plot).toFixed(1)}`;
  const line = (series: number[]) => series.map(point).join(' ');

  return (
    <svg className="pv-chart" viewBox={`0 -2 ${width} ${height + 2}`} preserveAspectRatio="none">
      {[0, 350, 700, 1050, 1400].map((tick) => {
        const y = top + plot - (tick / max) * plot;
        return <line key={tick} x1="0" x2={width} y1={y} y2={y} className="pv-gridline" />;
      })}
      <polygon points={`0,${top + plot} ${line(INCOME)} ${width},${top + plot}`} className="pv-area-income" />
      <polyline points={line(INCOME)} className="pv-line-income" />
      <polyline points={line(EXPENSE)} className="pv-line-expense" />
      {labels.map((label, index) =>
        index % 2 === 1 ? null : (
          <text key={label} x={Math.min(Math.max(index * step, 12), width - 12)} y={height - 4} textAnchor="middle" className="pv-axis">
            {label}
          </text>
        ),
      )}
    </svg>
  );
}

function Donut({ label, total }: { label: string; total: string }) {
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  // Each arc starts where the ones before it end.
  const arcs = CATEGORIES.map((category, index) => ({
    ...category,
    start: CATEGORIES.slice(0, index).reduce((sum, previous) => sum + (previous.percent / 100) * circumference, 0),
    length: (category.percent / 100) * circumference,
  }));

  return (
    <div className="pv-donut">
      <svg width="150" height="150" viewBox="0 0 160 160">
        <g transform="rotate(-90 80 80)">
          {arcs.map((arc) => (
            <circle
              key={arc.key}
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke={arc.color}
              strokeWidth="24"
              strokeDasharray={`${Math.max(arc.length - 3, 0)} ${circumference}`}
              strokeDashoffset={-arc.start}
            />
          ))}
        </g>
      </svg>
      <div className="pv-donut-centre">
        <span className="pv-faint">{label}</span>
        <span className="pv-donut-value">{total}</span>
      </div>
    </div>
  );
}

// Schedule ---------------------------------------------------------------------------

type Day = 'M' | 'A' | 'off' | 'leave';

/** A week at the bakery: two shifts, a day or two off each, and one person on holiday. */
const ROTA: { role: 'MANAGER' | 'EMPLOYEE'; days: Day[] }[] = [
  { role: 'MANAGER', days: ['M', 'M', 'M', 'M', 'M', 'off', 'off'] },
  { role: 'EMPLOYEE', days: ['A', 'A', 'off', 'A', 'A', 'A', 'off'] },
  { role: 'EMPLOYEE', days: ['off', 'M', 'M', 'M', 'M', 'M', 'off'] },
  { role: 'EMPLOYEE', days: ['leave', 'leave', 'leave', 'leave', 'leave', 'off', 'off'] },
  { role: 'EMPLOYEE', days: ['A', 'A', 'A', 'off', 'A', 'M', 'off'] },
];

const WEEK = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'];
const TODAY_INDEX = 2;

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2);
}

/** The week's rota, as the owner fills it in and publishes it. */
export function SchedulePreview() {
  const { t, sample } = useSample();
  const shift = {
    M: { label: sample.shifts.morning, time: '07:00–15:00' },
    A: { label: sample.shifts.afternoon, time: '15:00–23:00' },
  };

  return (
    <div className="pv-page">
      <div className="pv-head">
        <div>
          <div className="pv-h2">{t('nav.schedule')}</div>
          <div className="pv-sub">{t('schedule.subtitle')}</div>
        </div>
        <div className="pv-head-actions">
          <span className="pv-week">
            <ChevronLeftIcon />
            {formatWeekRange(t, WEEK[0]!, WEEK[6]!)}
            <ChevronRightIcon />
          </span>
          <span className="pv-btn-primary">{t('schedule.publish')}</span>
        </div>
      </div>

      <div className="pv-card pv-card--flush">
        <div className="pv-rota">
          <div className="pv-rota-row pv-rota-row--head">
            <span className="pv-caps">{t('schedule.columns.employee')}</span>
            {WEEK.map((date, index) => (
              <span key={date} className={`pv-rota-day${index === TODAY_INDEX ? ' is-today' : ''}`}>
                <span className="pv-caps">{t(`schedule.weekdays.${index + 1}`)}</span>
                <span className="pv-num">{date.slice(8)}.{date.slice(5, 7)}</span>
              </span>
            ))}
            <span className="pv-caps pv-rota-total">{t('schedule.columns.total')}</span>
          </div>

          {ROTA.map((person, row) => {
            const name = sample.employees[row] ?? '';
            const hours = person.days.filter((day) => day === 'M' || day === 'A').length * 8;
            return (
              <div key={name} className="pv-rota-row">
                <span className="pv-person">
                  <span className="pv-initials">{initials(name)}</span>
                  <span className="pv-person-text">
                    <span className="pv-person-name">{name}</span>
                    <span className="pv-faint">{t(`employees.roles.${person.role}`)}</span>
                  </span>
                </span>
                {person.days.map((day, index) => (
                  <span key={WEEK[index]} className={`pv-rota-slot${index === TODAY_INDEX ? ' is-today' : ''}`}>
                    {day === 'M' || day === 'A' ? (
                      <span className="pv-shift">
                        <span className="pv-shift-label">{shift[day].label}</span>
                        <span className="pv-num">{shift[day].time}</span>
                      </span>
                    ) : day === 'leave' ? (
                      <span className="pv-leave">
                        <LockIcon />
                        {t('schedule.leave.ON_LEAVE')}
                      </span>
                    ) : (
                      <span className="pv-day-off">{t('schedule.dayOff')}</span>
                    )}
                  </span>
                ))}
                <span className="pv-num pv-rota-total">{t('schedule.hours', { value: hours })}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Invoices ---------------------------------------------------------------------------

const INVOICES = [
  { number: '0041/2026', direction: 'OUTGOING', due: '2026-09-30', status: 'SENT', total: 186_400 },
  { number: '0040/2026', direction: 'OUTGOING', due: '2026-09-12', status: 'OVERDUE', total: 94_800 },
  { number: '0039/2026', direction: 'INCOMING', due: '2026-09-25', status: 'SENT', total: 138_900 },
  { number: '0038/2026', direction: 'OUTGOING', due: '2026-09-05', status: 'PAID', total: 52_300 },
  { number: '0037/2026', direction: 'OUTGOING', due: '2026-08-29', status: 'PAID', total: 205_000 },
] as const;

const STATUS_TONE = { SENT: 'violet', OVERDUE: 'red', PAID: 'green' } as const;

/** The invoice list: what is owed to the company, what it owes, and where each invoice stands. */
export function InvoicesPreview() {
  const { t, sample, money } = useSample();

  const kpis = [
    { key: 'outstanding', value: money(486_200) },
    { key: 'payable', value: money(138_900) },
    { key: 'issuedCount', value: '24' },
  ];

  return (
    <div className="pv-page">
      <div className="pv-head">
        <div className="pv-h2">{t('nav.invoices')}</div>
        <span className="pv-btn-primary">{t('invoices.createCta')}</span>
      </div>

      <div className="pv-card pv-kpis">
        {kpis.map((kpi) => (
          <div key={kpi.key} className="pv-kpi">
            <span className="pv-caps">{t(`invoices.${kpi.key}`)}</span>
            <span className="pv-kpi-value pv-num">{kpi.value}</span>
          </div>
        ))}
      </div>

      <div className="pv-card pv-card--flush">
        <div className="pv-table">
          <div className="pv-table-row pv-table-row--head">
            <span>{t('invoices.number')}</span>
            <span>{t('invoices.direction')}</span>
            <span>{t('invoices.client')}</span>
            <span>{t('invoices.dueDate')}</span>
            <span>{t('invoices.status')}</span>
            <span className="pv-align-end">{t('invoices.total')}</span>
          </div>
          {INVOICES.map((invoice, index) => (
            <div key={invoice.number} className="pv-table-row">
              <span className="pv-num pv-invoice-number">{invoice.number}</span>
              <span>
                <span className="pv-badge">{t(`invoices.directions.${invoice.direction}`)}</span>
              </span>
              <span>{sample.clients[index]}</span>
              <span className="pv-num pv-muted">{invoice.due}</span>
              <span>
                <span className={`pv-badge pv-badge--${STATUS_TONE[invoice.status]}`}>
                  {t(`invoices.statuses.${invoice.status}`)}
                </span>
              </span>
              <span className="pv-num pv-align-end">{money(invoice.total)} MKD</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
