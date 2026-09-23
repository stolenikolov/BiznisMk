import { InvoiceStatus } from '../generated/prisma/enums.js';

/**
 * Which status an invoice may move to next.
 *
 * PAID and CANCELLED are terminal: a settled or voided invoice is a closed
 * document, and correcting one is done by issuing a new invoice rather than by
 * editing the old one back to life.
 */
const ALLOWED_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  [InvoiceStatus.DRAFT]: [InvoiceStatus.SENT, InvoiceStatus.CANCELLED],
  [InvoiceStatus.SENT]: [InvoiceStatus.PAID, InvoiceStatus.OVERDUE, InvoiceStatus.CANCELLED],
  [InvoiceStatus.OVERDUE]: [InvoiceStatus.PAID, InvoiceStatus.CANCELLED],
  [InvoiceStatus.PAID]: [],
  [InvoiceStatus.CANCELLED]: [],
};

export function allowedTransitionsFrom(status: InvoiceStatus): InvoiceStatus[] {
  return ALLOWED_TRANSITIONS[status];
}

export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Whether a SENT invoice has fallen past its due date. Due dates are optional,
 * and an invoice with none can never go overdue.
 */
export function isOverdue(
  invoice: { status: InvoiceStatus; dueDate: Date | null },
  now: Date,
): boolean {
  if (invoice.status !== InvoiceStatus.SENT || !invoice.dueDate) return false;
  return invoice.dueDate.getTime() < now.getTime();
}
