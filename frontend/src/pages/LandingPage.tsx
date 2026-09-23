import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FinanceIcon, InvoiceIcon, TeamIcon } from '../components/icons.tsx';
import { ScaledPreview } from '../components/landing/ScaledPreview.tsx';
import {
  FinancePreview,
  InvoicesPreview,
  OverviewPreview,
  SchedulePreview,
} from '../components/landing/Previews.tsx';
import { useReveal } from '../lib/useReveal.ts';

/** Each band's picture, and the desktop width it is laid out at before scaling. */
const BANDS = [
  { key: 'finance', Icon: FinanceIcon, Preview: FinancePreview, width: 900 },
  { key: 'team', Icon: TeamIcon, Preview: SchedulePreview, width: 1100 },
  { key: 'invoices', Icon: InvoiceIcon, Preview: InvoicesPreview, width: 880 },
] as const;

/** A product picture, revealed as it scrolls into view. */
function PreviewFrame({ label, width, children }: { label: string; width: number; children: ReactNode }) {
  const { ref, revealed } = useReveal<HTMLDivElement>();

  return (
    <div ref={ref} className={`ui-frame ui-frame--preview reveal${revealed ? ' is-revealed' : ''}`}>
      <ScaledPreview width={width} label={label}>
        {children}
      </ScaledPreview>
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

      <PreviewFrame label={t('landing.preview.dashboard')} width={1240}>
        <OverviewPreview />
      </PreviewFrame>

      {BANDS.map(({ key, Icon, Preview, width }, index) => (
        <section
          key={key}
          id={`feature-${key}`}
          className={`landing-band${index % 2 === 1 ? ' landing-band--reverse' : ''}`}
        >
          <div className="landing-band-copy">
            <span className="landing-band-icon">
              <Icon />
            </span>
            <h2>{t(`landing.features.${key}.title`)}</h2>
            <p>{t(`landing.features.${key}.description`)}</p>
          </div>
          <PreviewFrame label={t(`landing.preview.${key}`)} width={width}>
            <Preview />
          </PreviewFrame>
        </section>
      ))}
    </div>
  );
}
