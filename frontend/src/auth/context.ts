import { createContext } from 'react';
import type { AuthStatus, AuthUser } from './types.ts';

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  /** Re-fetches /auth/me — call after register/login/switch-company mutations. */
  refetch: () => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
