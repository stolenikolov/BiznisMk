import { useCallback, useEffect, useState } from 'react';
import { api } from './api.ts';

export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED';

/** OUTGOING: we issued it and expect to be paid. INCOMING: a bill we owe. */
export type InvoiceDirection = 'OUTGOING' | 'INCOMING';

export interface InvoiceSummary {
  id: string;
  direction: InvoiceDirection;
  invoiceNumber: string;
  clientName: string;
  status: InvoiceStatus;
  currency: string;
  netAmount: string;
  vatAmount: string;
  totalAmount: string;
  issueDate: string;
  dueDate: string | null;
  overdue: boolean;
  /** Which account the money moved on once it was marked paid. */
  settledAccountId: string | null;
  settledAt: string | null;
}

export interface InvoiceLine {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  vatRate: string | null;
  netAmount: string;
}

export interface VatBreakdownEntry {
  rate: string;
  base: string;
  amount: string;
}

export interface InvoiceIssuer {
  legalName: string;
  registeredAddress: string;
  embs: string;
  edb: string;
  isVatPayer: boolean;
  vatExemptNote: string | null;
}

export interface InvoiceDetail extends InvoiceSummary {
  clientAddress: string;
  clientEdb: string | null;
  notes: string | null;
  vatApplied: boolean;
  lines: InvoiceLine[];
  vatBreakdown: VatBreakdownEntry[];
  issuer: InvoiceIssuer;
}

export interface InvoiceTotalsPreview {
  net: string;
  vatApplied: boolean;
  vatBreakdown: VatBreakdownEntry[];
  vatTotal: string;
  total: string;
}

/**
 * Which status buttons a given invoice offers. Mirrors the backend's
 * transition table — the server is still the authority, this only decides
 * what to render.
 */
const NEXT_STATUSES: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: ['SENT', 'CANCELLED'],
  SENT: ['PAID', 'CANCELLED'],
  OVERDUE: ['PAID', 'CANCELLED'],
  PAID: [],
  CANCELLED: [],
};

export function nextStatuses(status: InvoiceStatus): InvoiceStatus[] {
  return NEXT_STATUSES[status];
}

/** Maps a status onto the badge colour vocabulary. */
export function statusBadgeClass(invoice: { status: InvoiceStatus; overdue: boolean }): string {
  if (invoice.overdue || invoice.status === 'OVERDUE') return 'badge badge-red';
  if (invoice.status === 'PAID') return 'badge badge-green';
  if (invoice.status === 'SENT') return 'badge badge-violet';
  return 'badge';
}

export function useInvoices() {
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ invoices: InvoiceSummary[] }>('/invoices');
      setInvoices(data.invoices);
    } catch {
      setInvoices([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { invoices, isLoading, reload: load };
}

export function useInvoice(invoiceId: string | undefined) {
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!invoiceId) return;
    try {
      const { data } = await api.get<{ invoice: InvoiceDetail }>(`/invoices/${invoiceId}`);
      setInvoice(data.invoice);
    } catch {
      setInvoice(null);
    } finally {
      setIsLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { invoice, isLoading, reload: load };
}
