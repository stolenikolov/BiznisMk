import { describe, expect, it } from 'vitest';
import { InvoiceDirection, NotificationType } from '../generated/prisma/enums.js';
import {
  collectDueReminders,
  creditLineCandidate,
  invoiceCandidate,
  paydayCandidate,
  type DueCreditLine,
  type DueInvoice,
} from './due-reminders.js';

const at = (iso: string, hour = 12) => {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year!, month! - 1, day!, hour);
};

const invoice = (overrides: Partial<DueInvoice> = {}): DueInvoice => ({
  id: 'inv-1',
  companyId: 'co-1',
  direction: InvoiceDirection.OUTGOING,
  invoiceNumber: '0004/2026',
  clientName: 'Дрим Дизајн ДООЕЛ',
  totalAmount: '35400.00',
  currency: 'MKD',
  dueDate: at('2026-09-18'),
  ...overrides,
});

const creditLine = (overrides: Partial<DueCreditLine> = {}): DueCreditLine => ({
  id: 'cl-1',
  companyId: 'co-1',
  bankAccountId: 'acc-1',
  accountName: 'НЛБ 8890',
  installmentAmount: '12000.00',
  currency: 'MKD',
  installmentsPaid: 4,
  totalInstallments: 36,
  nextPaymentDate: at('2026-09-16'),
  ...overrides,
});

describe('invoiceCandidate', () => {
  it('keys off the due date and carries the invoice through metadata', () => {
    const candidate = invoiceCandidate(invoice());

    expect(candidate.type).toBe(NotificationType.INVOICE_DUE);
    expect(candidate.companyId).toBe('co-1');
    expect(candidate.entityId).toBe('inv-1');
    expect(candidate.relatedEntityType).toBe('invoice');
    expect(candidate.dueDate).toEqual(at('2026-09-18'));
    expect(candidate.metadata).toMatchObject({
      invoiceNumber: '0004/2026',
      counterpartyName: 'Дрим Дизајн ДООЕЛ',
      amount: '35400.00',
    });
  });

  // The whole point of keying off the due date rather than off who typed the
  // invoice in: a bill that arrived from elsewhere reminds exactly the same
  // way, so inbound invoices need no second code path when they land.
  it('treats a bill we owe the same as one we issued', () => {
    const owed = invoiceCandidate(invoice({ direction: InvoiceDirection.INCOMING }));
    const issued = invoiceCandidate(invoice());

    expect(owed.type).toBe(issued.type);
    expect(owed.dueDate).toEqual(issued.dueDate);
    expect(owed.metadata['direction']).toBe(InvoiceDirection.INCOMING);
  });
});

describe('creditLineCandidate', () => {
  it('reminds against the account the instalment comes off', () => {
    const candidate = creditLineCandidate(creditLine());

    expect(candidate.type).toBe(NotificationType.LOAN_INSTALLMENT_DUE);
    expect(candidate.relatedEntityType).toBe('creditLine');
    expect(candidate.metadata).toMatchObject({
      accountName: 'НЛБ 8890',
      amount: '12000.00',
      bankAccountId: 'acc-1',
    });
  });
});

describe('paydayCandidate', () => {
  it('resolves the next payday from the configured day', () => {
    const candidate = paydayCandidate({ id: 'co-1', paydayDayOfMonth: 25 }, at('2026-09-15'));

    expect(candidate?.type).toBe(NotificationType.EMPLOYEE_PAYDAY);
    expect(candidate?.entityId).toBe('co-1');
    expect(candidate?.metadata['paydayDate']).toBe('2026-09-25');
  });

  // Guessing a payday would be worse than staying quiet about it.
  it('produces nothing for a company that has not set a payday', () => {
    expect(paydayCandidate({ id: 'co-1', paydayDayOfMonth: null }, at('2026-09-15'))).toBeNull();
  });
});

describe('collectDueReminders', () => {
  it('keeps only what falls on a reminder day', () => {
    const now = at('2026-09-15');
    const candidates = [
      invoiceCandidate(invoice({ id: 'in-3-days', dueDate: at('2026-09-18') })),
      invoiceCandidate(invoice({ id: 'in-2-days', dueDate: at('2026-09-17') })),
      invoiceCandidate(invoice({ id: 'tomorrow', dueDate: at('2026-09-16') })),
      invoiceCandidate(invoice({ id: 'today', dueDate: at('2026-09-15') })),
      invoiceCandidate(invoice({ id: 'yesterday', dueDate: at('2026-09-14') })),
    ];

    expect(collectDueReminders(candidates, now).map((r) => r.entityId)).toEqual([
      'in-3-days',
      'tomorrow',
      'today',
    ]);
  });

  it('stamps each reminder with how far out it is', () => {
    const [reminder] = collectDueReminders(
      [invoiceCandidate(invoice({ dueDate: at('2026-09-18') }))],
      at('2026-09-15'),
    );

    expect(reminder?.daysAway).toBe(3);
    expect(reminder?.metadata).toMatchObject({ daysAway: 3, dueDate: '2026-09-18' });
  });

  it('gives each reminder a key that identifies the event, not the run', () => {
    const candidates = [invoiceCandidate(invoice({ dueDate: at('2026-09-18') }))];

    // Two runs on the same day produce the same key, so the second writes
    // nothing; the day after produces a different one, so the 1-day-out
    // reminder still lands.
    const morning = collectDueReminders(candidates, at('2026-09-15', 7));
    const evening = collectDueReminders(candidates, at('2026-09-15', 21));
    expect(morning[0]?.dedupeKey).toBe(evening[0]?.dedupeKey);

    const dayBefore = collectDueReminders(candidates, at('2026-09-17'));
    expect(dayBefore[0]?.dedupeKey).not.toBe(morning[0]?.dedupeKey);
  });

  it('handles the three sources together in one pass', () => {
    const now = at('2026-09-15');
    const payday = paydayCandidate({ id: 'co-1', paydayDayOfMonth: 16 }, now);

    const reminders = collectDueReminders(
      [
        invoiceCandidate(invoice({ dueDate: at('2026-09-15') })),
        creditLineCandidate(creditLine({ nextPaymentDate: at('2026-09-16') })),
        ...(payday ? [payday] : []),
      ],
      now,
    );

    expect(reminders.map((r) => r.type)).toEqual([
      NotificationType.INVOICE_DUE,
      NotificationType.LOAN_INSTALLMENT_DUE,
      NotificationType.EMPLOYEE_PAYDAY,
    ]);
  });

  it('honours a cadence passed in, so one source can differ later', () => {
    const reminders = collectDueReminders(
      [creditLineCandidate(creditLine({ nextPaymentDate: at('2026-09-22') }))],
      at('2026-09-15'),
      [7, 1],
    );

    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.daysAway).toBe(7);
  });

  it('returns nothing when nothing is due', () => {
    expect(collectDueReminders([], at('2026-09-15'))).toEqual([]);
  });
});
