import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { settingsErrorMessage } from '../lib/settings.ts';

interface Props {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Whether anything differs from what is saved; the button waits for it. */
  isDirty: boolean;
  /** Throws to show an error; resolves to show "saved", or the message it resolves with. */
  onSave: () => Promise<string | void>;
  /** Overrides the "saved" line, e.g. "password changed". */
  savedMessage?: string;
  /** Checks that belong in the browser (passwords that differ); returns an error or null. */
  validate?: (t: TFunction) => string | null;
  saveLabel?: string;
}

/**
 * One settings card: a titled form with its own save button, so each part of
 * the page saves on its own and an error in one never blocks another.
 */
export function SettingsCard({
  title,
  description,
  children,
  isDirty,
  onSave,
  savedMessage,
  validate,
  saveLabel,
}: Props) {
  const { t } = useTranslation();
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: 'saved' | 'error'; text: string } | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const invalid = validate?.(t) ?? null;
    if (invalid) {
      setStatus({ tone: 'error', text: invalid });
      return;
    }

    setIsSaving(true);
    setStatus(null);
    try {
      const message = await onSave();
      setStatus({ tone: 'saved', text: message || savedMessage || t('settings.saved') });
    } catch (error) {
      setStatus({ tone: 'error', text: settingsErrorMessage(t, error) });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="card settings-card">
      <header className="settings-card-head">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </header>

      <form onSubmit={handleSubmit} onChange={() => status?.tone === 'saved' && setStatus(null)}>
        {children}

        <div className="settings-card-actions">
          {status && (
            <p
              className={status.tone === 'error' ? 'form-error' : 'settings-saved'}
              role={status.tone === 'error' ? 'alert' : 'status'}
            >
              {status.text}
            </p>
          )}
          <button type="submit" className="btn-primary" disabled={isSaving || !isDirty}>
            {isSaving ? t('settings.saving') : (saveLabel ?? t('settings.save'))}
          </button>
        </div>
      </form>
    </section>
  );
}
