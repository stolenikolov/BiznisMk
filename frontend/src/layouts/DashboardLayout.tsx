import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '../components/LanguageSwitcher.tsx';
import { ThemeToggle } from '../components/ThemeToggle.tsx';
import { CompanySwitcher } from '../components/CompanySwitcher.tsx';
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
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="shell">
      <header className="shell-header">
        <span className="brand">{t('app.name')}</span>
        <div className="shell-header-actions">
          <CompanySwitcher />
          {user?.role && <span className="badge">{t(`role.${user.role}`)}</span>}
          <LanguageSwitcher />
          <ThemeToggle />
          <button type="button" className="btn-quiet" onClick={() => void handleLogout()}>
            {t('nav.logout')}
          </button>
        </div>
      </header>

      <div className="shell-body">
        {/* Tabs sit on the left of the shell. */}
        <nav className="shell-nav" aria-label={t('nav.sections')}>
          {SECTIONS.map((section) => (
            <NavLink key={section.to} to={section.to} end={section.to === '/dashboard'}>
              {t(`nav.${section.key}`)}
            </NavLink>
          ))}
        </nav>

        <main className="shell-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
