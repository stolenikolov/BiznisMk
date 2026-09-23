import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { activeCompany } from './active-company.js';

describe('activeCompany', () => {
  const user = { userId: 'u1', email: 'ceo@firma.mk', companyId: 'company-1', role: 'CEO' as const };

  it('passes the path company through when it is the one the token is scoped to', () => {
    expect(activeCompany(user, 'company-1')).toBe('company-1');
  });

  it('refuses a company id edited into the URL', () => {
    expect(() => activeCompany(user, 'company-2')).toThrow(ForbiddenException);
  });
});
