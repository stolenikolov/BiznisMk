import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '../components/LanguageSwitcher.tsx';
import { ThemeToggle } from '../components/ThemeToggle.tsx';
import { CompanySwitcher } from '../components/CompanySwitcher.tsx';
import { BellIcon, PersonIcon, SearchIcon } from '../components/icons.tsx';
import { useAuth } from '../auth/useAuth.ts';

/** Main sections of the app, drawn from the agreed feature scope. */
const SECTIONS = [
  { to: '/dashboard', key: 'dashboard' },
  { to: '/finance', key: 'finance' },
  { to: '/employees', key: 'employees' },
  { to: '/invoices', key: 'invoices' },
  { to: '/schedule', key: 'schedule' },
  { to: '/settings/company', key: 'settings' },
] as const;

export function DashboardLayout() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="shell">
      {/* Navigation runs across the top: wordmark and tabs left, tools right. */}
      <header className="topnav">
        <div className="topnav-left">
          <span className="brand">{t('app.name')}</span>
          <nav className="topnav-tabs" aria-label={t('nav.sections')}>
            {SECTIONS.map((section) => (
              <NavLink key={section.to} to={section.to} end={section.to === '/dashboard'}>
                {t(`nav.${section.key}`)}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="topnav-right">
          <CompanySwitcher />
          <button type="button" className="icon-button" aria-label={t('nav.search')}>
            <SearchIcon />
          </button>
          <button type="button" className="icon-button has-unread" aria-label={t('nav.notifications')}>
            <BellIcon />
          </button>
          <LanguageSwitcher />
          <ThemeToggle />
          <span className="topnav-divider" aria-hidden="true" />
          <button type="button" className="avatar-button" onClick={() => void handleLogout()} title={t('nav.logout')}>
            <PersonIcon />
          </button>
        </div>
      </header>

      <main className="shell-content">
        <Outlet />
      </main>
    </div>
  );
}
