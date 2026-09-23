import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { CheckIcon } from './icons.tsx';
import { formatHours, LEAVE_KINDS, type DayChoice, type ShiftTemplate } from '../lib/schedule.ts';

const GAP = 6;
const EDGE = 16;

interface Props {
  /** The cell that opened the picker; the popover sits against it. */
  anchor: HTMLElement;
  /** e.g. "Марко Стојановски · Пон 14.09" */
  heading: string;
  templates: readonly ShiftTemplate[];
  /** What the day holds now. */
  current: DayChoice;
  onPick: (choice: DayChoice) => Promise<void>;
  onManageTemplates: () => void;
  onClose: () => void;
}

/**
 * The small menu a grid cell opens: every shift the company has defined, a
 * day off, a day of holiday or sick leave, and "remove" when the day already
 * holds any of them. Lists whatever templates exist — one or ten — rather
 * than any fixed set.
 */
export function ShiftPicker({
  anchor,
  heading,
  templates,
  current,
  onPick,
  onManageTemplates,
  onClose,
}: Props) {
  const { t, i18n } = useTranslation();
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Below the cell, or above it when there is no room; never off either edge.
  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!popover) return;

    const cell = anchor.getBoundingClientRect();
    const { width, height } = popover.getBoundingClientRect();
    const fitsBelow = cell.bottom + GAP + height <= window.innerHeight - EDGE;

    setPosition({
      top: fitsBelow ? cell.bottom + GAP : Math.max(EDGE, cell.top - GAP - height),
      left: Math.min(Math.max(EDGE, cell.left), window.innerWidth - width - EDGE),
    });
  }, [anchor, templates.length]);

  // Outside click, Escape, or the page moving under it closes the picker, and
  // focus goes back to the cell it came from.
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!popoverRef.current?.contains(target) && !anchor.contains(target)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onScroll = (event: Event) => {
      if (!popoverRef.current?.contains(event.target as Node)) onClose();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onClose);
    popoverRef.current?.querySelector<HTMLElement>('button')?.focus();

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
      if (anchor.isConnected) anchor.focus();
    };
  }, [anchor, onClose]);

  const pick = async (choice: DayChoice) => {
    setIsSaving(true);
    setError(null);
    try {
      await onPick(choice);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('schedule.errors.generic'));
      setIsSaving(false);
    }
  };

  const isDayOff = current.kind === 'dayOff';
  const removeLabel =
    current.kind === 'dayOff'
      ? 'schedule.picker.removeDayOff'
      : current.kind === 'leave'
        ? 'schedule.picker.removeLeave'
        : 'schedule.picker.remove';

  return createPortal(
    <div
      ref={popoverRef}
      className="shift-picker"
      role="dialog"
      aria-label={heading}
      style={position ? { top: position.top, left: position.left } : { visibility: 'hidden', top: 0, left: 0 }}
    >
      <p className="shift-picker-heading">{heading}</p>

      {templates.length === 0 && (
        <div className="shift-picker-empty">
          <p>{t('schedule.picker.noTemplates')}</p>
          <button type="button" className="btn-ghost btn-row" onClick={onManageTemplates}>
            {t('schedule.editShifts')}
          </button>
        </div>
      )}

      <div className="shift-picker-options" role="menu" aria-busy={isSaving}>
        {templates.map((template) => {
          const isCurrent = current.kind === 'shift' && current.templateId === template.id;
          return (
            <button
              key={template.id}
              type="button"
              role="menuitemradio"
              aria-checked={isCurrent}
              className={`shift-picker-option${isCurrent ? ' is-current' : ''}`}
              disabled={isSaving}
              onClick={() => void (isCurrent ? onClose() : pick({ kind: 'shift', templateId: template.id }))}
            >
              <span className="shift-picker-label">{template.label}</span>
              <span className="shift-picker-time num">
                {template.startTime}–{template.endTime} · {formatHours(t, template.durationMinutes, i18n.language)}
              </span>
              {isCurrent && <CheckIcon />}
            </button>
          );
        })}

        {templates.length > 0 && <div className="shift-picker-divider" role="separator" />}

        <button
          type="button"
          role="menuitemradio"
          aria-checked={isDayOff}
          className={`shift-picker-option shift-picker-option--day-off${isDayOff ? ' is-current' : ''}`}
          disabled={isSaving}
          onClick={() => void (isDayOff ? onClose() : pick({ kind: 'dayOff' }))}
        >
          <span className="shift-picker-label">{t('schedule.dayOff')}</span>
          <span className="shift-picker-time">{t('schedule.picker.dayOffHint')}</span>
          {isDayOff && <CheckIcon />}
        </button>

        {LEAVE_KINDS.map((kind) => {
          const isCurrent = current.kind === 'leave' && current.leave === kind;
          return (
            <button
              key={kind}
              type="button"
              role="menuitemradio"
              aria-checked={isCurrent}
              className={`shift-picker-option shift-picker-option--leave${isCurrent ? ' is-current' : ''}`}
              disabled={isSaving}
              onClick={() => void (isCurrent ? onClose() : pick({ kind: 'leave', leave: kind }))}
            >
              <span className="shift-picker-label">{t(`schedule.leave.${kind}`)}</span>
              <span className="shift-picker-time">{t(`schedule.picker.leaveHint.${kind}`)}</span>
              {isCurrent && <CheckIcon />}
            </button>
          );
        })}
      </div>

      {current.kind !== 'clear' && (
        <button
          type="button"
          className="shift-picker-remove"
          disabled={isSaving}
          onClick={() => void pick({ kind: 'clear' })}
        >
          {t(removeLabel)}
        </button>
      )}

      {error && (
        <p className="form-error shift-picker-error" role="alert">
          {error}
        </p>
      )}
    </div>,
    document.body,
  );
}
