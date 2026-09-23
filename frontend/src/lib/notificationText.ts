import type { TFunction } from 'i18next';
import { formatAmount } from './money.ts';
import type { AppNotification } from './useNotifications.ts';

/**
 * Rendering a notification in the language the user is reading in.
 *
 * The server stores a Macedonian sentence on every row, but it stores the
 * figures behind it too — so this builds the sentence again from `type` and
 * `metadata` through i18next, and the same row reads Macedonian or English
 * depending on the switcher. The stored copy is the fallback, which is what
 * keeps a notification type the frontend has not learned yet readable rather
 * than blank.
 */

type Metadata = Record<string, unknown>;

function str(metadata: Metadata, key: string, fallback = ''): string {
  const value = metadata[key];
  return typeof value === 'string' && value ? value : fallback;
}

function num(metadata: Metadata, key: string): number {
  const value = metadata[key];
  return typeof value === 'number' ? value : 0;
}

/** Today / tomorrow / in N days — how the reminders refer to a due date. */
function whenPhrase(t: TFunction, daysAway: number): string {
  if (daysAway <= 0) return t('notifications.when.today');
  if (daysAway === 1) return t('notifications.when.tomorrow');
  return t('notifications.when.inDays', { count: daysAway });
}

/** "2026-09-14" and "2026-09-20" → "14.09 – 20.09.2026". */
function weekRange(metadata: Metadata): string {
  const [startYear, startMonth, startDay] = str(metadata, 'weekStart').split('-');
  const [endYear, endMonth, endDay] = str(metadata, 'weekEnd').split('-');
  if (!startDay || !endDay) return '';
  const start = startYear === endYear ? `${startDay}.${startMonth}` : `${startDay}.${startMonth}.${startYear}`;
  return `${start} – ${endDay}.${endMonth}.${endYear}`;
}

/** Money as the rest of the app prints it, in the reader's locale. */
function money(metadata: Metadata, locale: string): string {
  const currency = str(metadata, 'currency', 'MKD');
  return `${formatAmount(str(metadata, 'amount', '0'), locale, currency)} ${currency}`;
}

export function notificationTitle(t: TFunction, notification: AppNotification): string {
  return t(`notifications.types.${notification.type}.title`, {
    // Falls back to the Macedonian title the server stored.
    defaultValue: notification.title,
  });
}

export function notificationMessage(
  t: TFunction,
  notification: AppNotification,
  locale: string,
): string {
  const metadata = notification.metadata;

  const values: Record<string, string> = {
    account: str(metadata, 'accountName'),
    amount: money(metadata, locale),
    invoiceNumber: str(metadata, 'invoiceNumber'),
    counterparty: str(metadata, 'counterpartyName'),
    when: whenPhrase(t, num(metadata, 'daysAway')),
    range: weekRange(metadata),
  };

  return t(`notifications.types.${notification.type}.message`, {
    ...values,
    defaultValue: notification.message,
  });
}

/** The local calendar day a notification arrived on, "2026-09-19", for grouping. */
export function notificationDayKey(createdAt: string): string {
  const date = new Date(createdAt);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A day heading on the notifications page: today, yesterday, or "14.09.2026". */
export function notificationDayLabel(t: TFunction, dayKey: string, now = new Date()): string {
  if (dayKey === notificationDayKey(now.toISOString())) return t('notifications.day.today');

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey === notificationDayKey(yesterday.toISOString())) return t('notifications.day.yesterday');

  const [year, month, day] = dayKey.split('-');
  return `${day}.${month}.${year}`;
}

/**
 * How long ago a notification arrived, in words.
 *
 * Deliberately not Intl.RelativeTimeFormat: not every browser ships Macedonian
 * locale data, and the ones that do not fall back to English silently — the
 * same reason `formatAmount` groups digits by hand.
 */
export function notificationAge(t: TFunction, createdAt: string, now = new Date()): string {
  const elapsedMinutes = Math.floor((now.getTime() - new Date(createdAt).getTime()) / 60000);

  if (!Number.isFinite(elapsedMinutes) || elapsedMinutes < 1) return t('notifications.age.now');
  if (elapsedMinutes < 60) return t('notifications.age.minutes', { count: elapsedMinutes });

  const hours = Math.floor(elapsedMinutes / 60);
  if (hours < 24) return t('notifications.age.hours', { count: hours });

  return t('notifications.age.days', { count: Math.floor(hours / 24) });
}
