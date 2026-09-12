import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { api } from '../lib/api.ts';
import { useAuth } from './useAuth.ts';
import { Modal } from '../components/Modal.tsx';

const LEGAL_FORMS = ['DOOEL', 'DOO', 'AD', 'TP', 'OTHER'] as const;
type LegalForm = (typeof LEGAL_FORMS)[number];

function extractErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const message = err.response?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
    return err.message;
  }
  return 'Unknown error';
}

export function RegisterModal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { refetch } = useAuth();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [legalForm, setLegalForm] = useState<LegalForm | ''>('');
  const [embs, setEmbs] = useState('');
  const [edb, setEdb] = useState('');
  const [registeredAddress, setRegisteredAddress] = useState('');
  // Deliberately starts unset so the user has to state their VAT status.
  const [isVatPayer, setIsVatPayer] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const close = () => navigate('/');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await api.post('/auth/register', { firstName, lastName, email, password });
      const { data } = await api.post('/companies', {
        name: companyName,
        legalForm,
        embs,
        edb,
        registeredAddress,
        isVatPayer,
      });
      await api.post('/auth/switch-company', { companyId: data.company.id });
      await refetch();
      navigate('/dashboard');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal onClose={close} labelledBy="register-modal-title" wide>
      <h2 id="register-modal-title" className="modal-title">
        {t('auth.register.title')}
      </h2>
      <form onSubmit={handleSubmit}>
        <div className="form-section">
          <h3 className="form-section-title label-caps">{t('auth.register.ownerHeading')}</h3>
          <div className="form-row">
            <label>
              {t('auth.register.firstName')}
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required autoFocus />
            </label>
            <label>
              {t('auth.register.lastName')}
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </label>
          </div>
          <label>
            {t('auth.register.email')}
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            {t('auth.register.password')}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
        </div>

        <div className="form-section">
          <h3 className="form-section-title label-caps">{t('auth.register.companyHeading')}</h3>
          <div className="form-row">
            <label>
              {t('auth.register.companyName')}
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
            </label>
            <label>
              {t('auth.register.legalForm')}
              <select value={legalForm} onChange={(e) => setLegalForm(e.target.value as LegalForm)} required>
                <option value="" disabled>
                  {t('auth.register.legalFormPlaceholder')}
                </option>
                {LEGAL_FORMS.map((form) => (
                  <option key={form} value={form}>
                    {t(`legalForm.${form}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* ЕМБС and ЕДБ are different identifiers and stay separate fields. */}
          <div className="form-row">
            <label>
              {t('auth.register.embs')}
              <input
                value={embs}
                onChange={(e) => setEmbs(e.target.value)}
                inputMode="numeric"
                pattern="\d*"
                title={t('auth.register.digitsOnly')}
                required
              />
            </label>
            <label>
              {t('auth.register.edb')}
              <input
                value={edb}
                onChange={(e) => setEdb(e.target.value)}
                inputMode="numeric"
                pattern="\d*"
                title={t('auth.register.digitsOnly')}
                required
              />
            </label>
          </div>

          <label>
            {t('auth.register.registeredAddress')}
            <input
              value={registeredAddress}
              onChange={(e) => setRegisteredAddress(e.target.value)}
              required
            />
          </label>

          <fieldset className="field-choice">
            <legend>{t('auth.register.isVatPayer')}</legend>
            <div className="choice-options">
              <label className={isVatPayer === true ? 'is-selected' : ''}>
                <input
                  type="radio"
                  name="isVatPayer"
                  checked={isVatPayer === true}
                  onChange={() => setIsVatPayer(true)}
                  required
                />
                {t('common.yes')}
              </label>
              <label className={isVatPayer === false ? 'is-selected' : ''}>
                <input
                  type="radio"
                  name="isVatPayer"
                  checked={isVatPayer === false}
                  onChange={() => setIsVatPayer(false)}
                  required
                />
                {t('common.no')}
              </label>
            </div>
            <span className="field-hint">{t('auth.register.isVatPayerHint')}</span>
          </fieldset>
        </div>

        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {t('auth.register.submit')}
        </button>
      </form>
      <p className="modal-footer">
        {t('auth.register.hasAccount')} <Link to="/login" replace>{t('auth.register.loginLink')}</Link>
      </p>
    </Modal>
  );
}
