import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { hashToken } from './auth.service.js';
import { renderPasswordResetEmail } from './account-emails.js';
import { inBackground } from '../common/background.js';
import { TrustedDevicesService } from './two-factor/trusted-devices.service.js';

/** How long a reset link works. The email says "1 час"; keep the two together. */
export const RESET_LINK_TTL_MS = 60 * 60 * 1000;

/** At most one reset email a minute per account, however often the form is sent. */
export const RESET_RESEND_AFTER_MS = 60 * 1000;

/**
 * "Forgot password": a one-time link by email, then a new password through it.
 *
 * Asking for a link answers the same way whether or not the address has an
 * account, and the email goes out in the background, so neither the reply nor
 * its timing tells anyone which addresses are registered.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    config: ConfigService,
    private readonly trustedDevices: TrustedDevicesService,
  ) {
    this.appUrl = config.getOrThrow<string>('app.appUrl');
  }

  /**
   * Issues a new link and emails it. Any earlier unused link stops working,
   * so only the newest email in the inbox is the one that works.
   */
  async request(email: string, now = new Date()): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, firstName: true },
    });
    if (!user) return;

    const recent = await this.prisma.passwordResetToken.findFirst({
      where: { userId: user.id, createdAt: { gt: new Date(now.getTime() - RESET_RESEND_AFTER_MS) } },
      select: { id: true },
    });
    if (recent) return;

    const token = randomBytes(32).toString('base64url');
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(now.getTime() + RESET_LINK_TTL_MS),
        },
      }),
    ]);

    const link = `${this.appUrl}/reset-password?token=${token}`;
    inBackground(
      this.mail
        .send({ to: user.email, fromName: 'BiznisMk', ...renderPasswordResetEmail({ firstName: user.firstName, link }) })
        .catch((error: unknown) => this.logger.error(`Could not send a password reset email: ${String(error)}`)),
    );
  }

  /**
   * Sets the new password through a link. The link is claimed in the same
   * transaction that changes the password, so two tabs submitting one link
   * cannot both succeed. Every session is signed out and every trusted
   * device forgotten: whoever had the old password is not signed in anywhere
   * any more, and cannot skip the code anywhere either.
   */
  async reset(token: string, password: string, now = new Date()): Promise<void> {
    const invalid = () =>
      new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        errorCode: 'RESET_LINK_INVALID',
        message: 'This link has expired or has already been used',
      });

    const stored = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { id: true, userId: true },
    });
    if (!stored) throw invalid();

    const passwordHash = await argon2.hash(password);

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: stored.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count === 0) throw invalid();

      // A new password is the way out of a lock, too.
      await tx.user.update({
        where: { id: stored.userId },
        data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
      });
      await tx.passwordResetToken.updateMany({ where: { userId: stored.userId, usedAt: null }, data: { usedAt: now } });
      await tx.refreshToken.updateMany({ where: { userId: stored.userId, revokedAt: null }, data: { revokedAt: now } });
    });

    // Whoever had the old password may also have ticked "remember this device".
    await this.trustedDevices.revokeAll(stored.userId, 'PASSWORD_RESET');
  }
}
