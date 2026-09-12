import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FinanceIcon, ImageIcon, InvoiceIcon, TeamIcon } from '../components/icons.tsx';

const BANDS = [
  { key: 'finance', Icon: FinanceIcon },
  { key: 'team', Icon: TeamIcon },
  { key: 'invoices', Icon: InvoiceIcon },
] as const;

/** Stand-in for a product screenshot until the real screen exists. */
function PreviewFrame({ caption, hero = false }: { caption: string; hero?: boolean }) {
  return (
    <div className="ui-frame">
      <div className={`frame-placeholder${hero ? ' frame-placeholder--hero' : ''}`}>
        <span className="frame-placeholder-icon">
          <ImageIcon />
        </span>
        <span className="caption">{caption}</span>
      </div>
    </div>
  );
}

export function LandingPage() {
  const { t } = useTranslation();

  return (
    <div className="landing">
      <section className="landing-hero">
        <span className="landing-eyebrow label-caps">{t('landing.eyebrow')}</span>
        <h1 className="type-hero">{t('landing.headline')}</h1>
        <p className="landing-subtitle">{t('landing.subtext')}</p>
        <div className="landing-actions">
          <Link to="/register" className="btn-primary btn-lg">
            {t('landing.registerCta')}
          </Link>
          <Link to="/login" className="link-arrow">
            {t('landing.loginHint')}
          </Link>
        </div>
      </section>

      <PreviewFrame caption={t('landing.preview.dashboard')} hero />

      {BANDS.map(({ key, Icon }, index) => (
        <section key={key} className={`landing-band${index % 2 === 1 ? ' landing-band--reverse' : ''}`}>
          <div className="landing-band-copy">
            <span className="landing-band-icon">
              <Icon />
            </span>
            <h2>{t(`landing.features.${key}.title`)}</h2>
            <p>{t(`landing.features.${key}.description`)}</p>
          </div>
          <PreviewFrame caption={t('landing.preview.pending')} />
        </section>
      ))}
    </div>
  );
}
