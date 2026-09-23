import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from './api.ts';
import { useAuth } from '../auth/useAuth.ts';
import type { CompanyRole } from '../auth/types.ts';
import type { LegalForm } from './companyDraft.ts';

export interface CompanyMembershipSummary {
  companyId: string;
  name: string;
  role: CompanyRole;
  legalForm: LegalForm;
}

/**
 * Every company the signed-in user belongs to, for the switcher, the picker
 * after sign-in and "My businesses". Re-read whenever the active company
 * changes, which is also what happens when one is added.
 */
export function useCompanies() {
  const { user } = useAuth();
  const activeCompanyId = user?.companyId;
  const [companies, setCompanies] = useState<CompanyMembershipSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ companies: CompanyMembershipSummary[] }>('/auth/companies');
      setCompanies(data.companies);
    } catch {
      setCompanies([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // The active company is not read by the request; a change of it is what
  // makes the list worth re-reading.
  useEffect(() => {
    void load();
  }, [load, activeCompanyId]);

  return { companies, isLoading, reload: load };
}

/**
 * Moves the session into another company and lands on its overview. Every
 * page below is keyed by the company, so nothing from the previous one lingers.
 */
export function useSwitchCompany() {
  const { refetch } = useAuth();
  const navigate = useNavigate();

  return useCallback(
    async (companyId: string) => {
      await api.post('/auth/switch-company', { companyId });
      await refetch();
      navigate('/dashboard');
    },
    [refetch, navigate],
  );
}
