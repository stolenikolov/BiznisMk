import { useTranslation } from 'react-i18next';

type Section = 'finance' | 'employees' | 'invoices' | 'schedule' | 'transactions';

/** Placeholder for a section whose screens aren't built yet. */
export function SectionStubPage({ section }: { section: Section }) {
  const { t } = useTranslation();

  return (
    <section>
      <h1 className="page-title">{t(`nav.${section}`)}</h1>
      <p className="dashboard-placeholder">{t('common.sectionPending')}</p>
    </section>
  );
}
