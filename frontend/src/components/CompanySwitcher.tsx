import { useTranslation } from 'react-i18next';
import { api } from '../lib/api.ts';
import { useCompanies } from '../lib/useCompanies.ts';
import { useAuth } from '../auth/useAuth.ts';

/** Only renders once the user belongs to more than one company. */
export function CompanySwitcher() {
  const { t } = useTranslation();
  const { user, refetch } = useAuth();
  const { companies } = useCompanies();

  if (companies.length < 2) {
    return null;
  }

  const handleChange = async (companyId: string) => {
    await api.post('/auth/switch-company', { companyId });
    await refetch();
  };

  return (
    <label className="company-switcher">
      <span className="sr-only">{t('nav.company')}</span>
      <select value={user?.companyId ?? ''} onChange={(e) => void handleChange(e.target.value)}>
        {companies.map((company) => (
          <option key={company.companyId} value={company.companyId}>
            {company.name}
          </option>
        ))}
      </select>
    </label>
  );
}
