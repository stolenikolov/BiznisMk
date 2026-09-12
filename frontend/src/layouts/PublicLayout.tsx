import { Link, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '../components/LanguageSwitcher.tsx';

export function PublicLayout() {
  const { t } = useTranslation();

  return (
    <div className="app-shell">
      <header className="public-header">
        <Link to="/" className="app-name">
          {t('app.name')}
        </Link>
        <div className="public-header-actions">
          <Link to="/login">{t('nav.login')}</Link>
          <LanguageSwitcher />
        </div>
      </header>
      <main className="public-content">
        <Outlet />
      </main>
    </div>
  );
}
