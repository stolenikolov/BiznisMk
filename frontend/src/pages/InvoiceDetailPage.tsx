import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import { api } from '../lib/api.ts';
import { formatAmount, maskAccount, useBankAccounts } from '../lib/useBankAccounts.ts';
import { nextStatuses, statusBadgeClass, useInvoice, type InvoiceStatus } from '../lib/useInvoices.ts';

export function InvoiceDetailPage() {
  const { t, i18n } = useTranslation();
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const { invoice, isLoading, reload } = useInvoice(invoiceId);
  const { accounts } = useBankAccounts();
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changeStatus = async (status: InvoiceStatus) => {
    if (!invoice) return;
    setIsUpdating(true);
    setError(null);
    try {
      await api.patch(`/invoices/${invoice.id}/status`, { status });
      await reload();
    } catch (err) {
      const data = axios.isAxiosError(err) ? err.response?.data : undefined;
      if (data?.errorCode === 'INVOICE_CHANGED') {
        setError(t('invoices.changedMeanwhile'));
        await reload();
      } else {
        setError(typeof data?.message === 'string' ? data.message : t('common.error'));
      }
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return <p className="dashboard-placeholder">{t('common.loading')}</p>;
  }

  if (!invoice) {
    return (
      <section>
        <h1 className="page-title">{t('invoices.notFound')}</h1>
        <Link to="/invoices" className="link-arrow">
          {t('invoices.backToList')}
        </Link>
      </section>
    );
  }

  const transitions = nextStatuses(invoice.overdue ? 'OVERDUE' : invoice.status);
  // Where the money actually moved, once it did.
  const settledAccount = accounts.find((account) => account.id === invoice.settledAccountId);

  return (
    <section className="invoice-detail">
      <Link to="/invoices" className="link-arrow">
        {t('invoices.backToList')}
      </Link>

      <div className="page-header">
        <div>
          <h1 className="page-title num">{invoice.invoiceNumber}</h1>
          <span className="badge">{t(`invoices.directions.${invoice.direction}`)}</span>
          <span className={statusBadgeClass(invoice)}>
            {t(`invoices.statuses.${invoice.overdue ? 'OVERDUE' : invoice.status}`)}
          </span>
          {invoice.settledAt && (
            <p className="invoice-settled">
              {settledAccount
                ? t('invoices.settledOn', {
                    bank: settledAccount.bankName,
                    account: maskAccount(settledAccount.iban),
                  })
                : t('invoices.settledOnUnknown')}{' '}
              <span className="num">{invoice.settledAt}</span>
            </p>
          )}
        </div>

        <div className="invoice-actions">
          <button type="button" className="btn-ghost" onClick={() => window.print()}>
            {t('invoices.print')}
          </button>
          {transitions.length > 0 && (
            <>
            {transitions.map((status) => (
              <button
                key={status}
                type="button"
                className={status === 'CANCELLED' ? 'btn-quiet' : 'btn-primary'}
                onClick={() => void changeStatus(status)}
                disabled={isUpdating}
              >
                {t(`invoices.actions.${status}`)}
              </button>
            ))}
            </>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}

      {/* Issuer and client blocks are the legal header of the document, so the
          Macedonian identifiers are labelled as they appear on paper. */}
      <div className="card invoice-parties">
        <div>
          <span className="label-caps">{t('invoices.issuer')}</span>
          <p className="invoice-party-name">{invoice.issuer.legalName}</p>
          <p>{invoice.issuer.registeredAddress}</p>
          <p className="num">
            ЕМБС {invoice.issuer.embs} · ЕДБ {invoice.issuer.edb}
          </p>
          {invoice.issuer.vatExemptNote && (
            <p className="invoice-vat-note">{invoice.issuer.vatExemptNote}</p>
          )}
        </div>

        <div>
          <span className="label-caps">{t('invoices.client')}</span>
          <p className="invoice-party-name">{invoice.clientName}</p>
          <p>{invoice.clientAddress}</p>
          {invoice.clientEdb && <p className="num">ЕДБ {invoice.clientEdb}</p>}
        </div>

        <div>
          <span className="label-caps">{t('invoices.dates')}</span>
          <p>
            {t('invoices.issueDate')}: <span className="num">{invoice.issueDate}</span>
          </p>
          <p>
            {t('invoices.dueDate')}: <span className="num">{invoice.dueDate ?? '—'}</span>
          </p>
        </div>
      </div>

      <div className="card">
        <table className="table invoice-table">
          <thead>
            <tr>
              <th>{t('invoices.lineDescription')}</th>
              <th className="num">{t('invoices.quantity')}</th>
              <th className="num">{t('invoices.unitPrice')}</th>
              {invoice.vatApplied && <th className="num">{t('invoices.vatRate')}</th>}
              <th className="num">{t('invoices.net')}</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={line.id}>
                <td>{line.description}</td>
                <td className="num">{line.quantity.replace(/\.?0+$/, '')}</td>
                <td className="num">{formatAmount(line.unitPrice, i18n.language)}</td>
                {invoice.vatApplied && (
                  <td className="num">{line.vatRate?.replace(/\.00$/, '')}%</td>
                )}
                <td className="num">{formatAmount(line.netAmount, i18n.language)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="invoice-totals">
          <div className="invoice-totals-row">
            <span>{t('invoices.net')}</span>
            <span className="num">{formatAmount(invoice.netAmount, i18n.language)}</span>
          </div>

          {invoice.vatBreakdown.map((entry) => (
            <div className="invoice-totals-row" key={entry.rate}>
              <span>{t('invoices.vatAt', { rate: entry.rate.replace(/\.00$/, '') })}</span>
              <span className="num">{formatAmount(entry.amount, i18n.language)}</span>
            </div>
          ))}

          <div className="invoice-totals-row invoice-totals-row--total">
            <span>{t('invoices.total')}</span>
            <span className="num">
              {formatAmount(invoice.totalAmount, i18n.language, invoice.currency)} {invoice.currency}
            </span>
          </div>
        </div>
      </div>

      {invoice.notes && (
        <div className="card">
          <span className="label-caps">{t('invoices.notes')}</span>
          <p>{invoice.notes}</p>
        </div>
      )}
    </section>
  );
}
