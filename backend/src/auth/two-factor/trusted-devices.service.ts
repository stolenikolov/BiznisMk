import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditAction, AuditService, type RequestContext } from '../../audit/audit.service.js';
import { hashToken } from '../auth.service.js';
import { TRUSTED_DEVICE_TTL_MS } from './two-factor-code.js';

export interface TrustedDeviceView {
  id: string;
  userAgent: string;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  /** The browser this request came from. */
  current: boolean;
}

/** Why every device was forgotten at once; recorded with the revocation. */
export type RevokeAllReason = 'USER_REQUEST' | 'PASSWORD_CHANGED' | 'PASSWORD_RESET' | 'TWO_FACTOR_DISABLED';

/**
 * Browsers that may skip the emailed code for 30 days.
 *
 * The browser holds a random token in an httpOnly cookie and only its hash is
 * stored, so a copy of the table cannot be replayed as a cookie. A device is
 * trusted for one user only: the same cookie presented while signing in to
 * another account is ignored.
 */
@Injectable()
export class TrustedDevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Remembers this browser; returns the token to put in its cookie. */
  async trust(userId: string, context: RequestContext, now = new Date()): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + TRUSTED_DEVICE_TTL_MS);
    const device = await this.prisma.trustedDevice.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        userAgent: context.userAgent ?? '',
        ip: context.ip ?? null,
        expiresAt,
      },
      select: { id: true },
    });
    await this.audit.record({
      userId,
      action: AuditAction.TRUSTED_DEVICE_ADDED,
      metadata: { deviceId: device.id },
      ...context,
    });
    return { token, expiresAt };
  }

  /** Whether the cookie a browser sent marks it as trusted by this user; notes the use if so. */
  async isTrusted(userId: string, rawToken: string | undefined, now = new Date()): Promise<boolean> {
    if (!rawToken) return false;
    const device = await this.prisma.trustedDevice.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      select: { id: true, userId: true, expiresAt: true },
    });
    if (!device || device.userId !== userId || device.expiresAt.getTime() <= now.getTime()) return false;

    await this.prisma.trustedDevice.update({ where: { id: device.id }, data: { lastUsedAt: now } });
    return true;
  }

  async list(userId: string, currentRawToken: string | undefined, now = new Date()): Promise<TrustedDeviceView[]> {
    const currentHash = currentRawToken ? hashToken(currentRawToken) : null;
    const devices = await this.prisma.trustedDevice.findMany({
      where: { userId, expiresAt: { gt: now } },
      orderBy: { lastUsedAt: 'desc' },
    });
    return devices.map((device) => ({
      id: device.id,
      userAgent: device.userAgent,
      ip: device.ip,
      createdAt: device.createdAt.toISOString(),
      lastUsedAt: device.lastUsedAt.toISOString(),
      expiresAt: device.expiresAt.toISOString(),
      current: device.tokenHash === currentHash,
    }));
  }

  /** Forgets one device; scoped to its owner, so another user's id reads as not found. */
  async revoke(userId: string, deviceId: string, context: RequestContext): Promise<void> {
    const { count } = await this.prisma.trustedDevice.deleteMany({ where: { id: deviceId, userId } });
    if (count === 0) throw new NotFoundException('Trusted device not found');
    await this.audit.record({
      userId,
      action: AuditAction.TRUSTED_DEVICE_REVOKED,
      metadata: { deviceId },
      ...context,
    });
  }

  /** Forgets every device of a user. Recorded only when there was something to forget. */
  async revokeAll(userId: string, reason: RevokeAllReason, context: RequestContext = {}): Promise<number> {
    const { count } = await this.prisma.trustedDevice.deleteMany({ where: { userId } });
    if (count > 0) {
      await this.audit.record({
        userId,
        action: AuditAction.TRUSTED_DEVICE_REVOKED,
        metadata: { count, reason },
        ...context,
      });
    }
    return count;
  }
}
