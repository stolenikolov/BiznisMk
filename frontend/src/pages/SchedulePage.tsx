import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.ts';
import { initials } from '../lib/useEmployees.ts';
import {
  addDays,
  formatDayMonth,
  formatHours,
  formatWeekRange,
  isoWeekday,
  localToday,
  scheduleErrorMessage,
  useScheduleWeek,
  weekFromParam,
  weekStartOf,
  type DayChoice,
  type LeaveKind,
  type PublishOutcome,
  type ScheduleAssignment,
  type ScheduleEmployee,
  type ShiftTemplate,
} from '../lib/schedule.ts';
import { ShiftPicker } from '../components/ShiftPicker.tsx';
import { ShiftTemplatesModal } from '../components/ShiftTemplatesModal.tsx';
import { ChevronLeftIcon, ChevronRightIcon, LockIcon, PlusIcon, TeamIcon } from '../components/icons.tsx';

interface OpenPicker {
  anchor: HTMLElement;
  employee: ScheduleEmployee;
  date: string;
  current: DayChoice;
}

/**
 * The weekly schedule: one row per employee, one column per day. The week is
 * in the URL (?week=Monday) so a link — including the one in a "schedule
 * published" notification — opens the right week.
 */
export function SchedulePage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const companyId = user?.companyId;
  const [searchParams, setSearchParams] = useSearchParams();
  const weekStart = weekFromParam(searchParams.get('week')) ?? weekStartOf(localToday());

  const { week, isLoading, hasError, reload, assign, copyPrevious, publish, unlock } = useScheduleWeek(
    companyId,
    weekStart,
  );

  const [picker, setPicker] = useState<OpenPicker | null>(null);
  const [isManagingTemplates, setIsManagingTemplates] = useState(false);
  const [busyAction, setBusyAction] = useState<'copy' | 'publish' | 'unlock' | null>(null);
  const [message, setMessage] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  // Phones show one day at a time; this is the one picked, if it is in this week.
  const [chosenDay, setChosenDay] = useState<string | null>(null);

  const templatesById = useMemo(
    () => new Map((week?.templates ?? []).map((template) => [template.id, template])),
    [week?.templates],
  );
  const assignments = useMemo(
    () => new Map((week?.entries ?? []).map((entry) => [`${entry.employeeId}|${entry.date}`, entry])),
    [week?.entries],
  );

  const goToWeek = (start: string) => {
    setPicker(null);
    setMessage(null);
    setSearchParams({ week: start });
  };

  const closePicker = useCallback(() => setPicker(null), []);
  const hours = (minutes: number) => formatHours(t, minutes, i18n.language);
  const dayName = (date: string) => `${t(`schedule.weekdays.${isoWeekday(date)}`)} ${formatDayMonth(date)}`;

  const runAction = async (action: 'copy' | 'publish' | 'unlock') => {
    setBusyAction(action);
    setMessage(null);
    try {
      if (action === 'copy') {
        const result = await copyPrevious();
        setMessage({
          tone: 'info',
          text:
            result.copied === 0 && result.skippedOnLeave === 0
              ? t('schedule.results.copiedNone')
              : result.skippedOnLeave > 0
                ? t('schedule.results.copiedWithSkipped', { count: result.copied, skipped: result.skippedOnLeave })
                : t('schedule.results.copied', { count: result.copied }),
        });
      } else if (action === 'publish') {
        const wasPublished = week?.publishedAt != null;
        const result = await publish();
        setMessage({
          tone: result.email.failed.length > 0 ? 'error' : 'info',
          text: publishMessage(t, result, wasPublished),
        });
      } else {
        await unlock();
        setMessage({ tone: 'info', text: t('schedule.results.unlocked') });
      }
    } catch (err) {
      setMessage({ tone: 'error', text: scheduleErrorMessage(t, err) });
    } finally {
      setBusyAction(null);
    }
  };

  const isLocked = week?.isLocked ?? false;
  const todayInWeek = week ? week.dates.includes(week.today) : false;
  const focusedDay =
    week && chosenDay && week.dates.includes(chosenDay) ? chosenDay : todayInWeek ? week?.today : week?.dates[0];

  return (
    <section className="schedule">
      <header className="page-header">
        <div>
          <h1 className="page-title">{t('nav.schedule')}</h1>
          <p className="page-subtitle">{t('schedule.subtitle')}</p>
        </div>

        <div className="schedule-actions">
          <div className="week-nav" role="group" aria-label={t('schedule.weekNavigation')}>
            <button
              type="button"
              className="week-nav-step"
              onClick={() => goToWeek(addDays(weekStart, -7))}
              aria-label={t('schedule.previousWeek')}
            >
              <ChevronLeftIcon />
            </button>
            <span className="week-nav-label" aria-live="polite">
              {formatWeekRange(t, weekStart, addDays(weekStart, 6))}
            </span>
            <button
              type="button"
              className="week-nav-step"
              onClick={() => goToWeek(addDays(weekStart, 7))}
              aria-label={t('schedule.nextWeek')}
            >
              <ChevronRightIcon />
            </button>
          </div>

          {companyId && week && (
            <>
              <button type="button" className="btn-ghost" onClick={() => setIsManagingTemplates(true)}>
                {t('schedule.editShifts')}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => void runAction('copy')}
                disabled={isLocked || busyAction !== null}
              >
                {busyAction === 'copy' ? t('schedule.copying') : t('schedule.copyPrevious')}
              </button>
              {isLocked ? (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => void runAction('unlock')}
                  disabled={busyAction !== null}
                >
                  <LockIcon />
                  {t('schedule.unlock')}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void runAction('publish')}
                  disabled={busyAction !== null}
                >
                  {busyAction === 'publish' ? t('schedule.publishing') : t('schedule.publish')}
                </button>
              )}
            </>
          )}
        </div>
      </header>

      {weekStart !== weekStartOf(localToday()) && (
        <button type="button" className="btn-quiet week-nav-today" onClick={() => goToWeek(weekStartOf(localToday()))}>
          {t('schedule.thisWeek')}
        </button>
      )}

      {message && (
        <p className={message.tone === 'error' ? 'form-error' : 'schedule-message'} role={message.tone === 'error' ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}

      {!companyId ? (
        <EmptyCard message={t('schedule.noCompany')} />
      ) : isLoading && !week ? (
        <p className="dashboard-placeholder">{t('common.loading')}</p>
      ) : hasError || !week ? (
        <EmptyCard message={t('schedule.loadError')} />
      ) : (
        <>
          <div className="stat-cards">
            <div className="card stat-card">
              <span className="label-caps">{t('schedule.stats.hours')}</span>
              <span className="stat-card-figure">{hours(week.summary.scheduledMinutes)}</span>
            </div>
            <div className="card stat-card">
              <span className="label-caps">{t('schedule.stats.onShiftToday')}</span>
              <span className="stat-card-figure">{todayInWeek ? week.summary.onShiftToday : '—'}</span>
              {!todayInWeek && <span className="field-hint">{t('schedule.stats.notThisWeek')}</span>}
            </div>
            <div className="card stat-card">
              <span className="label-caps">{t('schedule.stats.onLeave')}</span>
              <span className="stat-card-figure">{week.summary.onLeaveThisWeek}</span>
            </div>
          </div>

          <div className="schedule-legend">
            <span className="schedule-legend-item">
              <span className="legend-swatch legend-swatch--shift" aria-hidden="true" />
              {t('schedule.legend.shift')}
            </span>
            <span className="schedule-legend-item">
              <span className="legend-swatch legend-swatch--day-off" aria-hidden="true" />
              {t('schedule.legend.dayOff')}
            </span>
            <span className="schedule-legend-item">
              <span className="legend-swatch legend-swatch--leave" aria-hidden="true" />
              {t('schedule.legend.leave')}
            </span>
            {isLocked ? (
              <span className="schedule-legend-item schedule-legend-locked">
                <LockIcon />
                {week.publishedAt
                  ? t('schedule.legend.locked', { when: formatPublishedAt(week.publishedAt) })
                  : t('schedule.legend.lockedShort')}
              </span>
            ) : (
              <span className="schedule-legend-item">
                <span className="legend-swatch legend-swatch--empty" aria-hidden="true">
                  <PlusIcon />
                </span>
                {t('schedule.legend.empty')}
              </span>
            )}
          </div>

          {week.employees.length === 0 ? (
            <EmptyCard
              message={t('schedule.noEmployees')}
              action={
                <Link to="/employees/new" className="btn-ghost">
                  {t('employees.addCta')}
                </Link>
              }
            />
          ) : (
            <>
            {/* Phones only: the week is too wide, so one day is shown and these pick it. */}
            <div className="schedule-day-picker" role="group" aria-label={t('schedule.chooseDay')}>
              {week.dates.map((date) => (
                <button
                  key={date}
                  type="button"
                  className={`schedule-day-pick${date === week.today ? ' is-today' : ''}`}
                  aria-pressed={date === focusedDay}
                  onClick={() => setChosenDay(date)}
                >
                  <span className="label-caps">{t(`schedule.weekdays.${isoWeekday(date)}`)}</span>
                  <span className="num">{date.slice(8)}</span>
                </button>
              ))}
            </div>
            <div className={`card schedule-card${isLocked ? ' is-locked' : ''}`}>
              <div className="schedule-scroll">
                <div className="schedule-grid" role="grid" aria-label={formatWeekRange(t, weekStart, addDays(weekStart, 6))}>
                  <div className="schedule-row schedule-row--head" role="row">
                    <div className="schedule-cell schedule-cell--person label-caps" role="columnheader">
                      {t('schedule.columns.employee')}
                    </div>
                    {week.dates.map((date) => (
                      <div
                        key={date}
                        role="columnheader"
                        className={`schedule-cell schedule-day${date === week.today ? ' is-today' : ''}${date === focusedDay ? ' is-focused' : ''}`}
                        aria-current={date === week.today ? 'date' : undefined}
                      >
                        <span className="label-caps">{t(`schedule.weekdays.${isoWeekday(date)}`)}</span>
                        <span className="schedule-day-date num">{formatDayMonth(date)}</span>
                      </div>
                    ))}
                    <div className="schedule-cell schedule-cell--total label-caps" role="columnheader">
                      {t('schedule.columns.total')}
                    </div>
                  </div>

                  {week.employees.map((employee) => (
                    <div key={employee.id} className="schedule-row" role="row">
                      <div className="schedule-cell schedule-cell--person" role="rowheader">
                        <div className="employee-person">
                          {employee.photoUrl ? (
                            <img className="employee-avatar" src={employee.photoUrl} alt="" />
                          ) : (
                            <span className="employee-avatar" aria-hidden="true">
                              {initials(employee)}
                            </span>
                          )}
                          <div className="employee-name-stack">
                            <span className="employee-name" title={`${employee.firstName} ${employee.lastName}`}>
                              {employee.firstName} {employee.lastName}
                            </span>
                            <span className="schedule-role">{t(`employees.roles.${employee.role}`)}</span>
                          </div>
                        </div>
                      </div>

                      {week.dates.map((date) => {
                        const entry = assignments.get(`${employee.id}|${date}`);
                        const template = entry?.shiftTemplateId ? templatesById.get(entry.shiftTemplateId) : undefined;
                        return (
                          <div
                            key={date}
                            role="gridcell"
                            className={`schedule-cell schedule-slot${date === week.today ? ' is-today' : ''}${date === focusedDay ? ' is-focused' : ''}`}
                          >
                            <DayCell
                              employee={employee}
                              date={date}
                              dayName={dayName(date)}
                              template={template}
                              isDayOff={entry?.dayOff ?? false}
                              plannedLeave={entry?.leave ?? null}
                              isLocked={isLocked}
                              onOpen={(anchor) =>
                                setPicker({ anchor, employee, date, current: dayChoiceOf(entry, template) })
                              }
                            />
                          </div>
                        );
                      })}

                      <div className="schedule-cell schedule-cell--total" role="gridcell">
                        <span className="schedule-total num">{hours(employee.scheduledMinutes)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            </>
          )}
        </>
      )}

      {picker && week && (
        <ShiftPicker
          anchor={picker.anchor}
          heading={`${picker.employee.firstName} ${picker.employee.lastName} · ${dayName(picker.date)}`}
          templates={week.templates}
          current={picker.current}
          onPick={async (choice) => {
            try {
              await assign(picker.employee.id, picker.date, choice);
            } catch (err) {
              // The picker shows the message; a week that turned out locked or
              // a leave that started meanwhile is refreshed underneath it.
              void reload();
              throw new Error(scheduleErrorMessage(t, err));
            }
          }}
          onManageTemplates={() => {
            setPicker(null);
            setIsManagingTemplates(true);
          }}
          onClose={closePicker}
        />
      )}

      {isManagingTemplates && companyId && week && (
        <ShiftTemplatesModal
          companyId={companyId}
          templates={week.templates}
          onChanged={() => void reload()}
          onClose={() => setIsManagingTemplates(false)}
        />
      )}
    </section>
  );
}

interface DayCellProps {
  employee: ScheduleEmployee;
  date: string;
  dayName: string;
  template: ShiftTemplate | undefined;
  isDayOff: boolean;
  /** Holiday or sick leave planned for this day in the grid. */
  plannedLeave: LeaveKind | null;
  isLocked: boolean;
  onOpen: (anchor: HTMLElement) => void;
}

/**
 * One day for one person: away by their status (locked), a day of leave
 * planned here, a shift, a day off, or an empty slot.
 */
function DayCell({ employee, date, dayName, template, isDayOff, plannedLeave, isLocked, onOpen }: DayCellProps) {
  const { t } = useTranslation();
  const name = `${employee.firstName} ${employee.lastName}`;
  const leave = employee.leaveDays[date];

  // Away is decided by the employee's own status and is never assignable,
  // whether or not the week is locked.
  if (leave) {
    return (
      <span className="leave-tag" aria-disabled="true" title={t('schedule.leaveLocked')}>
        <LockIcon />
        {t(`schedule.leave.${leave}`)}
      </span>
    );
  }

  // Leave planned in the grid, unlike the status above, is the manager's to change.
  if (plannedLeave) {
    const label = t(`schedule.leave.${plannedLeave}`);
    return isLocked ? (
      <span className="leave-pill is-static">{label}</span>
    ) : (
      <button
        type="button"
        className="leave-pill"
        onClick={(event) => onOpen(event.currentTarget)}
        aria-haspopup="dialog"
        aria-label={t('schedule.changeShift', { name, day: dayName, shift: label })}
      >
        {label}
      </button>
    );
  }

  if (template) {
    const content = (
      <>
        <span className="shift-pill-label" title={template.label}>
          {template.label}
        </span>
        <span className="shift-pill-time num">
          {template.startTime}–{template.endTime}
        </span>
      </>
    );
    return isLocked ? (
      <span className="shift-pill is-static">{content}</span>
    ) : (
      <button
        type="button"
        className="shift-pill"
        onClick={(event) => onOpen(event.currentTarget)}
        aria-haspopup="dialog"
        aria-label={t('schedule.changeShift', { name, day: dayName, shift: `${template.label} ${template.startTime}–${template.endTime}` })}
      >
        {content}
      </button>
    );
  }

  if (isDayOff) {
    return isLocked ? (
      <span className="day-off-pill is-static">{t('schedule.dayOff')}</span>
    ) : (
      <button
        type="button"
        className="day-off-pill"
        onClick={(event) => onOpen(event.currentTarget)}
        aria-haspopup="dialog"
        aria-label={t('schedule.changeShift', { name, day: dayName, shift: t('schedule.dayOff') })}
      >
        {t('schedule.dayOff')}
      </button>
    );
  }

  if (isLocked) return <span className="shift-none" aria-label={t('schedule.noShift')} />;

  return (
    <button
      type="button"
      className="shift-add"
      onClick={(event) => onOpen(event.currentTarget)}
      aria-haspopup="dialog"
      aria-label={t('schedule.assignShift', { name, day: dayName })}
    >
      <PlusIcon />
    </button>
  );
}

function dayChoiceOf(entry: ScheduleAssignment | undefined, template: ShiftTemplate | undefined): DayChoice {
  if (entry?.leave) return { kind: 'leave', leave: entry.leave };
  if (template) return { kind: 'shift', templateId: template.id };
  if (entry?.dayOff) return { kind: 'dayOff' };
  return { kind: 'clear' };
}

/**
 * What publishing did, in a sentence or two: who the week was emailed to, and
 * by name whom it could not reach, since they have no other way to find out.
 */
function publishMessage(t: TFunction, result: PublishOutcome, wasPublished: boolean): string {
  const { mode, sent, failed } = result.email;
  const parts: string[] = [];

  if (sent === 0 && failed.length === 0) {
    parts.push(t('schedule.results.publishedNoChanges'));
  } else if (sent === 0) {
    parts.push(t('schedule.results.publishedNotEmailed'));
  } else if (mode === 'outbox') {
    parts.push(t('schedule.results.publishedOutbox', { count: sent }));
  } else {
    parts.push(
      t(wasPublished ? 'schedule.results.republishedEmailed' : 'schedule.results.publishedEmailed', { count: sent }),
    );
  }

  if (failed.length > 0) {
    parts.push(t('schedule.results.emailFailed', { names: failed.map((employee) => employee.name).join(', ') }));
  }

  return parts.join(' ');
}

function EmptyCard({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="card">
      <div className="empty-state">
        <span className="empty-state-icon">
          <TeamIcon />
        </span>
        <p>{message}</p>
        {action}
      </div>
    </div>
  );
}

/** "17.09 15:20" in the reader's own time. */
function formatPublishedAt(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
