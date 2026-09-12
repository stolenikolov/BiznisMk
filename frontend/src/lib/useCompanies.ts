import { useCallback, useEffect, useState } from 'react';
import { api } from './api.ts';
import type { CompanyRole } from '../auth/types.ts';

export interface CompanyMembershipSummary {
  companyId: string;
  name: string;
  role: CompanyRole;
}

/** Memberships of the signed-in user, used by the company switcher. */
export function useCompanies() {
  const [companies, setCompanies] = useState<CompanyMembershipSummary[]>([]);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ companies: CompanyMembershipSummary[] }>('/auth/companies');
      setCompanies(data.companies);
    } catch {
      setCompanies([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { companies, reload: load };
}
