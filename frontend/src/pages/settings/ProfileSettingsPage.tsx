import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingsCard } from '../../components/SettingsCard.tsx';
import { PasswordInput } from '../../components/PasswordInput.tsx';
import { useAuth } from '../../auth/useAuth.ts';
import { updateProfile } from '../../lib/settings.ts';
import { SecuritySettings } from './SecuritySettings.tsx';

/** The same rule as registration and the API. */
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;

/**
 * The signed-in person's own account, for everyone whatever their role: who
 * they are and how they sign in, then how that sign-in is protected.
 */
export function ProfileSettingsPage() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <>
      <ProfileCard firstName={user.firstName ?? ''} lastName={user.lastName ?? ''} email={user.email} />
      <SecuritySettings />
    </>
  );
}

/**
 * One form: name, login address, password. The password field starts empty
 * and stays so unless a new one is typed; leaving it empty keeps the old one.
 */
function ProfileCard(saved: { firstName: string; lastName: string; email: string }) {
  const { t } = useTranslation();
  const { refetch } = useAuth();
  const [firstName, setFirstName] = useState(saved.firstName);
  const [lastName, setLastName] = useState(saved.lastName);
  const [email, setEmail] = useState(saved.email);
  const [password, setPassword] = useState('');

  const isDirty =
    firstName.trim() !== saved.firstName ||
    lastName.trim() !== saved.lastName ||
    email.trim().toLowerCase() !== saved.email ||
    password !== '';

  return (
    <SettingsCard
      title={t('settings.profile.title')}
      description={t('settings.profile.hint')}
      isDirty={isDirty}
      validate={(translate) =>
        password !== '' && password.length < PASSWORD_MIN
          ? translate('settings.profile.passwordTooShort', { min: PASSWORD_MIN })
          : null
      }
      onSave={async () => {
        const result = await updateProfile({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          ...(password !== '' ? { password } : {}),
        });
        setPassword('');
        await refetch();
        return result.passwordChanged ? t('settings.profile.savedWithPassword') : undefined;
      }}
    >
      <div className="form-row">
        <label>
          {t('settings.profile.firstName')}
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="given-name"
            maxLength={100}
            required
          />
        </label>
        <label>
          {t('settings.profile.lastName')}
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
            maxLength={100}
            required
          />
        </label>
      </div>

      <label>
        {t('settings.profile.email')}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          maxLength={254}
          required
        />
      </label>

      <label>
        {t('settings.profile.password')}
        <PasswordInput
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('settings.profile.passwordPlaceholder')}
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
          maxLength={PASSWORD_MAX}
        />
        <span className="field-hint">{t('settings.profile.passwordHint')}</span>
      </label>
    </SettingsCard>
  );
}
