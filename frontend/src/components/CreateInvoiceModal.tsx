import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { api } from '../lib/api.ts';
import { Modal } from './Modal.tsx';
import { formatAmount } from '../lib/useBankAccounts.ts';
import type { InvoiceTotalsPreview } from '../lib/useInvoices.ts';

interface LineDraft {
  description: string;
  quantity: string;
  unitPrice: string;
  vatRate: string;
}

const emptyLine = (): LineDraft => ({ description: '', quantity: '1', unitPrice: '', vatRate: '' });

function extractErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const message = err.response?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
    return err.message;
  }
  return 'Unknown error';
}

/** A line is priceable once it has both numbers; description can come later. */
function isPriceable(line: LineDraft): boolean {
  return /^\d+(\.\d+)?$/.test(line.quantity.trim()) && /^\d+(\.\d+)?$/.test(line.unitPrice.trim());
}

interface Props {
  onClose: () => void;
  onCreated: (invoiceId: string) => void;
}

export function CreateInvoiceModal({ onClose, onCreated }: Props) {
  const { t, i18n } = useTranslation();
  const [direction, setDirection] = useState<'OUTGOING' | 'INCOMING'>('OUTGOING');
  const [supplierNumber, setSupplierNumber] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [clientEdb, setClientEdb] = useState('');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [totals, setTotals] = useState<InvoiceTotalsPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const updateLine = (index: number, patch: Partial<LineDraft>) => {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const removeLine = (index: number) => {
    setLines((current) => (current.length === 1 ? current : current.filter((_, i) => i !== index)));
  };

  /**
   * Only the figures drive pricing, so the key deliberately leaves out the
   * descriptions: typing a line's text must not re-request totals that cannot
   * have changed.
   */
  const pricingKey = JSON.stringify(
    lines
      .filter(isPriceable)
      .map((line) => [line.quantity.trim(), line.unitPrice.trim(), line.vatRate.trim()]),
  );

  // Totals come from the server so the VAT rules live in exactly one place —
  // the same function that will freeze them onto the issued document.
  useEffect(() => {
    const priced = JSON.parse(pricingKey) as [string, string, string][];
    if (priced.length === 0) {
      setTotals(null);
      return;
    }

    let cancelled = false;
    const payload = {
      lines: priced.map(([quantity, unitPrice, vatRate]) => ({
        // The preview only prices the lines; descriptions are validated on
        // the real submit, so a placeholder keeps this request valid.
        description: '—',
        quantity,
        unitPrice,
        ...(vatRate ? { vatRate } : {}),
      })),
    };

    const timer = setTimeout(() => {
      api
        .post<InvoiceTotalsPreview>('/invoices/preview', payload)
        .then(({ data }) => {
          if (!cancelled) setTotals(data);
        })
        .catch(() => {
          if (!cancelled) setTotals(null);
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pricingKey]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSaving(true);

    try {
      const { data } = await api.post<{ invoice: { id: string } }>('/invoices', {
        direction,
        // Our own invoices are numbered by the backend; a supplier bill keeps
        // the number printed on it.
        ...(direction === 'INCOMING' ? { invoiceNumber: supplierNumber.trim() } : {}),
        clientName: clientName.trim(),
        clientAddress: clientAddress.trim(),
        ...(clientEdb.trim() ? { clientEdb: clientEdb.trim() } : {}),
        issueDate,
        ...(dueDate ? { dueDate } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        lines: lines.map((line) => ({
          description: line.description.trim(),
          quantity: line.quantity.trim(),
          unitPrice: line.unitPrice.trim(),
          ...(line.vatRate.trim() ? { vatRate: line.vatRate.trim() } : {}),
        })),
      });
      onCreated(data.invoice.id);
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} labelledBy="create-invoice-title" wide>
      <h2 id="create-invoice-title" className="modal-title">
        {t('invoices.createTitle')}
      </h2>

      <form onSubmit={handleSubmit}>
        <fieldset className="field-choice">
          <legend>{t('invoices.direction')}</legend>
          <div className="choice-options">
            {(['OUTGOING', 'INCOMING'] as const).map((option) => (
              <label key={option} className={direction === option ? 'is-selected' : ''}>
                <input
                  type="radio"
                  name="direction"
                  value={option}
                  checked={direction === option}
                  onChange={() => setDirection(option)}
                />
                {t('invoices.directions.' + option)}
              </label>
            ))}
          </div>
          <p className="field-hint">{t('invoices.directionHint.' + direction)}</p>
        </fieldset>

        {direction === 'INCOMING' && (
          <label>
            {t('invoices.supplierNumber')}
            <input
              value={supplierNumber}
              onChange={(e) => setSupplierNumber(e.target.value)}
              required
              placeholder="0042/2026"
            />
          </label>
        )}

        <div className="form-row">
          <label>
            {t('invoices.clientName')}
            <input value={clientName} onChange={(e) => setClientName(e.target.value)} required autoFocus />
          </label>
          <label>
            {t('invoices.clientEdb')}
            <input
              value={clientEdb}
              onChange={(e) => setClientEdb(e.target.value)}
              inputMode="numeric"
              placeholder={t('invoices.clientEdbOptional')}
            />
          </label>
        </div>

        <label>
          {t('invoices.clientAddress')}
          <input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} required />
        </label>

        <div className="form-row">
          <label>
            {t('invoices.issueDate')}
            <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required />
          </label>
          <label>
            {t('invoices.dueDate')}
            <input type="date" value={dueDate} min={issueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
        </div>

        <div className="form-section">
          <span className="label-caps">{t('invoices.lines')}</span>

          {lines.map((line, index) => (
            <div className="invoice-line-row" key={index}>
              <label className="invoice-line-description">
                {t('invoices.lineDescription')}
                <input
                  value={line.description}
                  onChange={(e) => updateLine(index, { description: e.target.value })}
                  required
                />
              </label>
              <label className="invoice-line-number">
                {t('invoices.quantity')}
                <input
                  value={line.quantity}
                  onChange={(e) => updateLine(index, { quantity: e.target.value })}
                  inputMode="decimal"
                  required
                />
              </label>
              <label className="invoice-line-number">
                {t('invoices.unitPrice')}
                <input
                  value={line.unitPrice}
                  onChange={(e) => updateLine(index, { unitPrice: e.target.value })}
                  inputMode="decimal"
                  required
                />
              </label>
              <label className="invoice-line-number">
                {t('invoices.vatRate')}
                <input
                  value={line.vatRate}
                  onChange={(e) => updateLine(index, { vatRate: e.target.value })}
                  inputMode="decimal"
                  placeholder={t('invoices.vatRateDefault')}
                  disabled={totals ? !totals.vatApplied : false}
                />
              </label>
              <button
                type="button"
                className="invoice-line-remove"
                onClick={() => removeLine(index)}
                disabled={lines.length === 1}
                aria-label={t('invoices.removeLine')}
              >
                ×
              </button>
            </div>
          ))}

          <button type="button" className="btn-ghost" onClick={() => setLines((c) => [...c, emptyLine()])}>
            {t('invoices.addLine')}
          </button>
        </div>

        <label>
          {t('invoices.notes')}
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </label>

        {totals && (
          <div className="invoice-totals">
            <div className="invoice-totals-row">
              <span>{t('invoices.net')}</span>
              <span className="num">{formatAmount(totals.net, i18n.language)}</span>
            </div>

            {/* A non-VAT-payer shows no VAT rows at all — not a 0% row. */}
            {totals.vatApplied &&
              totals.vatBreakdown.map((entry) => (
                <div className="invoice-totals-row" key={entry.rate}>
                  <span>{t('invoices.vatAt', { rate: entry.rate.replace(/\.00$/, '') })}</span>
                  <span className="num">{formatAmount(entry.amount, i18n.language)}</span>
                </div>
              ))}

            {!totals.vatApplied && <span className="field-hint">{t('invoices.noVat')}</span>}

            <div className="invoice-totals-row invoice-totals-row--total">
              <span>{t('invoices.total')}</span>
              <span className="num">{formatAmount(totals.total, i18n.language)}</span>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary" disabled={isSaving}>
          {isSaving ? t('invoices.saving') : t('invoices.save')}
        </button>
      </form>
    </Modal>
  );
}
