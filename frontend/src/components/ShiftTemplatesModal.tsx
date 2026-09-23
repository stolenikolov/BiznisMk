import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api.ts';
import { formatHours, schedulePath, scheduleErrorMessage, type ShiftTemplate } from '../lib/schedule.ts';
import { Modal } from './Modal.tsx';
import { PlusIcon, TrashIcon } from './icons.tsx';

const SAVE_DELAY_MS = 450;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

type RowState = 'saved' | 'saving' | 'incomplete' | 'error';

interface Row {
  /** Stable React key, also for rows the server has not seen yet. */
  key: string;
  id: string | null;
  label: string;
  startTime: string;
  endTime: string;
  /** From the server's last answer; null until the row has been saved. */
  durationMinutes: number | null;
  state: RowState;
  message: string | null;
  confirmingDelete: boolean;
}

interface Props {
  companyId: string;
  templates: readonly ShiftTemplate[];
  /** Called after every change the server accepted, so the grid can refresh. */
  onChanged: () => void;
  onClose: () => void;
}

let draftCounter = 0;

/**
 * The company's shifts, edited in place. There is no save button: each row is
 * written a moment after typing stops — created the first time it is complete,
 * updated after that — the same direct feel as the grid itself.
 */
export function ShiftTemplatesModal({ companyId, templates, onChanged, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<Row[]>(() =>
    templates.map((template) => ({
      key: template.id,
      id: template.id,
      label: template.label,
      startTime: template.startTime,
      endTime: template.endTime,
      durationMinutes: template.durationMinutes,
      state: 'saved',
      message: null,
      confirmingDelete: false,
    })),
  );
  const [notice, setNotice] = useState<string | null>(null);

  // Latest values for the savers, which run after a delay and must not read a
  // stale render. One timer and one promise chain per row, so a slow create is
  // never raced by the edit typed right after it.
  const rowsRef = useRef(rows);
  const timers = useRef(new Map<string, number>());
  const chains = useRef(new Map<string, Promise<void>>());
  // Server ids, recorded the moment a create answers. The next save in the
  // chain can run before React re-renders, and must PATCH rather than create
  // the same shift a second time.
  const savedIds = useRef(new Map<string, string>());

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const patchRow = (key: string, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const save = async (key: string) => {
    const row = rowsRef.current.find((candidate) => candidate.key === key);
    if (!row) return;
    const id = savedIds.current.get(key) ?? row.id;

    const label = row.label.trim();
    if (!label || !TIME.test(row.startTime) || !TIME.test(row.endTime)) {
      patchRow(key, { state: 'incomplete', message: t('schedule.templates.incomplete') });
      return;
    }
    if (row.startTime === row.endTime) {
      patchRow(key, { state: 'incomplete', message: t('schedule.templates.sameTimes') });
      return;
    }

    patchRow(key, { state: 'saving', message: null });
    const body = { label, startTime: row.startTime, endTime: row.endTime };
    try {
      const { data } = id
        ? await api.patch<{ template: ShiftTemplate }>(`${schedulePath(companyId)}/shift-templates/${id}`, body)
        : await api.post<{ template: ShiftTemplate }>(`${schedulePath(companyId)}/shift-templates`, body);
      savedIds.current.set(key, data.template.id);
      patchRow(key, {
        id: data.template.id,
        durationMinutes: data.template.durationMinutes,
        state: 'saved',
        message: null,
      });
      onChanged();
    } catch (err) {
      patchRow(key, { state: 'error', message: scheduleErrorMessage(t, err) });
    }
  };

  const scheduleSave = (key: string) => {
    window.clearTimeout(timers.current.get(key));
    timers.current.set(
      key,
      window.setTimeout(() => {
        const next = (chains.current.get(key) ?? Promise.resolve()).then(() => save(key));
        chains.current.set(key, next);
      }, SAVE_DELAY_MS),
    );
  };

  const edit = (key: string, patch: Pick<Partial<Row>, 'label' | 'startTime' | 'endTime'>) => {
    patchRow(key, { ...patch, confirmingDelete: false });
    scheduleSave(key);
  };

  const addRow = () => {
    draftCounter += 1;
    setRows((current) => [
      ...current,
      {
        key: `draft-${draftCounter}`,
        id: null,
        label: '',
        startTime: '',
        endTime: '',
        durationMinutes: null,
        state: 'incomplete',
        message: null,
        confirmingDelete: false,
      },
    ]);
  };

  const remove = async (row: Row) => {
    window.clearTimeout(timers.current.get(row.key));
    // A create still on its way must land first, or it would bring the row back.
    await (chains.current.get(row.key) ?? Promise.resolve());
    const id = savedIds.current.get(row.key) ?? row.id;

    // Never saved: nothing to delete on the server.
    if (!id) {
      setRows((current) => current.filter((candidate) => candidate.key !== row.key));
      return;
    }
    // Deleting clears this shift from every week it was assigned in, so it
    // takes a second, deliberate click.
    if (!row.confirmingDelete) {
      patchRow(row.key, { confirmingDelete: true });
      return;
    }

    patchRow(row.key, { state: 'saving' });
    try {
      const { data } = await api.delete<{ clearedEntries: number }>(
        `${schedulePath(companyId)}/shift-templates/${id}`,
      );
      setRows((current) => current.filter((candidate) => candidate.key !== row.key));
      setNotice(
        data.clearedEntries > 0
          ? t('schedule.templates.deletedCleared', { label: row.label, count: data.clearedEntries })
          : t('schedule.templates.deleted', { label: row.label }),
      );
      onChanged();
    } catch (err) {
      patchRow(row.key, { state: 'error', message: scheduleErrorMessage(t, err), confirmingDelete: false });
    }
  };

  return (
    <Modal onClose={onClose} labelledBy="shift-templates-title" wide>
      <h2 id="shift-templates-title" className="modal-title">
        {t('schedule.templates.title')}
      </h2>
      <p className="modal-note">{t('schedule.templates.note')}</p>

      <div className="shift-templates">
        {rows.length > 0 && (
          <div className="shift-template-row shift-template-row--head" aria-hidden="true">
            <span className="label-caps">{t('schedule.templates.label')}</span>
            <span className="label-caps">{t('schedule.templates.start')}</span>
            <span className="label-caps">{t('schedule.templates.end')}</span>
            <span className="label-caps">{t('schedule.templates.duration')}</span>
            <span />
          </div>
        )}

        {rows.length === 0 && <p className="shift-templates-empty">{t('schedule.templates.empty')}</p>}

        {rows.map((row, index) => (
          <div key={row.key} className="shift-template-entry">
            <div className="shift-template-row">
              <input
                className="shift-template-input"
                value={row.label}
                onChange={(e) => edit(row.key, { label: e.target.value })}
                placeholder={t('schedule.templates.labelPlaceholder')}
                aria-label={`${t('schedule.templates.label')} ${index + 1}`}
                maxLength={60}
                autoFocus={row.id === null && row.label === ''}
              />
              <input
                type="time"
                className="shift-template-input"
                value={row.startTime}
                onChange={(e) => edit(row.key, { startTime: e.target.value })}
                aria-label={`${t('schedule.templates.start')} ${index + 1}`}
              />
              <input
                type="time"
                className="shift-template-input"
                value={row.endTime}
                onChange={(e) => edit(row.key, { endTime: e.target.value })}
                aria-label={`${t('schedule.templates.end')} ${index + 1}`}
              />
              <span className="shift-template-duration num">
                {row.durationMinutes === null ? '—' : formatHours(t, row.durationMinutes, i18n.language)}
              </span>
              <button
                type="button"
                className={`shift-template-delete${row.confirmingDelete ? ' is-confirming' : ''}`}
                onClick={() => void remove(row)}
                aria-label={
                  row.confirmingDelete
                    ? t('schedule.templates.confirmDelete')
                    : `${t('schedule.templates.delete')}: ${row.label || index + 1}`
                }
                disabled={row.state === 'saving' && row.confirmingDelete}
              >
                {row.confirmingDelete ? t('schedule.templates.confirmDelete') : <TrashIcon />}
              </button>
            </div>
            <p className={`shift-template-status is-${row.state}`} aria-live="polite">
              {row.message ??
                (row.state === 'saving'
                  ? t('schedule.templates.saving')
                  : row.state === 'saved' && row.id && row.endTime <= row.startTime
                    ? t('schedule.templates.overnight')
                    : '')}
            </p>
          </div>
        ))}

        <button type="button" className="btn-ghost shift-templates-add" onClick={addRow}>
          <PlusIcon />
          {t('schedule.templates.add')}
        </button>
      </div>

      {notice && (
        <p className="shift-templates-notice" role="status">
          {notice}
        </p>
      )}

      <div className="modal-actions">
        <button type="button" className="btn-primary" onClick={onClose}>
          {t('schedule.templates.done')}
        </button>
      </div>
    </Modal>
  );
}
