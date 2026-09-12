import { CompanyRole } from '../../generated/prisma/enums.js';

/** Payload embedded in the short-lived access token. */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  companyId?: string;
  role?: CompanyRole;
}

/** Payload embedded in the long-lived refresh token. */
export interface RefreshTokenPayload {
  sub: string;
}

/** Shape attached to `Request.user` once a request passes the access-token guard. */
export interface AuthenticatedUser {
  userId: string;
  email: string;
  companyId?: string;
  role?: CompanyRole;
}
