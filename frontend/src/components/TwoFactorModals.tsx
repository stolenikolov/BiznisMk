import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from './Modal.tsx';
import { CodeInput } from './CodeInput.tsx';
import { PasswordInput } from './PasswordInput.tsx';
import { CheckIcon } from './icons.tsx';
import {
  emptyCode,
  twoFactorApi,
  twoFactorErrorMessage,
  useSecondsUntil,
  type ChallengeStarted,
  type TwoFactorStatus,
} from '../lib/twoFactor.ts';

/** "Send again", counting down the minute between codes. */
function ResendButton({
  challenge,
  onResend,
  disabled,
}: {
  challenge: ChallengeStarted;
  onResend: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const secondsLeft = useSecondsUntil(challenge.resendAvailableAt);
  return (
    <button type="button" className="link-button" onClick={onResend} disabled={disabled || secondsLeft > 0}>
      {secondsLeft > 0 ? t('twoFactor.resendIn', { seconds: secondsLeft }) : t('twoFactor.resend')}
    </button>
  );
}

/**
 * Turning two-factor on: say what it does, send a code to the login address,
 * take the code back. The code proves the address works before the account
 * starts depending on it.
 */
export function EnableTwoFactorModal({
  onClose,
  onEnabled,
}: {
  onClose: () => void;
  onEnabled: (status: TwoFactorStatus) => void;
}) {
  const { t } = useTranslation();
  const [challenge, setChallenge] = useState<ChallengeStarted | null>(null);
  const [digits, setDigits] = useState(emptyCode);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);

  const send = async () => {
    setIsBusy(true);
    setError(null);
    try {
      setChallenge(await twoFactorApi.startEnable());
      setDigits(emptyCode());
    } catch (err) {
      setError(twoFactorErrorMessage(t, err));
    } finally {
      setIsBusy(false);
    }
  };

  const confirm = async (code: string) => {
    if (isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      onEnabled(await twoFactorApi.confirmEnable(code));
      setIsDone(true);
    } catch (err) {
      setError(twoFactorErrorMessage(t, err));
      setDigits(emptyCode());
    } finally {
      setIsBusy(false);
    }
  };

  const code = digits.join('');

  return (
    <Modal onClose={onClose} labelledBy="enable-2fa-title">
      <span className="label-caps modal-eyebrow">{t('settings.security.eyebrow')}</span>
      <h2 id="enable-2fa-title" className="modal-title">
        {isDone ? t('twoFactor.enable.doneTitle') : t('twoFactor.enable.title')}
      </h2>

      {isDone ? (
        <>
          <div className="two-factor-done">
            <span className="two-factor-done-icon" aria-hidden="true">
              <CheckIcon />
            </span>
            <p>{t('twoFactor.enable.done')}</p>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-primary" onClick={onClose}>
              {t('twoFactor.close')}
            </button>
          </div>
        </>
      ) : !challenge ? (
        <>
          <p className="two-factor-lead">{t('twoFactor.enable.intro')}</p>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={isBusy}>
              {t('twoFactor.cancel')}
            </button>
            <button type="button" className="btn-primary" onClick={() => void send()} disabled={isBusy}>
              {isBusy ? t('twoFactor.sending') : t('twoFactor.sendCode')}
            </button>
          </div>
        </>
      ) : (
        <form
          className="two-factor-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (code.length === digits.length) void confirm(code);
          }}
        >
          <p className="two-factor-lead">{t('twoFactor.sentTo', { email: challenge.maskedEmail })}</p>
          <CodeInput
            digits={digits}
            onChange={setDigits}
            onComplete={(complete) => void confirm(complete)}
            disabled={isBusy}
            invalid={error !== null}
            autoFocus
            label={t('twoFactor.codeLabel')}
          />
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="two-factor-foot">
            <ResendButton challenge={challenge} onResend={() => void send()} disabled={isBusy} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={isBusy}>
              {t('twoFactor.cancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={isBusy || code.length < digits.length}>
              {isBusy ? t('twoFactor.verifying') : t('twoFactor.enable.submit')}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/**
 * Turning two-factor off takes the password and a fresh code together, so
 * neither a borrowed session nor a leaked password is enough on its own.
 * Every remembered device is forgotten with it.
 */
export function DisableTwoFactorModal({
  onClose,
  onDisabled,
}: {
  onClose: () => void;
  onDisabled: (status: TwoFactorStatus) => void;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<ChallengeStarted | null>(null);
  const [digits, setDigits] = useState(emptyCode);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setIsBusy(true);
    setError(null);
    try {
      setChallenge(await twoFactorApi.startDisable());
      setDigits(emptyCode());
    } catch (err) {
      setError(twoFactorErrorMessage(t, err));
    } finally {
      setIsBusy(false);
    }
  };

  const code = digits.join('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!challenge || code.length < digits.length) return;
    setIsBusy(true);
    setError(null);
    try {
      onDisabled(await twoFactorApi.disable(password, code));
      onClose();
    } catch (err) {
      setError(twoFactorErrorMessage(t, err));
      setDigits(emptyCode());
      setIsBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} labelledBy="disable-2fa-title">
      <span className="label-caps modal-eyebrow">{t('settings.security.eyebrow')}</span>
      <h2 id="disable-2fa-title" className="modal-title">
        {t('twoFactor.disable.title')}
      </h2>
      <p className="two-factor-lead">{t('twoFactor.disable.intro')}</p>

      <form className="two-factor-form" onSubmit={(event) => void handleSubmit(event)}>
        <label>
          {t('twoFactor.disable.password')}
          <PasswordInput
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            autoFocus
          />
        </label>

        {!challenge ? (
          <button
            type="button"
            className="btn-ghost two-factor-send"
            onClick={() => void send()}
            disabled={isBusy || password === ''}
          >
            {isBusy ? t('twoFactor.sending') : t('twoFactor.sendCode')}
          </button>
        ) : (
          <>
            <p className="two-factor-lead">{t('twoFactor.sentTo', { email: challenge.maskedEmail })}</p>
            <CodeInput
              digits={digits}
              onChange={setDigits}
              disabled={isBusy}
              invalid={error !== null}
              autoFocus
              label={t('twoFactor.codeLabel')}
            />
            <div className="two-factor-foot">
              <ResendButton challenge={challenge} onResend={() => void send()} disabled={isBusy} />
            </div>
          </>
        )}

        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={isBusy}>
            {t('twoFactor.cancel')}
          </button>
          <button
            type="submit"
            className="btn-danger"
            disabled={isBusy || !challenge || password === '' || code.length < digits.length}
          >
            {t('twoFactor.disable.submit')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
