import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const FEATURE_KEYS = ['finance', 'employees', 'notifications'] as const;

export function LandingPage() {
  const { t } = useTranslation();

  return (
    <div className="landing">
      <section className="landing-hero">
        <h1>{t('landing.tagline')}</h1>
        <p className="landing-subtitle">{t('landing.subtitle')}</p>
        <Link to="/register" className="landing-cta">
          {t('landing.registerCta')}
        </Link>
      </section>

      <section className="landing-features">
        {FEATURE_KEYS.map((key) => (
          <div key={key} className="landing-feature">
            <h2>{t(`landing.features.${key}.title`)}</h2>
            <p>{t(`landing.features.${key}.description`)}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
