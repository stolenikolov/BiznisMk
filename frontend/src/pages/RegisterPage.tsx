import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { api } from '../lib/api.ts';
import { useAuth } from '../auth/useAuth.ts';

function extractErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const message = err.response?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
    return err.message;
  }
  return 'Unknown error';
}

export function RegisterPage() {
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
    <section className="auth-page">
      <h1>{t('auth.register.title')}</h1>
      <form onSubmit={handleSubmit}>
        <fieldset>
          <legend>{t('auth.register.ownerHeading')}</legend>
          <label>
            {t('auth.register.firstName')}
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
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
        </fieldset>

        <fieldset>
          <legend>{t('auth.register.companyHeading')}</legend>
          <label>
            {t('auth.register.companyName')}
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
          </label>
          <label>
            {t('auth.register.companyTaxId')}
            <input value={companyTaxId} onChange={(e) => setCompanyTaxId(e.target.value)} required />
          </label>
        </fieldset>

        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={isSubmitting}>
          {t('auth.register.submit')}
        </button>
      </form>
      <p>
        {t('auth.register.hasAccount')} <Link to="/login">{t('auth.register.loginLink')}</Link>
      </p>
    </section>
  );
}
