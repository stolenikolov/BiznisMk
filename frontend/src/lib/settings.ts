import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import type { TFunction } from 'i18next';
import { api } from './api.ts';

export type LegalForm = 'DOOEL' | 'DOO' | 'AD' | 'TP' | 'OTHER';
export const LEGAL_FORMS: LegalForm[] = ['DOOEL', 'DOO', 'AD', 'TP', 'OTHER'];

/** The rates Macedonian law defines; the API refuses any other. */
export const VAT_RATES = [18, 10, 5] as const;
export type VatRate = (typeof VAT_RATES)[number];

export interface CompanySettings {
  id: string;
  name: string;
  /** Read-only: printed on every invoice already issued. */
  embs: string;
  edb: string;
  legalForm: LegalForm;
  registeredAddress: string;
  isVatPayer: boolean;
  defaultVatRate: number;
  phone: string | null;
  website: string | null;
  paydayDayOfMonth: number | null;
  emailSenderName: string | null;
  emailReplyTo: string | null;
}

export interface MailStatus {
  fromAddress: string;
  /** False when the server has no mail account set up: nothing is sent. */
  isDelivering: boolean;
}

/** Any subset; optional fields are cleared with null. */
export type CompanySettingsPatch = Partial<Omit<CompanySettings, 'id' | 'embs' | 'edb'>>;

const settingsPath = (companyId: string) => `/companies/${companyId}/settings`;

/**
 * The company's settings for the settings pages. `save` sends only what a card
 * changed and takes the server's answer as the new state.
 */
export function useCompanySettings(companyId: string | undefined) {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [mail, setMail] = useState<MailStatus | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    let isCurrent = true;
    api
      .get<{ settings: CompanySettings; mail: MailStatus }>(settingsPath(companyId))
      .then(({ data }) => {
        if (!isCurrent) return;
        setSettings(data.settings);
        setMail(data.mail);
      })
      .catch(() => {
        if (isCurrent) setHasError(true);
      });
    return () => {
      isCurrent = false;
    };
  }, [companyId]);

  const save = useCallback(
    async (patch: CompanySettingsPatch): Promise<CompanySettings> => {
      if (!companyId) throw new Error('No company to save settings for');
      const { data } = await api.patch<{ settings: CompanySettings }>(settingsPath(companyId), patch);
      setSettings(data.settings);
      return data.settings;
    },
    [companyId],
  );

  return { settings, mail, hasError, save };
}

export async function closeCompany(companyId: string, input: { password: string; confirmName: string }) {
  const { data } = await api.post<{ userDeleted: boolean }>(`${settingsPath(companyId)}/close`, input);
  return data;
}

// The signed-in user's own account ------------------------------------------------

/** Name, login address and, when `password` is given, a new password — one form, one request. */
export async function updateProfile(input: {
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
}): Promise<{ passwordChanged: boolean }> {
  const { data } = await api.patch<{ passwordChanged: boolean }>('/auth/me', input);
  return data;
}

/** Always succeeds the same way, whether or not the address has an account. */
export async function requestPasswordReset(email: string): Promise<void> {
  await api.post('/auth/forgot-password', { email });
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await api.post('/auth/reset-password', { token, password });
}

/** The API's explained refusals as user-facing copy; anything else is generic. */
export function settingsErrorMessage(t: TFunction, error: unknown): string {
  if (axios.isAxiosError(error)) {
    const code = error.response?.data?.errorCode;
    if (typeof code === 'string') {
      return t(`settings.errors.${code}`, { defaultValue: t('settings.errors.generic') });
    }
    const message = error.response?.data?.message;
    if (error.response?.status === 400 && Array.isArray(message)) return message.join(', ');
  }
  return t('settings.errors.generic');
}
