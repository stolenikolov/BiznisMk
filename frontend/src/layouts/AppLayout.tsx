import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '../components/LanguageSwitcher.tsx';

export function AppLayout() {
  const { t } = useTranslation();

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-name">{t('app.name')}</span>
        <nav>
          <NavLink to="/">{t('nav.dashboard')}</NavLink>
          <NavLink to="/login">{t('nav.login')}</NavLink>
          <NavLink to="/register">{t('nav.register')}</NavLink>
        </nav>
        <LanguageSwitcher />
      </header>
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
