import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { api } from '../lib/api.ts';
import { useAuth } from './useAuth.ts';
import { Modal } from '../components/Modal.tsx';
import { PasswordInput } from '../components/PasswordInput.tsx';
import { CodeInput } from '../components/CodeInput.tsx';
import {
  emptyCode,
  errorCodeOf,
  isTwoFactorRequired,
  twoFactorApi,
  twoFactorErrorMessage,
  useSecondsUntil,
  type ChallengeStarted,
} from '../lib/twoFactor.ts';

/**
 * Signing in: email and password, then — for an account with two-factor on,
 * in a browser it does not trust yet — the code from the email.
 */
export function LoginModal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { refetch } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [challenge, setChallenge] = useState<ChallengeStarted | null>(null);

  const close = () => navigate('/');

  const enter = async () => {
    await refetch();
    navigate('/dashboard');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      if (isTwoFactorRequired(data)) {
        setChallenge(data);
        setIsSubmitting(false);
        return;
      }
      await enter();
    } catch (err) {
      if (errorCodeOf(err) === 'ACCOUNT_LOCKED' && axios.isAxiosError(err)) {
        // 24-hour time either way; this browser's ICU has no Macedonian data to format with.
        const time = new Date(err.response?.data?.lockedUntil).toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
        });
        setError(t('auth.login.locked', { time }));
      } else if (axios.isAxiosError(err) && err.response?.status === 429) {
        setError(t('twoFactor.errors.rateLimited'));
      } else {
        const message = axios.isAxiosError(err) ? (err.response?.data?.message ?? err.message) : 'Unknown error';
        setError(Array.isArray(message) ? message.join(', ') : message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (challenge) {
    return (
      <Modal onClose={close} labelledBy="login-modal-title">
        <ConfirmSignIn
          challenge={challenge}
          onResent={setChallenge}
          onConfirmed={enter}
          onBack={() => {
            setChallenge(null);
            setPassword('');
          }}
        />
      </Modal>
    );
  }

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
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <Link to="/forgot-password" replace className="form-aside-link">
          {t('auth.login.forgot')}
        </Link>
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

/**
 * The second step. The code submits itself once the sixth digit is in; a
 * wrong one clears the boxes for another go, and a challenge that has died —
 * expired past resending, or out of tries — sends the person back to sign in.
 */
function ConfirmSignIn({
  challenge,
  onResent,
  onConfirmed,
  onBack,
}: {
  challenge: ChallengeStarted;
  onResent: (challenge: ChallengeStarted) => void;
  onConfirmed: () => Promise<void>;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [digits, setDigits] = useState(emptyCode);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDead, setIsDead] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resentNotice, setResentNotice] = useState(false);
  const secondsLeft = useSecondsUntil(challenge.resendAvailableAt);

  const verify = async (code: string) => {
    if (isVerifying || isDead) return;
    setIsVerifying(true);
    setError(null);
    setResentNotice(false);
    try {
      await twoFactorApi.verify(challenge.challengeId, code, rememberDevice);
      await onConfirmed();
    } catch (err) {
      setError(twoFactorErrorMessage(t, err));
      if (errorCodeOf(err) === 'TWO_FACTOR_TOO_MANY_ATTEMPTS') setIsDead(true);
      setDigits(emptyCode());
      setIsVerifying(false);
    }
  };

  const resend = async () => {
    setIsResending(true);
    setError(null);
    try {
      onResent(await twoFactorApi.resend(challenge.challengeId));
      setDigits(emptyCode());
      setResentNotice(true);
    } catch (err) {
      setError(twoFactorErrorMessage(t, err));
      if (errorCodeOf(err) === 'TWO_FACTOR_TOO_MANY_ATTEMPTS') setIsDead(true);
    } finally {
      setIsResending(false);
    }
  };

  const code = digits.join('');

  return (
    <>
      <h2 id="login-modal-title" className="modal-title">
        {t('twoFactor.login.title')}
      </h2>
      <p className="two-factor-lead">{t('twoFactor.login.sentTo', { email: challenge.maskedEmail })}</p>

      <form
        className="two-factor-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (code.length === digits.length) void verify(code);
        }}
      >
        <CodeInput
          digits={digits}
          onChange={setDigits}
          onComplete={(complete) => void verify(complete)}
          disabled={isVerifying || isDead}
          invalid={error !== null}
          autoFocus
          label={t('twoFactor.codeLabel')}
        />

        <label className="check-row">
          <input
            type="checkbox"
            checked={rememberDevice}
            onChange={(event) => setRememberDevice(event.target.checked)}
            disabled={isDead}
          />
          {t('twoFactor.login.remember')}
        </label>

        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {resentNotice && !error && (
          <p role="status" className="two-factor-notice">
            {t('twoFactor.resent', { email: challenge.maskedEmail })}
          </p>
        )}

        {isDead ? (
          <button type="button" className="btn-primary" onClick={onBack}>
            {t('twoFactor.login.startOver')}
          </button>
        ) : (
          <button type="submit" className="btn-primary" disabled={isVerifying || code.length < digits.length}>
            {isVerifying ? t('twoFactor.verifying') : t('twoFactor.login.submit')}
          </button>
        )}
      </form>

      <div className="two-factor-foot">
        <button type="button" className="link-button" onClick={onBack}>
          ← {t('twoFactor.login.back')}
        </button>
        {!isDead && (
          <button
            type="button"
            className="link-button"
            onClick={() => void resend()}
            disabled={secondsLeft > 0 || isResending}
          >
            {secondsLeft > 0 ? t('twoFactor.resendIn', { seconds: secondsLeft }) : t('twoFactor.resend')}
          </button>
        )}
      </div>
    </>
  );
}
