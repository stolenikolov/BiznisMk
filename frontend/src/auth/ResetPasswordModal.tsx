import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Modal } from '../components/Modal.tsx';
import { PasswordInput } from '../components/PasswordInput.tsx';
import { resetPassword } from '../lib/settings.ts';

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;

type State = 'form' | 'done' | 'invalid';

/**
 * Where the emailed link lands: a new password, once. A link that is
 * missing, spent or expired says so and offers a fresh one.
 */
export function ResetPasswordModal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [state, setState] = useState<State>(token ? 'form' : 'invalid');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => navigate('/');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await resetPassword(token, password);
      setState('done');
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.errorCode === 'RESET_LINK_INVALID') {
        setState('invalid');
      } else {
        setError(t('auth.reset.error'));
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (state === 'done') {
    return (
      <Modal onClose={close} labelledBy="reset-title">
        <h2 id="reset-title" className="modal-title">
          {t('auth.reset.doneTitle')}
        </h2>
        <div className="modal-message" role="status">
          <p>{t('auth.reset.done')}</p>
          <Link to="/login" replace className="btn-primary">
            {t('auth.reset.toLogin')}
          </Link>
        </div>
      </Modal>
    );
  }

  if (state === 'invalid') {
    return (
      <Modal onClose={close} labelledBy="reset-title">
        <h2 id="reset-title" className="modal-title">
          {t('auth.reset.invalidTitle')}
        </h2>
        <div className="modal-message" role="alert">
          <p>{t('auth.reset.invalid')}</p>
          <Link to="/forgot-password" replace className="btn-primary">
            {t('auth.reset.requestNew')}
          </Link>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={close} labelledBy="reset-title">
      <h2 id="reset-title" className="modal-title">
        {t('auth.reset.title')}
      </h2>
      <p className="modal-note">{t('auth.reset.intro', { min: PASSWORD_MIN })}</p>
      <form onSubmit={handleSubmit}>
        <label>
          {t('auth.reset.password')}
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={PASSWORD_MIN}
            maxLength={PASSWORD_MAX}
            required
            autoFocus
          />
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button type="submit" className="btn-primary" disabled={isSaving}>
          {isSaving ? t('auth.reset.saving') : t('auth.reset.submit')}
        </button>
      </form>
    </Modal>
  );
}
