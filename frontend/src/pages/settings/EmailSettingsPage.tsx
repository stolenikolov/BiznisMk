import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingsCard } from '../../components/SettingsCard.tsx';
import { OwnerSettings } from '../../layouts/SettingsLayout.tsx';
import type { CompanySettings, CompanySettingsPatch, MailStatus } from '../../lib/settings.ts';
import { changedFields, orNull } from './fields.ts';

/** How schedules and messages present themselves in employees' inboxes. */
export function EmailSettingsPage() {
  return (
    <OwnerSettings>
      {(settings, { save, mail }) => <EmailCard settings={settings} mail={mail} save={save} />}
    </OwnerSettings>
  );
}

function EmailCard({
  settings,
  mail,
  save,
}: {
  settings: CompanySettings;
  mail: MailStatus | null;
  save: (patch: CompanySettingsPatch) => Promise<CompanySettings>;
}) {
  const { t } = useTranslation();
  const [senderName, setSenderName] = useState(settings.emailSenderName ?? '');
  const [replyTo, setReplyTo] = useState(settings.emailReplyTo ?? '');

  const patch = changedFields(settings, {
    emailSenderName: orNull(senderName),
    emailReplyTo: orNull(replyTo)?.toLowerCase() ?? null,
  });

  return (
    <SettingsCard
      title={t('settings.email.title')}
      description={t('settings.email.hint')}
      isDirty={Object.keys(patch).length > 0}
      onSave={async () => {
        await save(patch);
      }}
    >
      {mail && !mail.isDelivering && (
        <p className="settings-warning" role="note">
          {t('settings.email.notDelivering')}
        </p>
      )}

      <label>
        {t('settings.email.senderName')}
        <input
          value={senderName}
          onChange={(e) => setSenderName(e.target.value)}
          placeholder={settings.name}
          maxLength={100}
        />
        <span className="field-hint">{t('settings.email.senderNameHint')}</span>
      </label>

      <label>
        {t('settings.email.replyTo')}
        <input
          type="email"
          value={replyTo}
          onChange={(e) => setReplyTo(e.target.value)}
          placeholder={t('settings.email.replyToPlaceholder')}
          autoComplete="off"
        />
        <span className="field-hint">{t('settings.email.replyToHint')}</span>
      </label>

      {/* What an employee's inbox will show, updated as you type. */}
      <div className="settings-preview" aria-live="polite">
        <span className="label-caps">{t('settings.email.previewTitle')}</span>
        <dl>
          <div>
            <dt>{t('settings.email.previewFrom')}</dt>
            <dd>
              <strong>{orNull(senderName) ?? settings.name}</strong>
              {mail && <span className="settings-preview-address">&lt;{mail.fromAddress}&gt;</span>}
            </dd>
          </div>
          <div>
            <dt>{t('settings.email.previewReplyTo')}</dt>
            <dd>{orNull(replyTo) ?? t('settings.email.previewReplyToSender')}</dd>
          </div>
        </dl>
      </div>
    </SettingsCard>
  );
}
