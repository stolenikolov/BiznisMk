import { describe, expect, it } from 'vitest';
import { buildInvoiceIssuerHeader, formatLegalName } from './invoice-issuer.js';
import { CompanyLegalForm } from '../generated/prisma/enums.js';

const company = {
  name: 'Најди Книга',
  embs: '7412589',
  edb: '4080012345678',
  legalForm: CompanyLegalForm.DOOEL,
  registeredAddress: 'ул. Македонија 12, Скопје',
  isVatPayer: true,
};

describe('formatLegalName', () => {
  it('appends the legal-form suffix', () => {
    expect(formatLegalName(company)).toBe('Најди Книга ДООЕЛ');
    expect(formatLegalName({ name: 'Технолаб', legalForm: CompanyLegalForm.AD })).toBe('Технолаб АД');
    expect(formatLegalName({ name: 'Петар Петров', legalForm: CompanyLegalForm.TP })).toBe('Петар Петров ТП');
  });

  it('leaves the name untouched for OTHER', () => {
    expect(formatLegalName({ name: 'Здружение Ластовица', legalForm: CompanyLegalForm.OTHER })).toBe(
      'Здружение Ластовица',
    );
  });
});

describe('buildInvoiceIssuerHeader', () => {
  it('carries the registered address and both identifiers', () => {
    const header = buildInvoiceIssuerHeader(company);

    expect(header.legalName).toBe('Најди Книга ДООЕЛ');
    expect(header.registeredAddress).toBe('ул. Македонија 12, Скопје');
    expect(header.embs).toBe('7412589');
    expect(header.edb).toBe('4080012345678');
  });

  it('adds a VAT-exempt note only for non-VAT-payers', () => {
    expect(buildInvoiceIssuerHeader(company).vatExemptNote).toBeNull();
    expect(buildInvoiceIssuerHeader({ ...company, isVatPayer: false }).vatExemptNote).toBe(
      'Не е регистриран за ДДВ',
    );
  });
});
