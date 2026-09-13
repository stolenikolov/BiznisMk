import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { TokensService } from './tokens.service.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { AccessTokenPayload } from './types/jwt-payload.type.js';
import type { CompanyRole } from '../generated/prisma/enums.js';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokensService: TokensService,
  ) {}

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
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('This account has been deactivated');
    }

    const tokens = await this.issueTokens({ sub: user.id, email: user.email });
    return { user, tokens };
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
        },
      }),
    ]);

    const accessToken = this.tokensService.signAccessToken({ sub: user.id, email: user.email });
    return { accessToken, refreshToken: newRefreshToken };
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

  async switchCompany(userId: string, userEmail: string, companyId: string): Promise<string> {
    const membership = await this.prisma.companyMembership.findUnique({
      where: { userId_companyId: { userId, companyId } },
    });
    if (!membership) {
      throw new UnauthorizedException('You are not a member of this company');
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
      },
    });

    return { accessToken, refreshToken };
  }
}
