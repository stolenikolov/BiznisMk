import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import axios from 'axios';
import { Modal } from './Modal.tsx';
import { formatAmount, maskAccount } from '../lib/money.ts';
import { STATUTORY_PREFIX, type PayrollQuote, type PayrollRunStatus, type StatutoryKind } from '../lib/usePayrollRun.ts';

interface Props {
  status: PayrollRunStatus;
  /** Prices the run at the bank. Nothing moves until `confirm`. */
  preview: () => Promise<PayrollQuote>;
  confirm: (requestId: string) => Promise<PayrollRunStatus>;
  onClose: () => void;
  /** Once the money is out: re-read the figures the page shows. */
  onPaid: () => void;
}

/** People nobody's balance could cover, as the bank names them. */
interface Uncovered {
  employeeName: string;
  amount: string;
}

/**
 * Paying a month's salaries, in the bank's own two steps: it prices the run
 * first — who gets paid from which account, and what is left on it — and only
 * a confirmation here moves anything.
 *
 * The figures shown are the bank's, not ours: it is the one that holds the
 * balances, so its plan is what the owner is agreeing to.
 */
export function PayPayrollModal({ status, preview, confirm, onClose, onPaid }: Props) {
  const { t, i18n } = useTranslation();
  const [quote, setQuote] = useState<PayrollQuote | null>(null);
  const [stage, setStage] = useState<'pricing' | 'ready' | 'paying' | 'paid'>('pricing');
  const [error, setError] = useState<string | null>(null);
  const [uncovered, setUncovered] = useState<Uncovered[]>([]);

  const money = (amount: string, currency = status.currency) =>
    formatAmount(amount, i18n.language, currency);

  /**
   * Pricing is a request the bank stores, so it happens exactly once per
   * opening — not once per render pass. Without this, StrictMode's double
   * invocation alone leaves a second priced run sitting at the bank, and a
   * language switch would leave a third.
   */
  const hasPriced = useRef(false);

  useEffect(() => {
    if (hasPriced.current) return;
    hasPriced.current = true;

    void (async () => {
      try {
        const priced = await preview();
        setQuote(priced);
        setStage('ready');
      } catch (err) {
        setError(explain(err, t));
        setUncovered(uncoveredFrom(err));
      }
    })();
  }, [preview, t]);

  const handleConfirm = async () => {
    if (!quote) return;
    setError(null);
    setStage('paying');

    try {
      await confirm(quote.requestId);
      setStage('paid');
      onPaid();
    } catch (err) {
      setError(explain(err, t));
      setUncovered(uncoveredFrom(err));
      setStage('ready');
    }
  };

  return (
    <Modal onClose={onClose} labelledBy="pay-payroll-title" wide>
      <span className="modal-eyebrow label-caps">{status.period}</span>
      <h2 id="pay-payroll-title" className="modal-title">
        {t('payroll.pay.title')}
      </h2>

      {stage === 'pricing' && <p className="dashboard-placeholder">{t('payroll.pay.pricing')}</p>}

      {stage === 'paid' && (
        <>
          <p className="payroll-paid" role="status">
            {t('payroll.pay.done', {
              total: money(status.total),
              net: money(status.netTotal),
              count: status.lines.length,
              statutory: money(status.statutoryTotal),
            })}
          </p>
          <p className="field-hint">{t('payroll.pay.doneHint')}</p>
          <div className="modal-actions">
            <button type="button" className="btn-primary" onClick={onClose}>
              {t('common.close')}
            </button>
          </div>
        </>
      )}

      {quote && stage !== 'paid' && (
        <>
          {/* The bank's own plan, line by line. Its two statutory lines are
              relabelled here so they read in the reader's language; the server
              names them for the statement the bank writes. */}
          <ul className="payroll-lines">
            {quote.allocation.map((entry) => {
              const kind = statutoryKind(entry.employeeId);

              return (
                <li key={entry.employeeId} className={kind ? 'is-statutory' : undefined}>
                  <span className="payroll-lines-name">
                    {kind ? t(`payroll.pay.statutory.${kind}`) : entry.employeeName}
                  </span>
                  <span className="payroll-lines-from num">{maskAccount(entry.iban)}</span>
                  <span className="payroll-lines-amount num">{money(entry.amount, quote.currency)}</span>
                </li>
              );
            })}
          </ul>

          {/* Where the gross went: to the people, and to the state. */}
          <p className="payroll-split">
            {t('payroll.pay.split', {
              net: money(status.netTotal),
              statutory: money(status.statutoryTotal),
            })}
          </p>

          {/* What the run leaves behind, which is the figure worth checking
              before agreeing to it. */}
          {quote.accountTotals.map((total) => (
            <p key={total.iban} className="payroll-account-total">
              {t('payroll.pay.accountAfter', {
                account: maskAccount(total.iban),
                debited: money(total.totalDebited, total.currency),
                after: money(total.balanceAfter, total.currency),
              })}
            </p>
          ))}

          {quote.ineligibleAccounts.length > 0 && (
            <p className="field-hint">
              {t('payroll.pay.skippedAccounts', {
                accounts: quote.ineligibleAccounts
                  .map((account) => maskAccount(account.iban))
                  .join(', '),
              })}
            </p>
          )}

          <p className="payroll-total">
            <span>{t('payroll.pay.total')}</span>
            <strong className="num">{money(status.total)}</strong>
          </p>
        </>
      )}

      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}

      {uncovered.length > 0 && (
        <ul className="payroll-uncovered">
          {uncovered.map((entry) => (
            <li key={entry.employeeName}>
              {entry.employeeName} — <span className="num">{money(entry.amount)}</span>
            </li>
          ))}
        </ul>
      )}

      {stage !== 'paid' && (
        <div className="modal-actions">
          <button type="button" className="btn-quiet" onClick={onClose} disabled={stage === 'paying'}>
            {t('payroll.pay.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void handleConfirm()}
            disabled={stage !== 'ready'}
          >
            {stage === 'paying' ? t('payroll.pay.paying') : t('payroll.pay.confirm')}
          </button>
        </div>
      )}
    </Modal>
  );
}

/**
 * The bank's refusal in the reader's language.
 *
 * The server passes the bank's `errorCode` through untouched, so each one that
 * has its own advice gets its own sentence, and anything else falls back to
 * the message rather than to nothing.
 */
function explain(err: unknown, t: TFunction): string {
  if (!axios.isAxiosError(err)) return t('payroll.pay.errors.UNKNOWN');

  const data = err.response?.data as { errorCode?: string; message?: string } | undefined;
  const code = data?.errorCode;

  if (code && KNOWN_CODES.has(code)) return t(`payroll.pay.errors.${code}`);
  if (typeof data?.message === 'string' && data.message) return data.message;
  return t('payroll.pay.errors.UNKNOWN');
}

const KNOWN_CODES = new Set([
  'INSUFFICIENT_FUNDS',
  'NO_ELIGIBLE_ACCOUNTS',
  'ACCOUNT_NOT_FOUND',
  'PAYROLL_ALREADY_PAID',
  'PAYROLL_REQUEST_NOT_FOUND',
  'PAYROLL_REQUEST_NOT_PENDING',
  'ACCOUNT_NOT_ACTIVE',
  'CURRENCY_MISMATCH',
  'BANK_NOT_CONFIGURED',
  'BANK_UNREACHABLE',
  'BANK_BAD_RESPONSE',
  'TAX_SETTINGS_MISSING',
]);

/** Null for a person, the charge's own name for one of the server's two lines. */
function statutoryKind(employeeId: string): StatutoryKind | null {
  if (!employeeId.startsWith(STATUTORY_PREFIX)) return null;

  const kind = employeeId.slice(STATUTORY_PREFIX.length);
  return kind === 'CONTRIBUTIONS' || kind === 'INCOME_TAX' ? kind : null;
}

function uncoveredFrom(err: unknown): Uncovered[] {
  if (!axios.isAxiosError(err)) return [];

  const uncovered = (err.response?.data as { uncovered?: unknown } | undefined)?.uncovered;
  if (!Array.isArray(uncovered)) return [];

  return uncovered
    .filter((entry): entry is { employeeName: string; amount: string } =>
      typeof entry === 'object' && entry !== null,
    )
    .map((entry) => ({
      employeeName: String(entry.employeeName ?? ''),
      amount: String(entry.amount ?? '0.00'),
    }));
}
