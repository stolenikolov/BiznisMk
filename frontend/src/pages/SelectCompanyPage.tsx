import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.ts';
import { AddCompanyModal } from '../components/AddCompanyModal.tsx';
import { ThemeToggle } from '../components/ThemeToggle.tsx';
import { ChevronRightIcon, PlusIcon } from '../components/icons.tsx';
import { useCompanies, useSwitchCompany } from '../lib/useCompanies.ts';

/**
 * Which business to open, after signing in with a login that has several.
 * Also where a login with none lands — a registration whose company was
 * refused — so it can add one rather than being stuck.
 */
export function SelectCompanyPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { companies, isLoading } = useCompanies();
  const switchCompany = useSwitchCompany();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

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

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="company-select">
      <header className="company-select-top">
        <span className="brand">{t('app.name')}</span>
        <ThemeToggle />
      </header>

      <main className="company-select-main">
        <div className="company-select-panel">
          <h1 className="page-title">
            {user?.firstName ? t('companies.select.greeting', { name: user.firstName }) : t('companies.select.title')}
          </h1>
          <p className="page-subtitle">
            {!isLoading && companies.length === 0 ? t('companies.select.none') : t('companies.select.subtitle')}
          </p>

          {isLoading && <p className="dashboard-placeholder">{t('common.loading')}</p>}

          {companies.length > 0 && (
            <ul className="company-choice-list">
              {companies.map((company) => (
                <li key={company.companyId}>
                  <button
                    type="button"
                    className="company-choice"
                    onClick={() => void open(company.companyId)}
                    disabled={openingId !== null}
                  >
                    <span className="company-choice-initial" aria-hidden="true">
                      {company.name.trim().charAt(0).toLocaleUpperCase('mk')}
                    </span>
                    <span className="company-choice-text">
                      <span className="company-choice-name">{company.name}</span>
                      <span className="company-choice-meta">
                        {t(`legalForm.${company.legalForm}`)} · {t(`role.${company.role}`)}
                      </span>
                    </span>
                    <span className="company-choice-go" aria-hidden="true">
                      {openingId === company.companyId ? '…' : <ChevronRightIcon />}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}

          {!isLoading && (
            <button type="button" className="btn-ghost company-select-add" onClick={() => setIsAdding(true)}>
              <PlusIcon />
              {t('companies.add.cta')}
            </button>
          )}

          <p className="company-select-foot">
            {t('companies.select.signedInAs', { email: user?.email ?? '' })}{' '}
            <button type="button" className="link-button" onClick={() => void handleLogout()}>
              {t('nav.logout')}
            </button>
          </p>
        </div>
      </main>

      {isAdding && <AddCompanyModal onClose={() => setIsAdding(false)} />}
    </div>
  );
}
