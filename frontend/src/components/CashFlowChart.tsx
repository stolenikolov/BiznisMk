import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { DataZoomComponent, GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { CashFlowPoint } from '../lib/useOverview.ts';

// Registering only what this chart uses keeps ECharts from pulling its whole
// bundle in. Driving ECharts directly rather than through echarts-for-react:
// that wrapper targets v5 and silently renders nothing against v6.
echarts.use([LineChart, TooltipComponent, GridComponent, DataZoomComponent, CanvasRenderer]);

const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** ECharts can't read CSS variables, so the palette is resolved from them. */
function readPalette() {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    accent: token('--accent'),
    muted: token('--chart-2'),
    faint: token('--text-faint'),
    grid: token('--chart-grid'),
    surface: token('--surface-1'),
    hairline: token('--hairline'),
    primaryText: token('--text-primary'),
  };
}

export function CashFlowChart({ points }: { points: CashFlowPoint[] }) {
  const { t, i18n } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const [palette, setPalette] = useState(readPalette);

  // The palette flips with the theme, which lives on a data attribute.
  useEffect(() => {
    const observer = new MutationObserver(() => setPalette(readPalette()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const option = useMemo(() => {
    const labels = points.map((point) => {
      const [year, month] = point.month.split('-');
      return `${t(`months.${MONTH_KEYS[Number(month) - 1] ?? 'jan'}`)} ${year!.slice(2)}`;
    });

    return {
      animation: false,
      grid: { left: 8, right: 14, top: 16, bottom: 40, containLabel: true },
      tooltip: {
        trigger: 'axis',
        backgroundColor: palette.surface,
        borderColor: palette.hairline,
        borderWidth: 1,
        textStyle: { color: palette.primaryText, fontFamily: 'Inter', fontSize: 12 },
        valueFormatter: (value: number) =>
          `${value.toLocaleString(i18n.language === 'mk' ? 'de-DE' : 'en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} MKD`,
      },
      xAxis: {
        type: 'category',
        data: labels,
        boundaryGap: false,
        axisLine: { lineStyle: { color: palette.grid } },
        axisTick: { show: false },
        axisLabel: { color: palette.faint, fontFamily: 'JetBrains Mono', fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: palette.grid, type: 'dashed' } },
        axisLabel: {
          color: palette.faint,
          fontFamily: 'JetBrains Mono',
          fontSize: 10,
          formatter: (value: number) => (value >= 1000 ? `${Math.round(value / 1000)}k` : `${value}`),
        },
      },
      // Wheel zooms the time axis; dragging pans once zoomed in.
      dataZoom: [{ type: 'inside', zoomOnMouseWheel: true, moveOnMouseMove: true, moveOnMouseWheel: false }],
      series: [
        {
          name: t('overview.income'),
          type: 'line',
          smooth: 0.3,
          symbol: 'circle',
          symbolSize: 6,
          showSymbol: false,
          lineStyle: { color: palette.accent, width: 2 },
          itemStyle: { color: palette.accent },
          areaStyle: { color: palette.accent, opacity: 0.12 },
          data: points.map((point) => Number(point.income)),
        },
        {
          name: t('overview.expense'),
          type: 'line',
          smooth: 0.3,
          symbol: 'circle',
          symbolSize: 6,
          showSymbol: false,
          lineStyle: { color: palette.muted, width: 2 },
          itemStyle: { color: palette.muted },
          data: points.map((point) => Number(point.expense)),
        },
      ],
    };
  }, [points, palette, t, i18n.language]);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = echarts.init(containerRef.current);
    chartRef.current = chart;

    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, true);
  }, [option]);

  return (
    <div className="chart">
      <div ref={containerRef} style={{ height: 260, width: '100%' }} role="img" aria-label={t('overview.cashFlow')} />
      <p className="chart-hint">{t('overview.chartHint')}</p>
    </div>
  );
}
