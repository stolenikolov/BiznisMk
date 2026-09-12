import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <section className="not-found">
      <h1 className="page-title">{t('notFound.title')}</h1>
      <Link to="/" className="btn-ghost">
        {t('notFound.backHome')}
      </Link>
    </section>
  );
}
