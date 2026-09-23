/**
 * The Macedonian copy stored on every notification row.
 *
 * The notification centre does not read these: it translates `type` plus
 * `metadata` through i18next, so the same row reads Macedonian or English
 * depending on the switcher. These strings exist so a row is still meaningful
 * on its own — in the database, in a support query, and in whatever reads
 * notifications next (an email digest, a push payload) before it has copy of
 * its own. Macedonian because that is the app's default language.
 *
 * Pure and Prisma-free, so the wording can be tested directly.
 */

import { NotificationType } from '../generated/prisma/enums.js';

export interface NotificationCopy {
  title: string;
  message: string;
}

/**
 * Groups thousands the way the frontend's `formatAmount` does for Macedonian:
 * a dot between groups, a comma before the decimals. Deliberately not
 * Intl.NumberFormat — Node builds without full ICU quietly fall back to
 * English separators, which would store a hundred-odd thousand as "124,500".
 */
export function formatAmount(amount: string): string {
  const match = /^(-?)(\d+)(?:\.(\d*))?$/.exec(amount.trim());
  if (!match) return amount;

  const [, sign = '', whole = '0', fraction = ''] = match;
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decimals = fraction.padEnd(2, '0').slice(0, 2);

  return decimals === '00' ? `${sign}${grouped}` : `${sign}${grouped},${decimals}`;
}

/** How the reminders refer to the date: today, tomorrow, or in N days. */
export function whenPhrase(daysAway: number): string {
  if (daysAway <= 0) return 'денес';
  if (daysAway === 1) return 'утре';
  return `за ${daysAway} дена`;
}

type Metadata = Record<string, unknown>;

function text(metadata: Metadata, key: string, fallback = ''): string {
  const value = metadata[key];
  return typeof value === 'string' && value ? value : fallback;
}

function money(metadata: Metadata): string {
  return `${formatAmount(text(metadata, 'amount', '0'))} ${text(metadata, 'currency', 'MKD')}`;
}

function days(metadata: Metadata): number {
  const value = metadata['daysAway'];
  return typeof value === 'number' ? value : 0;
}

/** "2026-09-14" and "2026-09-20" → "14.09 – 20.09.2026". */
export function weekRange(metadata: Metadata): string {
  const [startYear, startMonth, startDay] = text(metadata, 'weekStart').split('-');
  const [endYear, endMonth, endDay] = text(metadata, 'weekEnd').split('-');
  if (!startDay || !endDay) return '';
  const start = startYear === endYear ? `${startDay}.${startMonth}` : `${startDay}.${startMonth}.${startYear}`;
  return `${start} – ${endDay}.${endMonth}.${endYear}`;
}

/**
 * The stored sentence for one notification.
 *
 * Every branch reads from `metadata`, which is the same data the frontend
 * translates from — so the two renderings cannot drift onto different facts,
 * only different languages.
 */
export function buildNotificationCopy(type: NotificationType, metadata: Metadata): NotificationCopy {
  switch (type) {
    case NotificationType.ACCOUNT_OUTFLOW:
      return {
        title: 'Одлив од сметка',
        message: `${money(metadata)} излегоа од ${text(metadata, 'accountName', 'сметката')}.`,
      };

    case NotificationType.ACCOUNT_INFLOW:
      return {
        title: 'Прилив на сметка',
        message: `${money(metadata)} влегоа на ${text(metadata, 'accountName', 'сметката')}.`,
      };

    case NotificationType.INVOICE_DUE:
      return {
        title: 'Рок на фактура',
        message:
          `Фактура ${text(metadata, 'invoiceNumber')} (${text(metadata, 'counterpartyName')}) ` +
          `достасува ${whenPhrase(days(metadata))} — ${money(metadata)}.`,
      };

    case NotificationType.LOAN_INSTALLMENT_DUE:
      return {
        title: 'Рата за кредит',
        message:
          `Ратата за кредитот на ${text(metadata, 'accountName', 'сметката')} ` +
          `достасува ${whenPhrase(days(metadata))} — ${money(metadata)}.`,
      };

    case NotificationType.EMPLOYEE_PAYDAY:
      return {
        title: 'Исплата на плати',
        message: `Платите се исплаќаат ${whenPhrase(days(metadata))}.`,
      };

    case NotificationType.SCHEDULE_PUBLISHED:
      return {
        title: 'Нов распоред',
        message: `Твојот распоред за неделата ${weekRange(metadata)} е објавен.`,
      };
  }
}
