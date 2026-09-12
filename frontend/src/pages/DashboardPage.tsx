import { useTranslation } from 'react-i18next';

export function DashboardPage() {
  const { t } = useTranslation();

  return (
    <section>
      <h1 className="page-title">{t('dashboard.title')}</h1>
      <p className="dashboard-placeholder">{t('dashboard.placeholder')}</p>
    </section>
  );
}
