/**
 * Turning things that fall due into the reminders worth sending today.
 *
 * Pure: the daily job reads rows out of the database, hands them here, and
 * writes back whatever comes out. Nothing in this file knows about Prisma, so
 * the rule deciding who gets interrupted and when is testable on its own.
 */

import { NotificationType } from '../generated/prisma/enums.js';
import type { InvoiceDirection } from '../generated/prisma/enums.js';
import {
  REMINDER_OFFSET_DAYS,
  isoDate,
  nextPayday,
  reminderDedupeKey,
  remindersFor,
} from './notification-schedule.js';

/** Something with a date attached that somebody should be warned about. */
export interface DueCandidate {
  companyId: string;
  type: NotificationType;
  /** The source record, which is also what the dedupe key is built from. */
  entityId: string;
  relatedEntityType: string;
  dueDate: Date;
  /** Facts for the copy and the UI, minus the timing this file works out. */
  metadata: Record<string, unknown>;
}

/** A candidate that falls on one of today's reminder days. */
export interface DueReminder extends DueCandidate {
  daysAway: number;
  dedupeKey: string;
}

/**
 * An invoice that falls due, whichever side of the trade it came from.
 *
 * Today every row is an invoice created in this app, and `direction` is what
 * separates one we issued from a supplier bill we owe. When invoices start
 * arriving from another company on the platform they will land as ordinary
 * invoice rows with a due date, and reach this function unchanged — which is
 * the reason the reminder keys off the due date and not off who typed it in.
 */
export interface DueInvoice {
  id: string;
  companyId: string;
  direction: InvoiceDirection;
  invoiceNumber: string;
  /** The other party: our client on one we issued, the supplier on a bill. */
  clientName: string;
  totalAmount: string;
  currency: string;
  dueDate: Date;
}

export interface DueCreditLine {
  id: string;
  companyId: string;
  bankAccountId: string;
  /** How the account is named in the UI, e.g. "Комерцијална банка 4471". */
  accountName: string;
  installmentAmount: string;
  currency: string;
  installmentsPaid: number;
  totalInstallments: number;
  nextPaymentDate: Date;
}

export interface PayingCompany {
  id: string;
  paydayDayOfMonth: number | null;
}

export function invoiceCandidate(invoice: DueInvoice): DueCandidate {
  return {
    companyId: invoice.companyId,
    type: NotificationType.INVOICE_DUE,
    entityId: invoice.id,
    relatedEntityType: 'invoice',
    dueDate: invoice.dueDate,
    metadata: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      // Named for what it is rather than for our side of it: on a bill we owe,
      // "client" would be backwards.
      counterpartyName: invoice.clientName,
      direction: invoice.direction,
      amount: invoice.totalAmount,
      currency: invoice.currency,
    },
  };
}

export function creditLineCandidate(creditLine: DueCreditLine): DueCandidate {
  return {
    companyId: creditLine.companyId,
    type: NotificationType.LOAN_INSTALLMENT_DUE,
    entityId: creditLine.id,
    relatedEntityType: 'creditLine',
    dueDate: creditLine.nextPaymentDate,
    metadata: {
      creditLineId: creditLine.id,
      bankAccountId: creditLine.bankAccountId,
      accountName: creditLine.accountName,
      amount: creditLine.installmentAmount,
      currency: creditLine.currency,
      installmentsPaid: creditLine.installmentsPaid,
      totalInstallments: creditLine.totalInstallments,
    },
  };
}

/**
 * The company's next payday, or null when it has not configured one — in which
 * case it gets no payday reminders at all, rather than reminders on a date
 * nobody chose.
 */
export function paydayCandidate(company: PayingCompany, now: Date): DueCandidate | null {
  if (company.paydayDayOfMonth === null) return null;

  const payday = nextPayday(company.paydayDayOfMonth, now);

  return {
    companyId: company.id,
    type: NotificationType.EMPLOYEE_PAYDAY,
    // The company itself is the entity: there is one payday per company per
    // cycle, however many people are on the payroll.
    entityId: company.id,
    relatedEntityType: 'company',
    dueDate: payday,
    metadata: { paydayDate: isoDate(payday) },
  };
}

/**
 * Keeps the candidates that fall on one of today's reminder days, stamping
 * each with how far out it is and the key that stops it being sent twice.
 */
export function collectDueReminders(
  candidates: readonly DueCandidate[],
  now: Date,
  offsets: readonly number[] = REMINDER_OFFSET_DAYS,
): DueReminder[] {
  const reminders: DueReminder[] = [];

  for (const candidate of candidates) {
    const daysAway = remindersFor(candidate.dueDate, now, offsets);
    if (daysAway === null) continue;

    reminders.push({
      ...candidate,
      daysAway,
      dedupeKey: reminderDedupeKey(candidate.type, candidate.entityId, candidate.dueDate, daysAway),
      metadata: {
        ...candidate.metadata,
        dueDate: isoDate(candidate.dueDate),
        daysAway,
      },
    });
  }

  return reminders;
}
