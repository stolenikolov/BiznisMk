import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '../components/LanguageSwitcher.tsx';
import { ThemeToggle } from '../components/ThemeToggle.tsx';
import { useAuth } from '../auth/useAuth.ts';

export function AppLayout() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="brand">{t('app.name')}</span>
        <nav>
          <NavLink to="/dashboard">{t('nav.dashboard')}</NavLink>
          <NavLink to="/settings/company">{t('nav.settings')}</NavLink>
        </nav>
        <LanguageSwitcher />
        <ThemeToggle />
        <button type="button" className="btn-quiet" onClick={() => void handleLogout()}>
          {t('nav.logout')}
        </button>
      </header>
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
