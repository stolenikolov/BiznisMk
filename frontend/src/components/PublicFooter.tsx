import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ClockIcon, LocationIcon, MailIcon, PhoneIcon } from './icons.tsx';

/** Points at the landing bands, which carry these ids. */
const PLATFORM_LINKS = [
  { key: 'finance', href: '#feature-finance' },
  { key: 'team', href: '#feature-team' },
  { key: 'invoices', href: '#feature-invoices' },
] as const;

/** Only routes that exist — the public shell has no marketing pages yet. */
const ACCOUNT_LINKS = [
  { key: 'register', to: '/register' },
  { key: 'login', to: '/login' },
  { key: 'forgot', to: '/forgot-password' },
] as const;

/**
 * The closing band under every public page: wordmark, two link lists, contact
 * details, and the copyright row.
 */
export function PublicFooter() {
  const { t } = useTranslation();
  const email = t('footer.contact.email');
  const phone = t('footer.contact.phone');

  return (
    <footer className="public-footer">
      <div className="public-footer-inner">
        <div className="public-footer-top">
          <div className="public-footer-brand">
            <span className="brand">{t('app.name')}</span>
            <p className="public-footer-tagline">{t('footer.tagline')}</p>
          </div>

          <nav className="public-footer-col" aria-label={t('footer.platform.title')}>
            <h2 className="label-caps">{t('footer.platform.title')}</h2>
            <ul>
              {PLATFORM_LINKS.map(({ key, href }) => (
                <li key={key}>
                  <a href={href}>{t(`footer.platform.${key}`)}</a>
                </li>
              ))}
            </ul>
          </nav>

          <nav className="public-footer-col" aria-label={t('footer.account.title')}>
            <h2 className="label-caps">{t('footer.account.title')}</h2>
            <ul>
              {ACCOUNT_LINKS.map(({ key, to }) => (
                <li key={key}>
                  <Link to={to}>{t(`footer.account.${key}`)}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="public-footer-col">
            <h2 className="label-caps">{t('footer.contact.title')}</h2>
            <ul className="public-footer-contact">
              <li>
                <span className="public-footer-icon">
                  <MailIcon />
                </span>
                <a href={`mailto:${email}`}>{email}</a>
              </li>
              <li>
                <span className="public-footer-icon">
                  <PhoneIcon />
                </span>
                {/* tel: takes the bare digits; the label keeps its spacing. */}
                <a href={`tel:${phone.replace(/[^+\d]/g, '')}`} className="num">
                  {phone}
                </a>
              </li>
              <li>
                <span className="public-footer-icon">
                  <LocationIcon />
                </span>
                <span>{t('footer.contact.address')}</span>
              </li>
              <li>
                <span className="public-footer-icon">
                  <ClockIcon />
                </span>
                <span>{t('footer.contact.hours')}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="public-footer-bottom">
          <p>{t('footer.copyright', { year: new Date().getFullYear() })}</p>
          <p>{t('footer.madeIn')}</p>
        </div>
      </div>
    </footer>
  );
}
