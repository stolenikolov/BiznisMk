import { useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.ts';
import { ChevronLeftIcon, LogoutIcon } from '../components/icons.tsx';
import { SETTINGS_NARROW, useMediaQuery } from '../lib/useMediaQuery.ts';
import { useCompanySettings, type CompanySettings, type CompanySettingsPatch } from '../lib/settings.ts';
import { useSettings, type SettingsContext } from './settingsContext.ts';

const COMPANY_SECTIONS = ['company', 'payroll', 'email'] as const;

/**
 * Settings: a menu on the left, one section on the right. The company's
 * settings are loaded once here and shared with every section, so moving
 * between them does not reload, and a change in one — the company's name —
 * shows in another — the email preview — straight away.
 *
 * On a phone the two are separate screens: /settings is the menu on its own,
 * and a section fills the screen with a way back to the menu.
 */
export function SettingsLayout() {
  const { t } = useTranslation();
  const { user, refetch, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isMenuScreen = pathname.replace(/\/+$/, '') === '/settings';
  const isOwner = user?.role === 'CEO';
  const companyId = isOwner ? user?.companyId : undefined;
  const company = useCompanySettings(companyId);
  const { save: saveSettings } = company;

  // The company's name also sits in the header, which reads it from /auth/me.
  const save = useCallback(
    async (patch: CompanySettingsPatch) => {
      const saved = await saveSettings(patch);
      if (patch.name !== undefined) await refetch();
      return saved;
    },
    [saveSettings, refetch],
  );

  const context: SettingsContext = { isOwner, companyId, ...company, save };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <section className="settings">
      <header className="page-header">
        <div>
          <h1 className="page-title">{t('nav.settings')}</h1>
          <p className="page-subtitle">{t('settings.subtitle')}</p>
        </div>
      </header>

      <div className={`settings-layout${isMenuScreen ? ' is-menu-screen' : ''}`}>
        <nav className="settings-nav" aria-label={t('settings.navLabel')}>
          {isOwner && (
            <div className="settings-nav-group">
              <span className="label-caps settings-nav-heading">{t('settings.groups.company')}</span>
              {COMPANY_SECTIONS.map((section) => (
                <NavLink key={section} to={`/settings/${section}`}>
                  {t(`settings.sections.${section}`)}
                </NavLink>
              ))}
            </div>
          )}
          <div className="settings-nav-group">
            <span className="label-caps settings-nav-heading">{t('settings.groups.personal')}</span>
            <NavLink to="/settings/profile">{t('settings.sections.profile')}</NavLink>
            <NavLink to="/settings/businesses">{t('settings.sections.businesses')}</NavLink>
            <NavLink to="/settings/language">{t('settings.sections.language')}</NavLink>
          </div>
          {/* Leaving, under a rule: signing out, and for the owner closing the company. */}
          <div className="settings-nav-group settings-nav-group--end">
            <button type="button" className="settings-nav-logout" onClick={() => void handleLogout()}>
              <LogoutIcon />
              {t('nav.logout')}
            </button>
            {isOwner && (
              <NavLink to="/settings/account" className="is-danger">
                {t('settings.sections.account')}
              </NavLink>
            )}
          </div>
        </nav>

        <div className="settings-content">
          <Link to="/settings" className="settings-back">
            <ChevronLeftIcon />
            {t('settings.allSettings')}
          </Link>
          <Outlet context={context} />
        </div>
      </div>
    </section>
  );
}

/**
 * Where /settings lands: the company for its owner, the profile for anyone
 * else. On a phone it stays put — the menu is this screen.
 */
export function SettingsIndex() {
  const { isOwner } = useSettings();
  const isNarrow = useMediaQuery(SETTINGS_NARROW);
  if (isNarrow) return null;
  return <Navigate to={isOwner ? '/settings/company' : '/settings/profile'} replace />;
}

/**
 * The owner-only sections: anyone else is sent to their profile, and the
 * section itself renders only once the settings are in.
 */
export function OwnerSettings({
  children,
}: {
  children: (settings: CompanySettings, context: SettingsContext) => ReactNode;
}) {
  const { t } = useTranslation();
  const context = useSettings();

  if (!context.isOwner) return <Navigate to="/settings/profile" replace />;
  if (context.hasError) {
    return (
      <p className="form-error" role="alert">
        {t('settings.loadError')}
      </p>
    );
  }
  if (!context.settings) return <p className="dashboard-placeholder">{t('common.loading')}</p>;

  return <>{children(context.settings, context)}</>;
}
