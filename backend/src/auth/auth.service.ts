import { ConflictException, HttpException, HttpStatus, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { AuditAction, AuditService, type RequestContext } from '../audit/audit.service.js';
import { TokensService } from './tokens.service.js';
import { renderAccountLockedEmail } from './account-emails.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { AccessTokenPayload } from './types/jwt-payload.type.js';
import type { CompanyRole } from '../generated/prisma/enums.js';
import type { User } from '../generated/prisma/client.js';

/** Refresh tokens are stored by hash, never raw. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * A hash to check a password against when the address has no account, so
 * that answer takes as long as a wrong password and the timing does not tell
 * which addresses are registered. Made once, on first use.
 */
let dummyHash: Promise<string> | null = null;
function unknownAccountHash(): Promise<string> {
  dummyHash ??= argon2.hash(`no-such-account-${randomUUID()}`);
  return dummyHash;
}

/** Wrong passwords in a row that lock the account. */
export const MAX_FAILED_LOGINS = 5;
/** How long a locked account refuses to sign in. The email states it in minutes. */
export const LOGIN_LOCK_MS = 15 * 60 * 1000;

/**
 * 423 rather than 401, with the time it lifts, so the sign-in form can say
 * what happened instead of "wrong password" to someone typing the right one.
 * Registering already answers whether an address has an account, so saying an
 * account is locked gives nothing new away.
 */
export function accountLocked(lockedUntil: Date) {
  return new HttpException(
    {
      statusCode: HttpStatus.LOCKED,
      errorCode: 'ACCOUNT_LOCKED',
      message: 'Too many wrong passwords; sign-in is locked for a while',
      lockedUntil: lockedUntil.toISOString(),
    },
    HttpStatus.LOCKED,
  );
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokensService: TokensService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.appUrl = config.getOrThrow<string>('app.appUrl');
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
      },
    });

    const tokens = await this.issueTokens({ sub: user.id, email: user.email });
    return { user, tokens };
  }

  async login(dto: LoginDto) {
    const user = await this.verifyCredentials(dto);
    return { user, tokens: await this.signIn(user) };
  }

  /**
   * Email and password, and nothing more: whether a second step is needed is
   * the caller's decision. An unknown address and a wrong password get the
   * same answer, in the same time.
   *
   * A locked account is refused before its password is even looked at, so
   * guesses made while it is locked are worth nothing.
   */
  async verifyCredentials(dto: LoginDto, context: RequestContext = {}, now = new Date()): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      await argon2.verify(await unknownAccountHash(), dto.password).catch(() => false);
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.lockedUntil && user.lockedUntil > now) throw accountLocked(user.lockedUntil);

    if (!(await argon2.verify(user.passwordHash, dto.password))) {
      await this.countFailedLogin(user, context, now);
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('This account has been deactivated');
    }
    if (user.failedLoginCount > 0 || user.lockedUntil) {
      await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
    }
    return user;
  }

  /**
   * One more wrong password; at the limit the account locks, the owner is
   * told, and the guess that locked it is answered as a lock. The count is a
   * database increment and the lock a conditional update, so parallel guesses
   * cannot slip past the limit or lock (and email) twice.
   */
  private async countFailedLogin(user: User, context: RequestContext, now: Date): Promise<void> {
    const { failedLoginCount } = await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    if (failedLoginCount < MAX_FAILED_LOGINS) return;

    const lockedUntil = new Date(now.getTime() + LOGIN_LOCK_MS);
    const { count } = await this.prisma.user.updateMany({
      where: { id: user.id, failedLoginCount: { gte: MAX_FAILED_LOGINS } },
      data: { failedLoginCount: 0, lockedUntil },
    });
    if (count === 0) return;

    await this.audit.record({
      userId: user.id,
      action: AuditAction.ACCOUNT_LOCKED,
      metadata: { lockedUntil: lockedUntil.toISOString() },
      ...context,
    });
    void this.mail
      .send({
        to: user.email,
        fromName: 'BiznisMk',
        ...renderAccountLockedEmail({
          firstName: user.firstName,
          attempts: MAX_FAILED_LOGINS,
          minutes: LOGIN_LOCK_MS / 60_000,
          forgotLink: `${this.appUrl}/forgot-password`,
        }),
      })
      .catch((error: unknown) => this.logger.error(`Could not send an account-locked notice: ${String(error)}`));
    throw accountLocked(lockedUntil);
  }

  /** Opens a session for someone whose identity is settled — by password, and by code if they use two-factor. */
  async signIn(user: Pick<User, 'id' | 'email'>): Promise<AuthTokens> {
    return this.issueTokens(await this.claimsFor(user.id, user.email));
  }

  /** The same, after the second step, which only knows whose code it was. */
  async signInById(userId: string): Promise<{ user: User; tokens: AuthTokens }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.isActive) {
      throw new UnauthorizedException('This account has been deactivated');
    }
    return { user, tokens: await this.signIn(user) };
  }

  /**
   * Company claims for a session that has not chosen a company explicitly.
   *
   * With exactly one membership there is nothing to choose: issuing the token
   * without claims would leave the caller with no company context at all, and
   * the switcher — which is the only thing that calls /auth/switch-company —
   * is hidden for single-company users, so nothing would ever set it.
   *
   * With several memberships the choice is the user's, so the token stays
   * company-less until they pick one.
   */
  private async claimsFor(userId: string, email: string): Promise<AccessTokenPayload> {
    const memberships = await this.prisma.companyMembership.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    const only = memberships.length === 1 ? memberships[0] : undefined;
    return only
      ? { sub: userId, email, companyId: only.companyId, role: only.role }
      : { sub: userId, email };
  }

  /**
   * Rotates a refresh token: the presented token is looked up by hash and must
   * be un-revoked and unexpired. If a previously-rotated (already revoked)
   * token is presented, that's a signal of token theft/reuse, so the entire
   * refresh-token family for the user is revoked and the request is rejected.
   */
  async refresh(rawRefreshToken: string): Promise<AuthTokens> {
    let payload: { sub: string };
    try {
      payload = this.tokensService.verifyRefreshToken(rawRefreshToken);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenHash = hashToken(rawRefreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.userId !== payload.sub) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.revokedAt || stored.expiresAt < new Date()) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse detected; all sessions revoked');
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: stored.userId } });
    const claims = await this.sessionClaims(user.id, user.email, stored.companyId ?? null);

    const newRefreshToken = this.tokensService.signRefreshToken({ sub: user.id });
    const newTokenHash = hashToken(newRefreshToken);

    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date(), replacedBy: newTokenHash },
      }),
      this.prisma.refreshToken.create({
        data: {
          tokenHash: newTokenHash,
          userId: user.id,
          expiresAt: this.tokensService.refreshExpiryDate(),
          companyId: claims.companyId ?? null,
        },
      }),
    ]);

    const accessToken = this.tokensService.signAccessToken(claims);
    return { accessToken, refreshToken: newRefreshToken };
  }

  /**
   * The claims a rotated session carries on with.
   *
   * Rotation must not quietly drop the caller's company: without this the
   * session works until the access token expires and then fails every
   * company-scoped request with "No active company selected". The company the
   * session picked is kept while the user still belongs to it; otherwise it
   * falls back to what a fresh sign-in would get.
   */
  private async sessionClaims(userId: string, email: string, companyId: string | null): Promise<AccessTokenPayload> {
    if (companyId) {
      const membership = await this.prisma.companyMembership.findUnique({
        where: { userId_companyId: { userId, companyId } },
      });
      if (membership) return { sub: userId, email, companyId, role: membership.role };
    }
    return this.claimsFor(userId, email);
  }

  async logout(rawRefreshToken: string | undefined) {
    if (!rawRefreshToken) return;
    const tokenHash = hashToken(rawRefreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Token claims plus the display names the dashboard greeting needs. */
  async describeCurrentUser(user: {
    userId: string;
    email: string;
    companyId?: string;
    role?: CompanyRole;
  }) {
    const [profile, company] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: user.userId },
        select: { firstName: true, lastName: true },
      }),
      user.companyId
        ? this.prisma.company.findUnique({ where: { id: user.companyId }, select: { name: true } })
        : null,
    ]);

    return {
      ...user,
      firstName: profile?.firstName ?? null,
      lastName: profile?.lastName ?? null,
      companyName: company?.name ?? null,
    };
  }

  async findMemberships(userId: string) {
    return this.prisma.companyMembership.findMany({
      where: { userId },
      include: { company: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Enters a company: an access token scoped to it, and — given the session's
   * refresh token — a note on the session so the choice outlives the access
   * token. Without the note a multi-company user would be dropped back to "no
   * company" at the first rotation.
   */
  async switchCompany(
    userId: string,
    userEmail: string,
    companyId: string,
    rawRefreshToken?: string,
  ): Promise<string> {
    const membership = await this.prisma.companyMembership.findUnique({
      where: { userId_companyId: { userId, companyId } },
    });
    if (!membership) {
      throw new UnauthorizedException('You are not a member of this company');
    }

    if (rawRefreshToken) {
      // Scoped to the caller's own live token: a stale or foreign cookie changes nothing.
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash: hashToken(rawRefreshToken), userId, revokedAt: null },
        data: { companyId },
      });
    }

    const payload: AccessTokenPayload = {
      sub: userId,
      email: userEmail,
      companyId: membership.companyId,
      role: membership.role,
    };
    return this.tokensService.signAccessToken(payload);
  }

  private async issueTokens(payload: AccessTokenPayload): Promise<AuthTokens> {
    const accessToken = this.tokensService.signAccessToken(payload);
    const refreshToken = this.tokensService.signRefreshToken({ sub: payload.sub });

    await this.prisma.refreshToken.create({
      data: {
        tokenHash: hashToken(refreshToken),
        userId: payload.sub,
        expiresAt: this.tokensService.refreshExpiryDate(),
        companyId: payload.companyId ?? null,
      },
    });

    return { accessToken, refreshToken };
  }
}
