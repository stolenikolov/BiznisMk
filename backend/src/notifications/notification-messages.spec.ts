import { describe, expect, it } from 'vitest';
import { NotificationType } from '../generated/prisma/enums.js';
import { buildNotificationCopy, formatAmount, whenPhrase } from './notification-messages.js';

describe('formatAmount', () => {
  it('groups thousands with a dot, the Macedonian way', () => {
    expect(formatAmount('124500.00')).toBe('124.500');
    expect(formatAmount('1234567.00')).toBe('1.234.567');
  });

  it('keeps decimals only when there are any', () => {
    expect(formatAmount('1200.50')).toBe('1.200,50');
    expect(formatAmount('1200.00')).toBe('1.200');
  });

  it('keeps a negative sign outside the grouping', () => {
    expect(formatAmount('-4500.00')).toBe('-4.500');
  });

  it('returns anything it cannot parse untouched', () => {
    expect(formatAmount('n/a')).toBe('n/a');
  });
});

describe('whenPhrase', () => {
  it('names the day rather than counting to it', () => {
    expect(whenPhrase(0)).toBe('денес');
    expect(whenPhrase(1)).toBe('утре');
    expect(whenPhrase(3)).toBe('за 3 дена');
  });

  it('reads as today for a date that has slipped past', () => {
    expect(whenPhrase(-1)).toBe('денес');
  });
});

describe('buildNotificationCopy', () => {
  it('names the account and the amount on an outflow', () => {
    const copy = buildNotificationCopy(NotificationType.ACCOUNT_OUTFLOW, {
      accountName: 'Комерцијална банка 4471',
      amount: '18400.00',
      currency: 'MKD',
    });
    expect(copy.title).toBe('Одлив од сметка');
    expect(copy.message).toBe('18.400 MKD излегоа од Комерцијална банка 4471.');
  });

  it('names the account and the amount on an inflow', () => {
    const copy = buildNotificationCopy(NotificationType.ACCOUNT_INFLOW, {
      accountName: 'Стопанска банка 1120',
      amount: '7250.00',
      currency: 'MKD',
    });
    expect(copy.message).toBe('7.250 MKD влегоа на Стопанска банка 1120.');
  });

  it('puts the invoice, the counterparty and the timing in one sentence', () => {
    const copy = buildNotificationCopy(NotificationType.INVOICE_DUE, {
      invoiceNumber: '0004/2026',
      counterpartyName: 'Дрим Дизајн ДООЕЛ',
      amount: '35400.00',
      currency: 'MKD',
      daysAway: 3,
    });
    expect(copy.message).toContain('0004/2026');
    expect(copy.message).toContain('Дрим Дизајн ДООЕЛ');
    expect(copy.message).toContain('за 3 дена');
    expect(copy.message).toContain('35.400 MKD');
  });

  it('renders a loan instalment against its account', () => {
    const copy = buildNotificationCopy(NotificationType.LOAN_INSTALLMENT_DUE, {
      accountName: 'НЛБ 8890',
      amount: '12000.00',
      currency: 'MKD',
      daysAway: 1,
    });
    expect(copy.title).toBe('Рата за кредит');
    expect(copy.message).toContain('НЛБ 8890');
    expect(copy.message).toContain('утре');
  });

  it('renders payday without inventing an amount', () => {
    const copy = buildNotificationCopy(NotificationType.EMPLOYEE_PAYDAY, { daysAway: 0 });
    expect(copy.title).toBe('Исплата на плати');
    expect(copy.message).toBe('Платите се исплаќаат денес.');
  });

  // Metadata is assembled by callers; a missing field must degrade to a
  // readable sentence rather than printing "undefined" at the user.
  it('falls back to generic wording when metadata is thin', () => {
    const copy = buildNotificationCopy(NotificationType.ACCOUNT_OUTFLOW, {});
    expect(copy.message).toBe('0 MKD излегоа од сметката.');
  });
});
