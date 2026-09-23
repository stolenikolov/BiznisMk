import axios from 'axios';
import type { TFunction } from 'i18next';

export const LEGAL_FORMS = ['DOOEL', 'DOO', 'AD', 'TP', 'OTHER'] as const;
export type LegalForm = (typeof LEGAL_FORMS)[number];

/** A company as the registration form and "Add business" collect it, before it is sent. */
export interface CompanyDraft {
  name: string;
  legalForm: LegalForm | '';
  embs: string;
  edb: string;
  registeredAddress: string;
  /** Deliberately starts unset so the user has to state their VAT status. */
  isVatPayer: boolean | null;
}

export const EMPTY_COMPANY: CompanyDraft = {
  name: '',
  legalForm: '',
  embs: '',
  edb: '',
  registeredAddress: '',
  isVatPayer: null,
};

/**
 * Why POST /companies refused, in the reader's language. ЕМБС and ЕДБ are
 * named separately: "already registered" alone would leave them guessing which.
 */
export function companyErrorMessage(t: TFunction, error: unknown): string {
  if (axios.isAxiosError(error) && error.response?.status === 409) {
    const message = String(error.response.data?.message ?? '');
    if (message.includes('ЕМБС')) return t('companies.errors.embsTaken');
    if (message.includes('ЕДБ')) return t('companies.errors.edbTaken');
  }
  return t('companies.errors.generic');
}
