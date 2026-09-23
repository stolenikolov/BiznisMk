import { useState, type FormEvent } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Modal } from '../components/Modal.tsx';
import { requestPasswordReset } from '../lib/settings.ts';

/**
 * "Forgot password": asks for the login address and sends a one-time link.
 * The answer is the same whether or not the address has an account, so the
 * screen never says which addresses are registered.
 */
export function ForgotPasswordModal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => navigate('/');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSending(true);
    setError(null);
    try {
      await requestPasswordReset(email.trim());
      setSentTo(email.trim());
    } catch {
      setError(t('auth.forgot.error'));
    } finally {
      setIsSending(false);
    }
  };

  if (sentTo) {
    return (
      <Modal onClose={close} labelledBy="forgot-title">
        <h2 id="forgot-title" className="modal-title">
          {t('auth.forgot.sentTitle')}
        </h2>
        <div className="modal-message" role="status">
          <p>
            <Trans i18nKey="auth.forgot.sent" values={{ email: sentTo }} components={{ strong: <strong /> }} />
          </p>
          <p>{t('auth.forgot.spamHint')}</p>
        </div>
        <p className="modal-footer">
          <Link to="/login" replace>
            {t('auth.forgot.backToLogin')}
          </Link>
        </p>
      </Modal>
    );
  }

  return (
    <Modal onClose={close} labelledBy="forgot-title">
      <h2 id="forgot-title" className="modal-title">
        {t('auth.forgot.title')}
      </h2>
      <p className="modal-note">{t('auth.forgot.intro')}</p>
      <form onSubmit={handleSubmit}>
        <label>
          {t('auth.login.email')}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            autoFocus
          />
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button type="submit" className="btn-primary" disabled={isSending}>
          {isSending ? t('auth.forgot.sending') : t('auth.forgot.submit')}
        </button>
      </form>
      <p className="modal-footer">
        {t('auth.forgot.remembered')}{' '}
        <Link to="/login" replace>
          {t('auth.forgot.backToLogin')}
        </Link>
      </p>
    </Modal>
  );
}
