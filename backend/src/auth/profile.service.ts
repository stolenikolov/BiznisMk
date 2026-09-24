import { ConflictException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { hashToken } from './auth.service.js';
import { renderAccountChangedEmail } from './account-emails.js';
import { TrustedDevicesService } from './two-factor/trusted-devices.service.js';
import { inBackground } from '../common/background.js';
import type { User } from '../generated/prisma/client.js';
import type { UpdateProfileDto } from './dto/profile.dto.js';

export interface ProfileUpdate {
  user: User;
  emailChanged: boolean;
  passwordChanged: boolean;
}

/**
 * The signed-in user changing their own account from one form: name, login
 * address and password.
 *
 * It does not ask for the current password — the owner chose a plain form.
 * What guards the account instead: a changed password signs out every other
 * session, and a changed address or password is announced by email (a new
 * address to the old one), with a link to set a new password at once.
 */
@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    config: ConfigService,
    private readonly trustedDevices: TrustedDevicesService,
  ) {
    this.appUrl = config.getOrThrow<string>('app.appUrl');
  }

  async update(userId: string, dto: UpdateProfileDto, currentRefreshToken?: string): Promise<ProfileUpdate> {
    const before = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const emailChanged = dto.email !== before.email;
    const passwordChanged = dto.password !== undefined;

    if (emailChanged) {
      const taken = await this.prisma.user.findUnique({ where: { email: dto.email }, select: { id: true } });
      if (taken) throw emailTaken();
    }

    const passwordHash = passwordChanged ? await argon2.hash(dto.password!) : undefined;
    const keep = currentRefreshToken ? hashToken(currentRefreshToken) : undefined;

    let user: User;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: userId },
          data: { firstName: dto.firstName, lastName: dto.lastName, email: dto.email, passwordHash },
        });
        // A new password signs out every session but this one.
        if (passwordChanged) {
          await tx.refreshToken.updateMany({
            where: { userId, revokedAt: null, ...(keep ? { tokenHash: { not: keep } } : {}) },
            data: { revokedAt: new Date() },
          });
        }
        return updated;
      });
    } catch (error) {
      // Someone registered the address between the check and the write.
      if ((error as { code?: string }).code === 'P2002') throw emailTaken();
      throw error;
    }

    // A new password also ends every "remember this device": a browser trusted
    // under the old one has to pass the code again.
    if (passwordChanged) await this.trustedDevices.revokeAll(userId, 'PASSWORD_CHANGED');

    const forgotLink = `${this.appUrl}/forgot-password`;
    if (emailChanged) {
      this.notify(
        before.email,
        renderAccountChangedEmail({ firstName: user.firstName, change: 'email', newEmail: user.email, forgotLink }),
      );
    }
    if (passwordChanged) {
      this.notify(user.email, renderAccountChangedEmail({ firstName: user.firstName, change: 'password', forgotLink }));
    }

    return { user, emailChanged, passwordChanged };
  }

  /**
   * Checks a password typed to confirm a sensitive action. A wrong one is a
   * 403 with a code, not a 401: the session itself is fine, and a 401 would
   * send the client off to refresh a token that was never the problem.
   */
  async assertPassword(userId: string, password: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await argon2.verify(user.passwordHash, password))) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        errorCode: 'WRONG_PASSWORD',
        message: 'The current password is not correct',
      });
    }
    return user;
  }

  /** In the background: the change is saved whether or not the notice goes out. */
  private notify(to: string, email: { subject: string; text: string; html: string }): void {
    inBackground(
      this.mail
        .send({ to, fromName: 'BiznisMk', ...email })
        .catch((error: unknown) => this.logger.error(`Could not send an account notice: ${String(error)}`)),
    );
  }
}

function emailTaken() {
  return new ConflictException({
    statusCode: 409,
    error: 'Conflict',
    errorCode: 'EMAIL_TAKEN',
    message: 'An account with this email already exists',
  });
}
