import { describe, expect, it } from 'vitest';
import { InvoiceStatus } from '../generated/prisma/enums.js';
import { allowedTransitionsFrom, canTransition, isOverdue } from './invoice-status.js';

describe('canTransition', () => {
  it('lets a draft be sent or cancelled', () => {
    expect(canTransition(InvoiceStatus.DRAFT, InvoiceStatus.SENT)).toBe(true);
    expect(canTransition(InvoiceStatus.DRAFT, InvoiceStatus.CANCELLED)).toBe(true);
  });

  it('refuses to mark a draft paid before it has been sent', () => {
    expect(canTransition(InvoiceStatus.DRAFT, InvoiceStatus.PAID)).toBe(false);
  });

  it('lets a sent invoice be paid, go overdue, or be cancelled', () => {
    expect(canTransition(InvoiceStatus.SENT, InvoiceStatus.PAID)).toBe(true);
    expect(canTransition(InvoiceStatus.SENT, InvoiceStatus.OVERDUE)).toBe(true);
    expect(canTransition(InvoiceStatus.SENT, InvoiceStatus.CANCELLED)).toBe(true);
  });

  it('lets an overdue invoice still be paid', () => {
    expect(canTransition(InvoiceStatus.OVERDUE, InvoiceStatus.PAID)).toBe(true);
  });

  // A settled or voided invoice is a closed document — corrections are made by
  // issuing a new one, never by reopening the old one.
  it('treats paid and cancelled as terminal', () => {
    expect(allowedTransitionsFrom(InvoiceStatus.PAID)).toEqual([]);
    expect(allowedTransitionsFrom(InvoiceStatus.CANCELLED)).toEqual([]);
    expect(canTransition(InvoiceStatus.PAID, InvoiceStatus.SENT)).toBe(false);
    expect(canTransition(InvoiceStatus.CANCELLED, InvoiceStatus.DRAFT)).toBe(false);
  });

  it('refuses a no-op transition to the same status', () => {
    expect(canTransition(InvoiceStatus.SENT, InvoiceStatus.SENT)).toBe(false);
  });
});

describe('isOverdue', () => {
  const now = new Date('2026-09-14T12:00:00Z');

  it('flags a sent invoice whose due date has passed', () => {
    expect(isOverdue({ status: InvoiceStatus.SENT, dueDate: new Date('2026-09-01') }, now)).toBe(true);
  });

  it('leaves a sent invoice alone while it is still within term', () => {
    expect(isOverdue({ status: InvoiceStatus.SENT, dueDate: new Date('2026-10-01') }, now)).toBe(false);
  });

  it('never flags an invoice that carries no due date', () => {
    expect(isOverdue({ status: InvoiceStatus.SENT, dueDate: null }, now)).toBe(false);
  });

  it('ignores invoices that are not in the sent state', () => {
    expect(isOverdue({ status: InvoiceStatus.DRAFT, dueDate: new Date('2026-01-01') }, now)).toBe(false);
    expect(isOverdue({ status: InvoiceStatus.PAID, dueDate: new Date('2026-01-01') }, now)).toBe(false);
  });
});
