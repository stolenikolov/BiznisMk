import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { api } from '../lib/api.ts';
import { Modal } from './Modal.tsx';

const CURRENCIES = ['MKD', 'EUR', 'USD'] as const;

function extractErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
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
  const [bankName, setBankName] = useState('');
  const [iban, setIban] = useState('');
  const [currency, setCurrency] = useState<string>('MKD');
  const [balance, setBalance] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await api.post('/bank-accounts', {
        bankName,
        // The API rejects spaces; IBANs are usually written in groups of four.
        iban: iban.replace(/\s+/g, '').toUpperCase(),
        currency,
        balance,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
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
          <input value={bankName} onChange={(e) => setBankName(e.target.value)} required autoFocus />
        </label>
        <label>
          {t('accounts.iban')}
          <input
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            placeholder="MK07 2501 2000 0058 984"
            required
          />
        </label>
        <div className="form-row">
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
          <label>
            {t('accounts.openingBalance')}
            <input
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              inputMode="decimal"
              pattern="\d+([.,]\d{1,2})?"
              title={t('accounts.balanceHint')}
              required
            />
          </label>
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {t('accounts.save')}
        </button>
      </form>
    </Modal>
  );
}
