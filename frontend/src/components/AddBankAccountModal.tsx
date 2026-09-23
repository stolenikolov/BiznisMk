import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { api } from '../lib/api.ts';
import { Modal } from './Modal.tsx';
import { MACEDONIAN_BANKS, OTHER_BANK } from '../lib/macedonianBanks.ts';

const CURRENCIES = ['MKD', 'EUR', 'USD'] as const;

/** The bank's refusals, in the reader's language; anything else as the server put it. */
const ERROR_KEYS: Record<string, string> = {
  ACCOUNT_LINKED_ELSEWHERE: 'accounts.linkedElsewhere',
  BANK_ACCOUNT_NOT_FOUND: 'accounts.bankNoSuchAccount',
  BANK_ACCOUNT_CLOSED: 'accounts.bankAccountClosed',
  BANK_UNREACHABLE: 'accounts.bankUnavailable',
  BANK_NOT_CONFIGURED: 'accounts.bankUnavailable',
  BANK_BAD_RESPONSE: 'accounts.bankUnavailable',
};

function extractErrorMessage(err: unknown, t: (key: string) => string): string {
  if (axios.isAxiosError(err)) {
    const key = ERROR_KEYS[err.response?.data?.errorCode as string];
    if (key) return t(key);
    const message = err.response?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
    return err.message;
  }
  return 'Unknown error';
}

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export function AddBankAccountModal({ onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const [selectedBank, setSelectedBank] = useState('');
  const [customBank, setCustomBank] = useState('');
  const [iban, setIban] = useState('');
  const [currency, setCurrency] = useState<string>('MKD');
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<'idle' | 'verifying' | 'saving'>('idle');

  const isOther = selectedBank === OTHER_BANK;
  const bankName = isOther ? customBank.trim() : selectedBank;
  const isSubmitting = stage !== 'idle';

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    // The API rejects spaces; IBANs are usually written in groups of four.
    const normalizedIban = iban.replace(/\s+/g, '').toUpperCase();

    try {
      setStage('verifying');
      const { data: check } = await api.post<{
        verified: boolean;
        hasSufficientFunds: boolean;
        mockBalance: string;
      }>('/bank-integration/check-account', { bankName, iban: normalizedIban });

      if (!check.verified) {
        setError(t('accounts.verifyFailed'));
        return;
      }
      if (!check.hasSufficientFunds) {
        setError(t('accounts.verifyNoFunds'));
        return;
      }

      setStage('saving');
      await api.post('/bank-accounts', {
        bankName,
        iban: normalizedIban,
        currency,
        // The bank is the authority on what is actually on the account.
        balance: check.mockBalance,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err, t));
    } finally {
      setStage('idle');
    }
  };

  return (
    <Modal onClose={onClose} labelledBy="add-account-title">
      <h2 id="add-account-title" className="modal-title">
        {t('accounts.addTitle')}
      </h2>
      <form onSubmit={handleSubmit}>
        <label>
          {t('accounts.bankName')}
          <select value={selectedBank} onChange={(e) => setSelectedBank(e.target.value)} required autoFocus>
            <option value="" disabled>
              {t('accounts.bankPlaceholder')}
            </option>
            {MACEDONIAN_BANKS.map((bank) => (
              <option key={bank} value={bank}>
                {bank}
              </option>
            ))}
            <option value={OTHER_BANK}>{t('accounts.bankOther')}</option>
          </select>
        </label>

        {isOther && (
          <label>
            {t('accounts.bankOtherName')}
            <input value={customBank} onChange={(e) => setCustomBank(e.target.value)} required autoFocus />
          </label>
        )}
        <label>
          {t('accounts.iban')}
          <input
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            placeholder="MK07 2501 2000 0058 984"
            required
          />
        </label>
        <label>
          {t('accounts.currency')}
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} required>
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>

        {/* No manual balance field: the bank check is what reports it. */}
        <span className="field-hint">{t('accounts.balanceFromBank')}</span>

        {stage === 'verifying' && (
          <p className="verify-status" role="status">
            {t('accounts.verifying')}
          </p>
        )}

        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {stage === 'verifying'
            ? t('accounts.verifying')
            : stage === 'saving'
              ? t('accounts.saving')
              : t('accounts.save')}
        </button>
      </form>
    </Modal>
  );
}
