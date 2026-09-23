import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { TrendPoint } from '../lib/useFinance.ts';

// Same approach as the overview's chart: register only what is used, and drive
// ECharts directly — echarts-for-react targets v5 and renders nothing on v6.
echarts.use([LineChart, TooltipComponent, GridComponent, CanvasRenderer]);

const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * ECharts cannot read CSS variables, so the palette is resolved from the
 * element the chart lives in — the series colours are scoped to `.finance`,
 * not to :root.
 */
function readPalette(element: HTMLElement | null) {
  const style = getComputedStyle(element ?? document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    income: token('--series-income'),
    expense: token('--series-expense'),
    faint: token('--text-faint'),
    grid: token('--chart-grid'),
    surface: token('--surface-1'),
    hairline: token('--hairline'),
    primaryText: token('--text-primary'),
  };
}

export function FinanceTrendChart({
  points,
  bucket,
}: {
  points: TrendPoint[];
  bucket: 'day' | 'week' | 'month';
}) {
  const { t, i18n } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const [palette, setPalette] = useState(() => readPalette(null));

  // Resolve against the real element once it exists, and again when the theme
  // flips — the theme lives on a data attribute on <html>.
  useEffect(() => {
    setPalette(readPalette(containerRef.current));
    const observer = new MutationObserver(() => setPalette(readPalette(containerRef.current)));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const option = useMemo(() => {
    const month = (index: number) => t(`months.${MONTH_KEYS[index] ?? 'jan'}`);
    const labels = points.map((point) => {
      const [year, monthIndex, day] = point.date.split('-').map(Number);
      return bucket === 'month'
        ? `${month(monthIndex! - 1)} ${String(year).slice(2)}`
        : `${day} ${month(monthIndex! - 1)}`;
    });

    const money = (value: number) =>
      `${value.toLocaleString(i18n.language === 'mk' ? 'de-DE' : 'en-US', {
        maximumFractionDigits: 0,
      })} MKD`;

    return {
      animation: false,
      grid: { left: 8, right: 14, top: 16, bottom: 28, containLabel: true },
      tooltip: {
        trigger: 'axis',
        backgroundColor: palette.surface,
        borderColor: palette.hairline,
        borderWidth: 1,
        textStyle: { color: palette.primaryText, fontFamily: 'Inter', fontSize: 12 },
        // The crosshair is what makes a two-series chart readable at a glance.
        axisPointer: { type: 'line', lineStyle: { color: palette.hairline, width: 1 } },
        valueFormatter: (value: number) => money(value),
      },
      xAxis: {
        type: 'category',
        data: labels,
        boundaryGap: false,
        axisLine: { lineStyle: { color: palette.grid } },
        axisTick: { show: false },
        // Dense windows would otherwise print a tick per day.
        axisLabel: {
          color: palette.faint,
          fontFamily: 'Roboto Mono',
          fontSize: 10,
          interval: Math.max(Math.floor(points.length / 6) - 1, 0),
        },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: palette.grid, type: 'dashed' } },
        axisLabel: {
          color: palette.faint,
          fontFamily: 'Roboto Mono',
          fontSize: 10,
          formatter: (value: number) => (value >= 1000 ? `${Math.round(value / 1000)}k` : `${value}`),
        },
      },
      series: [
        {
          name: t('finance.income'),
          type: 'line',
          smooth: 0.3,
          symbol: 'circle',
          symbolSize: 6,
          showSymbol: false,
          lineStyle: { color: palette.income, width: 2 },
          itemStyle: { color: palette.income },
          areaStyle: { color: palette.income, opacity: 0.12 },
          data: points.map((point) => Number(point.income)),
        },
        {
          name: t('finance.expense'),
          type: 'line',
          smooth: 0.3,
          symbol: 'circle',
          symbolSize: 6,
          showSymbol: false,
          lineStyle: { color: palette.expense, width: 2 },
          itemStyle: { color: palette.expense },
          data: points.map((point) => Number(point.expense)),
        },
      ],
    };
  }, [points, bucket, palette, t, i18n.language]);

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
    <div
      ref={containerRef}
      style={{ height: 220, width: '100%' }}
      role="img"
      aria-label={t('finance.trendTitle')}
    />
  );
}
