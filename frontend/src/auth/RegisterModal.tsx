import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { api } from '../lib/api.ts';
import { useAuth } from './useAuth.ts';
import { Modal } from '../components/Modal.tsx';
import { CompanyFields } from '../components/CompanyFields.tsx';
import { EMPTY_COMPANY, companyErrorMessage, type CompanyDraft } from '../lib/companyDraft.ts';

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
  const [company, setCompany] = useState<CompanyDraft>(EMPTY_COMPANY);
  // Set once the account exists, so a retry after a refused company (a taken
  // ЕМБС) sends only the company rather than registering the address twice.
  const [isAccountCreated, setIsAccountCreated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const close = () => navigate('/');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    if (!isAccountCreated) {
      try {
        await api.post('/auth/register', { firstName, lastName, email, password });
        setIsAccountCreated(true);
      } catch (err) {
        // One login can own several businesses: the way to add another is from
        // inside, not a second registration with the same address.
        setError(
          axios.isAxiosError(err) && err.response?.status === 409
            ? t('auth.register.emailTaken')
            : extractErrorMessage(err),
        );
        setIsSubmitting(false);
        return;
      }
    }

    try {
      // Creating the company also moves the new session into it.
      await api.post('/companies', company);
      await refetch();
      navigate('/dashboard');
    } catch (err) {
      setError(companyErrorMessage(t, err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal onClose={close} labelledBy="register-modal-title" wide>
      <h2 id="register-modal-title" className="modal-title">
        {t('auth.register.title')}
      </h2>
      <p className="modal-note">{t('auth.register.allRequired')}</p>
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
          <CompanyFields value={company} onChange={setCompany} />
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
