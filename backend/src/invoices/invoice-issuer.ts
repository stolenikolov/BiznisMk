import { CompanyLegalForm } from '../generated/prisma/enums.js';

/** Suffix appended after the company name on invoices, e.g. "Најди Книга ДООЕЛ". */
const LEGAL_FORM_SUFFIX: Record<CompanyLegalForm, string> = {
  DOOEL: 'ДООЕЛ',
  DOO: 'ДОО',
  AD: 'АД',
  TP: 'ТП',
  OTHER: '',
};

export interface IssuerCompany {
  name: string;
  embs: string;
  edb: string;
  legalForm: CompanyLegalForm;
  registeredAddress: string;
  isVatPayer: boolean;
}

export interface InvoiceIssuerHeader {
  legalName: string;
  registeredAddress: string;
  embs: string;
  edb: string;
  isVatPayer: boolean;
  /** Rendered on invoices from companies outside the VAT system. */
  vatExemptNote: string | null;
}

/**
 * The company's full legal name as it must appear on an invoice: registered
 * name plus its legal-form suffix. OTHER carries no suffix.
 */
export function formatLegalName(company: Pick<IssuerCompany, 'name' | 'legalForm'>): string {
  const suffix = LEGAL_FORM_SUFFIX[company.legalForm];
  return suffix ? `${company.name} ${suffix}` : company.name;
}

/**
 * Builds the issuer block for an invoice header. Invoice output is a legal
 * Macedonian document, so these strings are intentionally not translated.
 */
export function buildInvoiceIssuerHeader(company: IssuerCompany): InvoiceIssuerHeader {
  return {
    legalName: formatLegalName(company),
    registeredAddress: company.registeredAddress,
    embs: company.embs,
    edb: company.edb,
    isVatPayer: company.isVatPayer,
    vatExemptNote: company.isVatPayer ? null : 'Не е регистриран за ДДВ',
  };
}
