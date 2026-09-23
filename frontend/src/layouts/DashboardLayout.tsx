import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ThemeToggle } from '../components/ThemeToggle.tsx';
import { CloseIcon, MenuIcon, PersonIcon } from '../components/icons.tsx';
import { NotificationBell } from '../components/NotificationBell.tsx';
import { NotificationsProvider } from '../components/NotificationsProvider.tsx';
import { useAuth } from '../auth/useAuth.ts';

/** Main sections of the app, drawn from the agreed feature scope. */
const SECTIONS = [
  { to: '/dashboard', key: 'dashboard' },
  { to: '/finance', key: 'finance' },
  { to: '/employees', key: 'employees' },
  { to: '/invoices', key: 'invoices' },
  { to: '/schedule', key: 'schedule' },
  { to: '/settings', key: 'settings' },
] as const;

export function DashboardLayout() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { pathname } = useLocation();
  // Narrow screens fold the tabs into a menu. It remembers the page it was
  // opened on, so going anywhere else — a tab, the avatar, Back — closes it.
  const [menuOpenOn, setMenuOpenOn] = useState<string | null>(null);
  const isMenuOpen = menuOpenOn === pathname;

  return (
    <NotificationsProvider>
      <div className="shell">
        {/* Navigation runs across the top: wordmark and tabs left, tools right.
            Language, signing out and switching company live in Settings; the
            avatar leads there. */}
        <header className={`topnav${isMenuOpen ? ' is-menu-open' : ''}`}>
          <div className="topnav-left">
            <span className="brand">{t('app.name')}</span>
            <nav id="topnav-sections" className="topnav-tabs" aria-label={t('nav.sections')}>
              {SECTIONS.map((section) => (
                <NavLink key={section.to} to={section.to} end={section.to === '/dashboard'}>
                  {t(`nav.${section.key}`)}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="topnav-right">
            <NotificationBell />
            <ThemeToggle />
            <span className="topnav-divider" aria-hidden="true" />
            <Link
              to="/settings/profile"
              className="avatar-button"
              title={t('settings.sections.profile')}
              aria-label={t('settings.sections.profile')}
            >
              <PersonIcon />
            </Link>
            <button
              type="button"
              className="icon-button topnav-menu-button"
              aria-expanded={isMenuOpen}
              aria-controls="topnav-sections"
              aria-label={isMenuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
              onClick={() => setMenuOpenOn(isMenuOpen ? null : pathname)}
            >
              {isMenuOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
          </div>
        </header>

        {/* Keyed by the company: switching remounts the page, so every figure
            is read again for the new company rather than left from the old. */}
        <main className="shell-content" key={user?.companyId}>
          <Outlet />
        </main>
      </div>
    </NotificationsProvider>
  );
}
