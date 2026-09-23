import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MailService } from '../../mail/mail.service.js';
import { AuditAction, AuditService } from '../../audit/audit.service.js';
import { TwoFactorPurpose } from '../../generated/prisma/enums.js';
import type { AuthRequestContext } from '../request-context.js';
import { TrustedDevicesService } from './trusted-devices.service.js';
import { renderTwoFactorAlertEmail, renderTwoFactorCodeEmail, type EmailLocale } from './two-factor-emails.js';
import {
  canResend,
  challengeState,
  codeMatches,
  CODE_TTL_MS,
  deriveCodeKey,
  generateCode,
  hashCode,
  maskEmail,
  MAX_ATTEMPTS,
  resendAvailableAt,
} from './two-factor-code.js';

/** What the client needs to show the "enter the code" step. */
export interface ChallengeStarted {
  challengeId: string;
  /** "s***v@gmail.com": where the code went, without spelling the address out. */
  maskedEmail: string;
  /** ISO time from which "send again" works. */
  resendAvailableAt: string;
}

export interface TwoFactorStatus {
  enabled: boolean;
  enabledAt: string | null;
}

type CodeUser = { id: string; email: string; firstName: string };

type ChallengeRow = {
  id: string;
  userId: string;
  purpose: TwoFactorPurpose;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  lastSentAt: Date;
};

/**
 * Email two-factor: sending codes, checking them, and switching the feature
 * on and off for a user.
 *
 * A challenge is one emailed code. It is checked by id for signing in —
 * nobody is signed in yet, so there is no user to look it up by — and as the
 * user's newest open challenge for switching two-factor on or off. Either way
 * the same rules hold: ten minutes, once, five wrong guesses.
 */
@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);
  private readonly key: Buffer;
  private readonly logCodes: boolean;
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly trustedDevices: TrustedDevicesService,
    config: ConfigService,
  ) {
    this.key = deriveCodeKey(config.getOrThrow<string>('app.twoFactorSecret'));
    this.logCodes = config.get<string>('app.nodeEnv') === 'development';
    this.appUrl = config.getOrThrow<string>('app.appUrl');
  }

  // Challenges -------------------------------------------------------------------

  /** Emails a new code. Any older open challenge for the same user and purpose stops working. */
  async start(
    user: CodeUser,
    purpose: TwoFactorPurpose,
    context: AuthRequestContext,
    now = new Date(),
  ): Promise<ChallengeStarted> {
    const code = generateCode();
    const expiresAt = new Date(now.getTime() + CODE_TTL_MS);

    const [, challenge] = await this.prisma.$transaction([
      this.prisma.twoFactorChallenge.updateMany({
        where: { userId: user.id, purpose, consumedAt: null },
        data: { consumedAt: now },
      }),
      this.prisma.twoFactorChallenge.create({
        data: {
          userId: user.id,
          purpose,
          codeHash: hashCode(this.key, { userId: user.id, purpose }, code),
          expiresAt,
          lastSentAt: now,
          ip: context.ip ?? null,
          userAgent: context.userAgent ?? null,
        },
        select: { id: true },
      }),
    ]);

    await this.sendCode(user, purpose, code, expiresAt, context.locale);
    return { challengeId: challenge.id, maskedEmail: maskEmail(user.email), resendAvailableAt: resendAvailableAt(now).toISOString() };
  }

  /**
   * A fresh code for a sign-in challenge, at most once a minute. The new code
   * replaces the old one and gets its own ten minutes; wrong guesses already
   * made still count, so resending does not buy more of them.
   */
  async resendLogin(challengeId: string, context: AuthRequestContext, now = new Date()): Promise<ChallengeStarted> {
    const challenge = await this.prisma.twoFactorChallenge.findUnique({
      where: { id: challengeId },
      include: { user: { select: { id: true, email: true, firstName: true } } },
    });
    if (!challenge || challenge.purpose !== TwoFactorPurpose.LOGIN) throw codeExpired();

    const state = challengeState(challenge, now);
    if (state === 'exhausted') throw tooManyAttempts();
    if (state === 'consumed') throw codeExpired();
    if (!canResend(challenge.lastSentAt, now)) throw resendTooSoon(resendAvailableAt(challenge.lastSentAt));

    const code = generateCode();
    const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
    const { count } = await this.prisma.twoFactorChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null, attempts: { lt: MAX_ATTEMPTS } },
      data: {
        codeHash: hashCode(this.key, { userId: challenge.userId, purpose: challenge.purpose }, code),
        expiresAt,
        lastSentAt: now,
      },
    });
    if (count === 0) throw codeExpired();

    await this.sendCode(challenge.user, challenge.purpose, code, expiresAt, context.locale);
    return {
      challengeId: challenge.id,
      maskedEmail: maskEmail(challenge.user.email),
      resendAvailableAt: resendAvailableAt(now).toISOString(),
    };
  }

  /** Checks a sign-in code; returns whose it was. */
  async verifyLogin(challengeId: string, code: string, context: AuthRequestContext, now = new Date()): Promise<string> {
    const challenge = await this.prisma.twoFactorChallenge.findUnique({ where: { id: challengeId } });
    // An unknown id reads exactly like an expired one: nothing to learn from it.
    if (!challenge || challenge.purpose !== TwoFactorPurpose.LOGIN) throw codeExpired();
    return this.check(challenge, code, context, now);
  }

  // Switching two-factor on and off ----------------------------------------------------

  async status(userId: string): Promise<TwoFactorStatus> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { twoFactorEnabled: true, twoFactorEnabledAt: true },
    });
    return { enabled: user.twoFactorEnabled, enabledAt: user.twoFactorEnabledAt?.toISOString() ?? null };
  }

  async startEnable(userId: string, context: AuthRequestContext, now = new Date()): Promise<ChallengeStarted> {
    const user = await this.loadUser(userId);
    if (user.twoFactorEnabled) throw alreadyEnabled();
    await this.assertCooldown(userId, TwoFactorPurpose.ENABLE, now);
    return this.start(user, TwoFactorPurpose.ENABLE, context, now);
  }

  /** Turns two-factor on once the emailed code proves the address is really theirs. */
  async confirmEnable(userId: string, code: string, context: AuthRequestContext, now = new Date()): Promise<TwoFactorStatus> {
    const user = await this.loadUser(userId);
    if (user.twoFactorEnabled) throw alreadyEnabled();
    await this.checkLatest(userId, TwoFactorPurpose.ENABLE, code, context, now);

    await this.prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: true, twoFactorEnabledAt: now } });
    await this.audit.record({ userId, action: AuditAction.TWO_FACTOR_ENABLED, ...context });
    this.sendAlert(user, 'enabled', context.locale);
    return { enabled: true, enabledAt: now.toISOString() };
  }

  async startDisable(userId: string, context: AuthRequestContext, now = new Date()): Promise<ChallengeStarted> {
    const user = await this.loadUser(userId);
    if (!user.twoFactorEnabled) throw notEnabled();
    await this.assertCooldown(userId, TwoFactorPurpose.DISABLE, now);
    return this.start(user, TwoFactorPurpose.DISABLE, context, now);
  }

  /**
   * Turns two-factor off and forgets every trusted device. The caller checks
   * the password first; this checks the emailed code, so both a stolen
   * password and a stolen session fall short on their own.
   */
  async disable(userId: string, code: string, context: AuthRequestContext, now = new Date()): Promise<TwoFactorStatus> {
    const user = await this.loadUser(userId);
    if (!user.twoFactorEnabled) throw notEnabled();
    await this.checkLatest(userId, TwoFactorPurpose.DISABLE, code, context, now);

    await this.prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: false, twoFactorEnabledAt: null } });
    await this.trustedDevices.revokeAll(userId, 'TWO_FACTOR_DISABLED', context);
    await this.audit.record({ userId, action: AuditAction.TWO_FACTOR_DISABLED, ...context });
    this.sendAlert(user, 'disabled', context.locale);
    return { enabled: false, enabledAt: null };
  }

  // Internals ------------------------------------------------------------------------

  private async loadUser(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, firstName: true, twoFactorEnabled: true },
    });
  }

  /** "Send again" for the settings flows goes through start; the minute between codes still holds. */
  private async assertCooldown(userId: string, purpose: TwoFactorPurpose, now: Date): Promise<void> {
    const latest = await this.prisma.twoFactorChallenge.findFirst({
      where: { userId, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { lastSentAt: true },
    });
    if (latest && !canResend(latest.lastSentAt, now)) throw resendTooSoon(resendAvailableAt(latest.lastSentAt));
  }

  private async checkLatest(
    userId: string,
    purpose: TwoFactorPurpose,
    code: string,
    context: AuthRequestContext,
    now: Date,
  ): Promise<void> {
    const challenge = await this.prisma.twoFactorChallenge.findFirst({
      where: { userId, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge) throw codeExpired();
    await this.check(challenge, code, context, now);
  }

  /**
   * The one place a code is judged. A wrong guess is counted before anything
   * is answered, with a conditional update, so parallel guesses cannot slip
   * past the limit; a right one is claimed the same way, so it works once.
   */
  private async check(challenge: ChallengeRow, code: string, context: AuthRequestContext, now: Date): Promise<string> {
    const state = challengeState(challenge, now);
    if (state === 'exhausted') throw tooManyAttempts();
    if (state !== 'open') throw codeExpired();

    const binding = { userId: challenge.userId, purpose: challenge.purpose };
    if (!codeMatches(this.key, binding, code, challenge.codeHash)) {
      const counted = await this.prisma.twoFactorChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null, attempts: { lt: MAX_ATTEMPTS } },
        data: { attempts: { increment: 1 } },
      });
      if (counted.count === 0) throw tooManyAttempts();

      const { attempts } = await this.prisma.twoFactorChallenge.findUniqueOrThrow({
        where: { id: challenge.id },
        select: { attempts: true },
      });
      if (attempts >= MAX_ATTEMPTS) {
        await this.audit.record({
          userId: challenge.userId,
          action: AuditAction.TWO_FACTOR_ATTEMPTS_EXCEEDED,
          metadata: { challengeId: challenge.id, purpose: challenge.purpose },
          ...context,
        });
        throw tooManyAttempts();
      }
      throw invalidCode(MAX_ATTEMPTS - attempts);
    }

    const claimed = await this.prisma.twoFactorChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null, attempts: { lt: MAX_ATTEMPTS }, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (claimed.count === 0) throw codeExpired();
    return challenge.userId;
  }

  /**
   * Sends the code and waits for it: the person is looking at the screen that
   * asks for it. A failure is logged, not thrown — the challenge stands, and
   * "send again" is the way forward.
   */
  private async sendCode(
    user: CodeUser,
    purpose: TwoFactorPurpose,
    code: string,
    expiresAt: Date,
    locale: EmailLocale,
  ): Promise<void> {
    if (this.logCodes) {
      this.logger.log(`[development] ${purpose} code for ${maskEmail(user.email)}: ${code}`);
    }
    try {
      await this.mail.send({
        to: user.email,
        fromName: 'BiznisMk',
        ...renderTwoFactorCodeEmail({ firstName: user.firstName, code, purpose, expiresAt, locale }),
      });
    } catch (error) {
      this.logger.error(`Could not send a ${purpose} code to ${maskEmail(user.email)}: ${String(error)}`);
    }
  }

  /** In the background: the change is made whether or not the notice goes out. */
  private sendAlert(user: CodeUser, change: 'enabled' | 'disabled', locale: EmailLocale): void {
    void this.mail
      .send({
        to: user.email,
        fromName: 'BiznisMk',
        ...renderTwoFactorAlertEmail({
          firstName: user.firstName,
          change,
          forgotLink: `${this.appUrl}/forgot-password`,
          locale,
        }),
      })
      .catch((error: unknown) => this.logger.error(`Could not send a two-factor notice: ${String(error)}`));
  }
}

// Errors: each carries an errorCode the frontend turns into its own message.

function twoFactorError(status: HttpStatus, errorCode: string, message: string, extra: Record<string, unknown> = {}) {
  return new HttpException({ statusCode: status, errorCode, message, ...extra }, status);
}

export function invalidCode(attemptsLeft: number) {
  return twoFactorError(HttpStatus.BAD_REQUEST, 'TWO_FACTOR_CODE_INVALID', 'The code is not correct', { attemptsLeft });
}

export function codeExpired() {
  return twoFactorError(
    HttpStatus.BAD_REQUEST,
    'TWO_FACTOR_CODE_EXPIRED',
    'This code has expired or was already used; ask for a new one',
  );
}

export function tooManyAttempts() {
  return twoFactorError(
    HttpStatus.BAD_REQUEST,
    'TWO_FACTOR_TOO_MANY_ATTEMPTS',
    'Too many wrong codes; start again to get a new one',
  );
}

export function resendTooSoon(availableAt: Date) {
  return twoFactorError(HttpStatus.TOO_MANY_REQUESTS, 'TWO_FACTOR_RESEND_TOO_SOON', 'Wait before asking for another code', {
    resendAvailableAt: availableAt.toISOString(),
  });
}

function alreadyEnabled() {
  return twoFactorError(HttpStatus.CONFLICT, 'TWO_FACTOR_ALREADY_ENABLED', 'Two-factor authentication is already on');
}

function notEnabled() {
  return twoFactorError(HttpStatus.CONFLICT, 'TWO_FACTOR_NOT_ENABLED', 'Two-factor authentication is not on');
}
