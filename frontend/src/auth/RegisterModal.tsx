import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { api } from '../lib/api.ts';
import { useAuth } from './useAuth.ts';
import { Modal } from '../components/Modal.tsx';

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
  const [companyTaxId, setCompanyTaxId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const close = () => navigate('/');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await api.post('/auth/register', { firstName, lastName, email, password });
      const { data } = await api.post('/companies', { name: companyName, taxId: companyTaxId });
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
    <Modal onClose={close} labelledBy="register-modal-title">
      <h2 id="register-modal-title" className="modal-title">
        {t('auth.register.title')}
      </h2>
      <form onSubmit={handleSubmit}>
        <div className="form-section">
          <h3 className="form-section-title">{t('auth.register.ownerHeading')}</h3>
          <label>
            {t('auth.register.firstName')}
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required autoFocus />
          </label>
          <label>
            {t('auth.register.lastName')}
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </label>
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
          <h3 className="form-section-title">{t('auth.register.companyHeading')}</h3>
          <label>
            {t('auth.register.companyName')}
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
          </label>
          <label>
            {t('auth.register.companyTaxId')}
            <input value={companyTaxId} onChange={(e) => setCompanyTaxId(e.target.value)} required />
          </label>
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
