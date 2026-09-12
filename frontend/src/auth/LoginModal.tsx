import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { api } from '../lib/api.ts';
import { useAuth } from './useAuth.ts';
import { Modal } from '../components/Modal.tsx';

export function LoginModal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { refetch } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const close = () => navigate('/');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await api.post('/auth/login', { email, password });
      await refetch();
      navigate('/dashboard');
    } catch (err) {
      const message = axios.isAxiosError(err) ? (err.response?.data?.message ?? err.message) : 'Unknown error';
      setError(Array.isArray(message) ? message.join(', ') : message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal onClose={close} labelledBy="login-modal-title">
      <h2 id="login-modal-title" className="modal-title">
        {t('auth.login.title')}
      </h2>
      <form onSubmit={handleSubmit}>
        <label>
          {t('auth.login.email')}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label>
          {t('auth.login.password')}
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {t('auth.login.submit')}
        </button>
      </form>
      <p className="modal-footer">
        {t('auth.login.noAccount')} <Link to="/register" replace>{t('auth.login.registerLink')}</Link>
      </p>
    </Modal>
  );
}
