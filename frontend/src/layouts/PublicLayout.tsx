import { Link, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '../components/LanguageSwitcher.tsx';
import { ThemeToggle } from '../components/ThemeToggle.tsx';
import { LoginModal } from '../auth/LoginModal.tsx';
import { RegisterModal } from '../auth/RegisterModal.tsx';

export function PublicLayout() {
  const { t } = useTranslation();
  const location = useLocation();

  return (
    <div className="public-shell">
      <header className="public-header">
        <Link to="/" className="brand">
          {t('app.name')}
        </Link>
        <div className="public-header-actions">
          <Link to="/login" className="nav-link">
            {t('nav.login')}
          </Link>
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>
      <main className="public-content">
        <Outlet />
      </main>

      {location.pathname === '/login' && <LoginModal />}
      {location.pathname === '/register' && <RegisterModal />}
    </div>
  );
}
