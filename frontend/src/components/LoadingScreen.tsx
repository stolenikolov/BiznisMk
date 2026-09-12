import { useTranslation } from 'react-i18next';

export function LoadingScreen() {
  const { t } = useTranslation();
  return (
    <div className="loading-screen">
      <p>{t('common.loading')}</p>
    </div>
  );
}
