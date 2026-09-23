import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/useAuth.ts';
import { AddCompanyModal } from '../../components/AddCompanyModal.tsx';
import { PlusIcon } from '../../components/icons.tsx';
import { useCompanies, useSwitchCompany } from '../../lib/useCompanies.ts';

/**
 * The businesses on this login: the one open now, the others one click away,
 * and a new one added under the same email and password.
 */
export function BusinessesSettingsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { companies, isLoading } = useCompanies();
  const switchCompany = useSwitchCompany();
  const [isAdding, setIsAdding] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = async (companyId: string) => {
    setOpeningId(companyId);
    setError(null);
    try {
      await switchCompany(companyId);
    } catch {
      setError(t('companies.select.error'));
      setOpeningId(null);
    }
  };

  return (
    <section className="card settings-card">
      <header className="settings-card-head settings-card-head--action">
        <div>
          <h2>{t('settings.businesses.title')}</h2>
          <p>{t('settings.businesses.hint', { email: user?.email ?? '' })}</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setIsAdding(true)}>
          <PlusIcon />
          {t('companies.add.cta')}
        </button>
      </header>

      {isLoading ? (
        <p className="dashboard-placeholder">{t('common.loading')}</p>
      ) : (
        <ul className="business-list">
          {companies.map((company) => {
            const isCurrent = company.companyId === user?.companyId;
            return (
              <li key={company.companyId} className="business-row">
                <span className="company-choice-initial" aria-hidden="true">
                  {company.name.trim().charAt(0).toLocaleUpperCase('mk')}
                </span>
                <span className="company-choice-text">
                  <span className="company-choice-name">{company.name}</span>
                  <span className="company-choice-meta">
                    {t(`legalForm.${company.legalForm}`)} · {t(`role.${company.role}`)}
                  </span>
                </span>
                {isCurrent ? (
                  <span className="badge-outline business-current">{t('companies.current')}</span>
                ) : (
                  <button
                    type="button"
                    className="btn-ghost business-open"
                    onClick={() => void open(company.companyId)}
                    disabled={openingId !== null}
                  >
                    {openingId === company.companyId ? t('common.loading') : t('companies.open')}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}

      {isAdding && <AddCompanyModal onClose={() => setIsAdding(false)} />}
    </section>
  );
}
