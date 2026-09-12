import { useTranslation } from 'react-i18next';

export function DashboardPage() {
  const { t } = useTranslation();

  return (
    <section>
      <h1>{t('dashboard.title')}</h1>
      <p>{t('dashboard.placeholder')}</p>
    </section>
  );
}
