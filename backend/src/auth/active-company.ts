import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from './types/jwt-payload.type.js';

/**
 * The company named in a `/companies/:companyId/...` path, provided it is the
 * one the caller's access token is scoped to. The token decides: a company id
 * edited into the URL is refused rather than quietly served.
 */
export function activeCompany(user: AuthenticatedUser, companyId: string): string {
  // CompanyRolesGuard has already refused callers with no company at all.
  if (user.companyId !== companyId) {
    throw new ForbiddenException('This is not your active company');
  }
  return companyId;
}
