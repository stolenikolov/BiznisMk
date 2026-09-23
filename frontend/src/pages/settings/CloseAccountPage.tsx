import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth.ts';
import { OwnerSettings } from '../../layouts/SettingsLayout.tsx';
import { closeCompany, settingsErrorMessage } from '../../lib/settings.ts';

const DELETED = ['employees', 'invoices', 'finance', 'schedule', 'notifications'] as const;

/** Closing the company for good, behind the password and its typed name. */
export function CloseAccountPage() {
  return (
    <OwnerSettings>
      {(settings, { companyId }) => <CloseAccountCard companyId={companyId!} companyName={settings.name} />}
    </OwnerSettings>
  );
}

function CloseAccountCard({ companyId, companyName }: { companyId: string; companyName: string }) {
  const { t } = useTranslation();
  const { refetch } = useAuth();
  const navigate = useNavigate();
  const [confirmName, setConfirmName] = useState('');
  const [password, setPassword] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The same comparison the API makes: case aside, surrounding spaces aside.
  const nameMatches = confirmName.trim().toLocaleLowerCase('mk') === companyName.trim().toLocaleLowerCase('mk');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsClosing(true);
    setError(null);
    try {
      await closeCompany(companyId, { password, confirmName: confirmName.trim() });
      // The session ended with the company; this settles the app into signed-out.
      await refetch();
      navigate('/', { replace: true });
    } catch (err) {
      setError(settingsErrorMessage(t, err));
      setIsClosing(false);
    }
  };

  return (
    <section className="card settings-card settings-card--danger">
      <header className="settings-card-head">
        <h2>{t('settings.account.title')}</h2>
        <p>{t('settings.account.intro', { name: companyName })}</p>
      </header>

      <ul className="settings-danger-list">
        {DELETED.map((item) => (
          <li key={item}>{t(`settings.account.deletes.${item}`)}</li>
        ))}
        <li>{t('settings.account.deletes.login')}</li>
      </ul>
      <p className="settings-danger-final">{t('settings.account.final')}</p>

      <form onSubmit={handleSubmit}>
        <label>
          {t('settings.account.confirmName', { name: companyName })}
          <input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoComplete="off" />
        </label>
        <label>
          {t('settings.account.password')}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>

        <div className="settings-card-actions">
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn-danger" disabled={!nameMatches || password === '' || isClosing}>
            {isClosing ? t('settings.account.closing') : t('settings.account.submit')}
          </button>
        </div>
      </form>
    </section>
  );
}
