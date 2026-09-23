import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDownIcon } from './icons.tsx';
import type { CustomRange, PeriodPreset } from '../lib/useFinance.ts';

const PRESETS: Exclude<PeriodPreset, 'custom'>[] = ['week', 'month', 'quarter', 'year'];

/** The period this menu picks drives every figure on the page below it. */
export function PeriodMenu({
  period,
  customRange,
  onSelect,
  onSelectCustom,
}: {
  period: PeriodPreset;
  customRange: CustomRange | null;
  onSelect: (preset: Exclude<PeriodPreset, 'custom'>) => void;
  onSelectCustom: (range: CustomRange) => void;
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<CustomRange>(
    () => customRange ?? { from: '', to: '' },
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  // Close on an outside click or Escape, the way the rest of the app's
  // overlays behave.
  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const label =
    period === 'custom' && customRange
      ? `${customRange.from} → ${customRange.to}`
      : t(`finance.periods.${period}`);

  return (
    <div className="period-menu" ref={containerRef}>
      <button
        type="button"
        className="period-trigger"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? popoverId : undefined}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span>{label}</span>
        <ChevronDownIcon />
      </button>

      {isOpen && (
        <div className="period-popover" id={popoverId} role="menu">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              role="menuitemradio"
              aria-checked={period === preset}
              className={period === preset ? 'is-selected' : ''}
              onClick={() => {
                onSelect(preset);
                setIsOpen(false);
              }}
            >
              <span>{t(`finance.periods.${preset}`)}</span>
              {period === preset && <span aria-hidden="true">✓</span>}
            </button>
          ))}

          <div className="period-custom">
            <label>
              {t('finance.customFrom')}
              <input
                type="date"
                value={draft.from}
                max={draft.to || undefined}
                onChange={(event) => setDraft((range) => ({ ...range, from: event.target.value }))}
              />
            </label>
            <label>
              {t('finance.customTo')}
              <input
                type="date"
                value={draft.to}
                min={draft.from || undefined}
                onChange={(event) => setDraft((range) => ({ ...range, to: event.target.value }))}
              />
            </label>
            <button
              type="button"
              className="btn-ghost"
              disabled={!draft.from || !draft.to}
              onClick={() => {
                onSelectCustom(draft);
                setIsOpen(false);
              }}
            >
              {t('finance.customApply')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
