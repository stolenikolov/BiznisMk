import { Link, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '../components/LanguageSwitcher.tsx';
import { ThemeToggle } from '../components/ThemeToggle.tsx';
import { PublicFooter } from '../components/PublicFooter.tsx';
import { LoginModal } from '../auth/LoginModal.tsx';
import { RegisterModal } from '../auth/RegisterModal.tsx';
import { ForgotPasswordModal } from '../auth/ForgotPasswordModal.tsx';
import { ResetPasswordModal } from '../auth/ResetPasswordModal.tsx';

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
          <LanguageSwitcher />
          <ThemeToggle />
          <Link to="/login" className="nav-link">
            {t('nav.login')}
          </Link>
          <Link to="/register" className="btn-contrast">
            {t('nav.getStarted')}
          </Link>
        </div>
      </header>
      <main className="public-content">
        <Outlet />
      </main>
      <PublicFooter />

      {location.pathname === '/login' && <LoginModal />}
      {location.pathname === '/register' && <RegisterModal />}
      {location.pathname === '/forgot-password' && <ForgotPasswordModal />}
      {location.pathname === '/reset-password' && <ResetPasswordModal />}
    </div>
  );
}
