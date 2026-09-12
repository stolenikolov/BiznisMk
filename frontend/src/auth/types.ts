export type CompanyRole = 'CEO' | 'MANAGER' | 'EMPLOYEE';

export interface AuthUser {
  userId: string;
  email: string;
  companyId?: string;
  role?: CompanyRole;
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';
