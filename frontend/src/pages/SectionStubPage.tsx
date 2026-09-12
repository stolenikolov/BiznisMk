import { useTranslation } from 'react-i18next';

/** Placeholder for a section whose screens aren't built yet. */
export function SectionStubPage({ section }: { section: 'finance' | 'employees' | 'invoices' | 'schedule' }) {
  const { t } = useTranslation();

  return (
    <section>
      <h1 className="page-title">{t(`nav.${section}`)}</h1>
      <p className="dashboard-placeholder">{t('common.sectionPending')}</p>
    </section>
  );
}
