import { useTranslation } from 'react-i18next';

/**
 * Stub. Exists so the details deliberately kept out of registration have a
 * clear home once they're built.
 */
const PENDING_FIELDS = ['iban', 'phone', 'logo', 'website'] as const;

export function CompanySettingsPage() {
  const { t } = useTranslation();

  return (
    <section>
      <h1 className="page-title">{t('settings.company.title')}</h1>
      <p className="dashboard-placeholder">{t('settings.company.intro')}</p>

      <div className="card settings-pending">
        <div className="card-header">
          <h2>{t('settings.company.pendingHeading')}</h2>
        </div>
        <ul className="settings-list">
          {PENDING_FIELDS.map((field) => (
            <li key={field}>
              <span>{t(`settings.company.${field}`)}</span>
              <span className="badge">{t('settings.company.pendingBadge')}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
