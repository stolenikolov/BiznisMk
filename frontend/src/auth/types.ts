export type CompanyRole = 'CEO' | 'MANAGER' | 'EMPLOYEE';

export interface AuthUser {
  userId: string;
  email: string;
  companyId?: string;
  role?: CompanyRole;
  /** Display names from /auth/me, used by the dashboard greeting. */
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';
