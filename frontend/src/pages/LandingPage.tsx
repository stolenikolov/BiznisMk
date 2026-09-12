import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FinanceIcon, InvoiceIcon, TeamIcon } from '../components/icons.tsx';

const FEATURES = [
  { key: 'finance', Icon: FinanceIcon },
  { key: 'team', Icon: TeamIcon },
  { key: 'invoices', Icon: InvoiceIcon },
] as const;

export function LandingPage() {
  const { t } = useTranslation();

  return (
    <div className="landing">
      <section className="landing-hero">
        <span className="eyebrow">{t('landing.eyebrow')}</span>
        <h1>{t('landing.headline')}</h1>
        <p className="landing-subtitle">{t('landing.subtext')}</p>
        <Link to="/register" className="btn-primary btn-large">
          {t('landing.registerCta')}
        </Link>
        <p className="landing-login-hint">
          <Link to="/login">{t('landing.loginHint')}</Link>
        </p>
      </section>

      <section className="landing-features">
        {FEATURES.map(({ key, Icon }) => (
          <div key={key} className="feature-card">
            <div className="feature-icon">
              <Icon />
            </div>
            <h2>{t(`landing.features.${key}.title`)}</h2>
            <p>{t(`landing.features.${key}.description`)}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
