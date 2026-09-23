import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingsCard } from '../../components/SettingsCard.tsx';
import { OwnerSettings } from '../../layouts/SettingsLayout.tsx';
import type { CompanySettings, CompanySettingsPatch } from '../../lib/settings.ts';

const DAYS = Array.from({ length: 31 }, (_, index) => index + 1);

/** When salaries go out, which is what the payday reminders count down to. */
export function PayrollSettingsPage() {
  return <OwnerSettings>{(settings, { save }) => <PaydayCard settings={settings} save={save} />}</OwnerSettings>;
}

function PaydayCard({
  settings,
  save,
}: {
  settings: CompanySettings;
  save: (patch: CompanySettingsPatch) => Promise<CompanySettings>;
}) {
  const { t } = useTranslation();
  const [day, setDay] = useState<number | null>(settings.paydayDayOfMonth);
  const next = day === null ? null : nextPayday(day, new Date());

  return (
    <SettingsCard
      title={t('settings.payroll.title')}
      description={t('settings.payroll.hint')}
      isDirty={day !== settings.paydayDayOfMonth}
      onSave={async () => {
        await save({ paydayDayOfMonth: day });
      }}
    >
      <label>
        {t('settings.payroll.day')}
        <select value={day ?? ''} onChange={(e) => setDay(e.target.value === '' ? null : Number(e.target.value))}>
          <option value="">{t('settings.payroll.none')}</option>
          {DAYS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <span className="field-hint">
          {next
            ? t('settings.payroll.next', { date: formatDate(next) })
            : t('settings.payroll.noReminders')}
        </span>
      </label>
      <p className="field-hint">{t('settings.payroll.shortMonths')}</p>
    </SettingsCard>
  );
}

/**
 * The next date salaries go out, today included; a day past the end of a
 * short month is that month's last day — the same rule the reminders follow.
 */
function nextPayday(day: number, now: Date): Date {
  const onDay = (year: number, month: number) =>
    new Date(year, month, Math.min(day, new Date(year, month + 1, 0).getDate()));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thisMonth = onDay(today.getFullYear(), today.getMonth());
  return thisMonth >= today ? thisMonth : onDay(today.getFullYear(), today.getMonth() + 1);
}

/** "25.09.2026" */
function formatDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}
