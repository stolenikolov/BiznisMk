import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { formatAmount } from '../lib/useBankAccounts.ts';
import { statusBadgeClass, useInvoices } from '../lib/useInvoices.ts';
import { CreateInvoiceModal } from '../components/CreateInvoiceModal.tsx';
import { InvoiceIcon } from '../components/icons.tsx';

export function InvoicesPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { invoices, isLoading, reload } = useInvoices();
  const [isCreating, setIsCreating] = useState(false);

  // What a CEO actually watches, and the two are opposite pockets: money owed
  // to the company against money it owes. Draft and cancelled invoices are
  // neither. Unpaid means sent or overdue.
  const unpaid = (direction: 'OUTGOING' | 'INCOMING') =>
    invoices
      .filter(
        (invoice) =>
          invoice.direction === direction &&
          (invoice.status === 'SENT' || invoice.status === 'OVERDUE'),
      )
      .reduce((sum, invoice) => sum + Number(invoice.totalAmount), 0);

  const receivable = unpaid('OUTGOING');
  const payable = unpaid('INCOMING');

  return (
    <section className="invoices-page">
      <div className="page-header">
        <h1 className="page-title">{t('nav.invoices')}</h1>
        <button type="button" className="btn-primary" onClick={() => setIsCreating(true)}>
          {t('invoices.createCta')}
        </button>
      </div>

      {!isLoading && invoices.length > 0 && (
        <div className="invoice-summary-strip">
          <div className="kpi-block">
            <span className="kpi-label label-caps">{t('invoices.outstanding')}</span>
            <span className="kpi-value num">{formatAmount(receivable.toFixed(2), i18n.language)}</span>
          </div>
          <div className="kpi-block">
            <span className="kpi-label label-caps">{t('invoices.payable')}</span>
            <span className="kpi-value num">{formatAmount(payable.toFixed(2), i18n.language)}</span>
          </div>
          <div className="kpi-block">
            <span className="kpi-label label-caps">{t('invoices.issuedCount')}</span>
            <span className="kpi-value num">{invoices.length}</span>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="dashboard-placeholder">{t('common.loading')}</p>
      ) : invoices.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <span className="empty-state-icon">
              <InvoiceIcon />
            </span>
            <p>{t('invoices.empty')}</p>
            <button type="button" className="btn-ghost" onClick={() => setIsCreating(true)}>
              {t('invoices.createCta')}
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="invoice-table-scroll">
            <table className="table invoice-table invoice-table--list">
            <thead>
              {/* Every header sits over its own column: dates and text to the
                  left, the one figure to the right, matching the cells below. */}
              <tr>
                <th>{t('invoices.number')}</th>
                <th>{t('invoices.direction')}</th>
                <th>{t('invoices.client')}</th>
                <th className="num cell-date">{t('invoices.issueDate')}</th>
                <th className="num cell-date">{t('invoices.dueDate')}</th>
                <th>{t('invoices.status')}</th>
                <th className="num">{t('invoices.total')}</th>
                <th className="cell-actions">
                  <span className="sr-only">{t('invoices.detailsColumn')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="cell-number">
                    <Link to={`/invoices/${invoice.id}`} className="num invoice-number-link">
                      {invoice.invoiceNumber}
                    </Link>
                  </td>
                  <td className="cell-direction">
                    {/* Which way the invoice points decides which way the money
                        moves when it is settled, so it is worth seeing in the list. */}
                    <span className="badge">{t(`invoices.directions.${invoice.direction}`)}</span>
                  </td>
                  <td className="cell-client">{invoice.clientName}</td>
                  <td className="num cell-date cell-issue">{invoice.issueDate}</td>
                  <td className="num cell-date cell-due" data-label={t('invoices.dueDate')}>
                    {invoice.dueDate ?? '—'}
                  </td>
                  <td className="cell-status">
                    <span className={statusBadgeClass(invoice)}>
                      {t(`invoices.statuses.${invoice.overdue ? 'OVERDUE' : invoice.status}`)}
                    </span>
                  </td>
                  <td className="num cell-total">
                    {formatAmount(invoice.totalAmount, i18n.language, invoice.currency)}{' '}
                    {invoice.currency}
                  </td>
                  <td className="cell-actions">
                    <Link to={`/invoices/${invoice.id}`} className="btn-quiet btn-row">
                      {t('invoices.details')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </div>
      )}

      {isCreating && (
        <CreateInvoiceModal
          onClose={() => setIsCreating(false)}
          onCreated={(id) => {
            void reload();
            navigate(`/invoices/${id}`);
          }}
        />
      )}
    </section>
  );
}
