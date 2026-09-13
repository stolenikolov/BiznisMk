import { useTranslation } from 'react-i18next';
import type { CashFlowPoint } from '../lib/overviewPlaceholderData.ts';

const VIEW_W = 640;
const VIEW_H = 220;
const PAD_X = 8;
const PAD_TOP = 12;
const PAD_BOTTOM = 26;

/**
 * Hand-drawn SVG rather than a charting library: the whole chart is four
 * paths, and keeping it in-house means it inherits the theme tokens directly
 * and adds no dependency.
 */
export function CashFlowChart({ points }: { points: CashFlowPoint[] }) {
  const { t } = useTranslation();

  const max = Math.max(...points.map((p) => Math.max(p.income, p.expense)));
  const stepX = (VIEW_W - PAD_X * 2) / Math.max(points.length - 1, 1);
  const plotH = VIEW_H - PAD_TOP - PAD_BOTTOM;

  const x = (index: number) => PAD_X + index * stepX;
  const y = (value: number) => PAD_TOP + plotH - (value / max) * plotH;

  const line = (key: 'income' | 'expense') =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(' ');

  const incomeArea = `${line('income')} L ${x(points.length - 1).toFixed(1)} ${(PAD_TOP + plotH).toFixed(1)} L ${x(0).toFixed(1)} ${(PAD_TOP + plotH).toFixed(1)} Z`;

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label={t('overview.cashFlow')}>
        <path d={incomeArea} className="chart-area" />
        <path d={line('income')} className="chart-line chart-line--income" />
        <path d={line('expense')} className="chart-line chart-line--expense" />
      </svg>
      <div className="chart-axis">
        {points.map((point) => (
          <span key={point.month} className="num">
            {t(`months.${point.month}`)}
          </span>
        ))}
      </div>
    </div>
  );
}
