import { useOutletContext } from 'react-router-dom';
import type { CompanySettings, CompanySettingsPatch, MailStatus } from '../lib/settings.ts';

/** What SettingsLayout hands each section through the router outlet. */
export interface SettingsContext {
  /** The company's owner (CEO) sees the company's settings; everyone sees their own profile. */
  isOwner: boolean;
  companyId: string | undefined;
  settings: CompanySettings | null;
  mail: MailStatus | null;
  hasError: boolean;
  /** Resolves with what the server stored, which may be normalised ("devshop.mk" → "https://devshop.mk"). */
  save: (patch: CompanySettingsPatch) => Promise<CompanySettings>;
}

export function useSettings(): SettingsContext {
  return useOutletContext<SettingsContext>();
}
