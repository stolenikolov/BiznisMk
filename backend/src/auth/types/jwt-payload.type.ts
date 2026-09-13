import { CompanyRole } from '../../generated/prisma/enums.js';

/** Payload embedded in the short-lived access token. */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  companyId?: string;
  role?: CompanyRole;
}

/**
 * Payload embedded in the long-lived refresh token.
 *
 * `jti` makes each issued token unique. Without it the payload is just `sub`
 * plus `iat`, which has second precision — two logins inside the same second
 * produce byte-identical tokens, and the stored hash collides.
 */
export interface RefreshTokenPayload {
  sub: string;
  jti?: string;
}

/** Shape attached to `Request.user` once a request passes the access-token guard. */
export interface AuthenticatedUser {
  userId: string;
  email: string;
  companyId?: string;
  role?: CompanyRole;
}
