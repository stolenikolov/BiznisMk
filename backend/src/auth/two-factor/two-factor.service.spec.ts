import { describe, expect, it, vi } from 'vitest';
import type { HttpException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { TwoFactorService } from './two-factor.service.js';
import { MAX_ATTEMPTS } from './two-factor-code.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { MailMessage, MailService } from '../../mail/mail.service.js';
import type { AuditService } from '../../audit/audit.service.js';
import type { TrustedDevicesService } from './trusted-devices.service.js';
import type { AuthRequestContext } from '../request-context.js';

const NOW = new Date('2026-09-19T10:00:00.000Z');
const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);
const CONTEXT: AuthRequestContext = { ip: '127.0.0.1', userAgent: 'vitest', locale: 'mk' };

interface Challenge {
  id: string;
  userId: string;
  purpose: 'LOGIN' | 'ENABLE' | 'DISABLE';
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  lastSentAt: Date;
  createdAt: Date;
}

type Where = {
  id?: string;
  userId?: string;
  purpose?: string;
  consumedAt?: null;
  attempts?: { lt: number };
  expiresAt?: { gt: Date };
};

/** The conditions the service puts on its updates, applied the way the database would. */
function matches(row: Challenge, where: Where): boolean {
  return (
    (where.id === undefined || row.id === where.id) &&
    (where.userId === undefined || row.userId === where.userId) &&
    (where.purpose === undefined || row.purpose === where.purpose) &&
    (!('consumedAt' in where) || row.consumedAt === null) &&
    (where.attempts === undefined || row.attempts < where.attempts.lt) &&
    (where.expiresAt === undefined || row.expiresAt.getTime() > where.expiresAt.gt.getTime())
  );
}

function setup(options: { twoFactorEnabled?: boolean } = {}) {
  const user = {
    id: 'user-ana',
    email: 'ana@firma.mk',
    firstName: 'Ана',
    twoFactorEnabled: options.twoFactorEnabled ?? false,
    twoFactorEnabledAt: options.twoFactorEnabled ? NOW : null,
  };
  const challenges: Challenge[] = [];
  let sequence = 0;

  const twoFactorChallenge = {
    create: vi.fn(async ({ data }: { data: Omit<Challenge, 'id' | 'attempts' | 'consumedAt' | 'createdAt'> }) => {
      const row: Challenge = { ...data, id: `ch${++sequence}`, attempts: 0, consumedAt: null, createdAt: at(sequence) };
      challenges.push(row);
      return { id: row.id };
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
      const hit = challenges.filter((row) => matches(row, where));
      for (const row of hit) {
        for (const [field, value] of Object.entries(data)) {
          if (field === 'attempts') row.attempts += (value as { increment: number }).increment;
          else (row as unknown as Record<string, unknown>)[field] = value;
        }
      }
      return { count: hit.length };
    }),
    findUnique: vi.fn(async ({ where, include }: { where: { id: string }; include?: unknown }) => {
      const row = challenges.find((c) => c.id === where.id);
      return row ? { ...row, ...(include ? { user } : {}) } : null;
    }),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => ({
      ...challenges.find((c) => c.id === where.id)!,
    })),
    findFirst: vi.fn(async ({ where }: { where: Where }) => {
      const open = challenges.filter((row) => matches(row, where));
      return open.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
    }),
  };

  const prisma = {
    twoFactorChallenge,
    user: {
      findUniqueOrThrow: vi.fn(async () => ({ ...user })),
      update: vi.fn(async ({ data }: { data: Partial<typeof user> }) => Object.assign(user, data)),
    },
    $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
  };

  const sent: MailMessage[] = [];
  const mail = { send: vi.fn(async (message: MailMessage) => void sent.push(message)) };
  const audit = { record: vi.fn(async () => undefined) };
  const trustedDevices = { revokeAll: vi.fn(async () => 2) };
  const config = {
    getOrThrow: (key: string) => (key === 'app.twoFactorSecret' ? 'test-two-factor-secret' : 'http://localhost:5173'),
    get: () => 'test',
  };

  const service = new TwoFactorService(
    prisma as unknown as PrismaService,
    mail as unknown as MailService,
    audit as unknown as AuditService,
    trustedDevices as unknown as TrustedDevicesService,
    config as unknown as ConfigService,
  );

  /** The code in the newest email, as the person would read it. */
  const lastCode = () => /\b(\d{6})\b/.exec(sent[sent.length - 1]!.text)![1]!;
  const wrong = (code: string) => (code === '000000' ? '111111' : '000000');

  return { service, user, challenges, sent, audit, trustedDevices, lastCode, wrong };
}

async function rejection(promise: Promise<unknown>) {
  const error = (await promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (caught: unknown) => caught,
  )) as HttpException;
  return { status: error.getStatus(), body: error.getResponse() as Record<string, unknown> };
}

describe('TwoFactorService.start', () => {
  it('emails a code, stores only its hash, and says where it went without spelling it out', async () => {
    const { service, user, challenges, sent, lastCode } = setup();

    const started = await service.start(user, 'LOGIN', CONTEXT, NOW);

    expect(started).toEqual({ challengeId: 'ch1', maskedEmail: 'a***a@firma.mk', resendAvailableAt: at(60).toISOString() });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('ana@firma.mk');
    expect(challenges[0]!.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(challenges[0]!.codeHash).not.toContain(lastCode());
    expect(challenges[0]!.expiresAt).toEqual(at(600));
  });

  it('writes the email in the language the person uses', async () => {
    const { service, user, sent } = setup();

    await service.start(user, 'LOGIN', { ...CONTEXT, locale: 'en' }, NOW);

    expect(sent[0]!.subject).toBe('Your BiznisMk sign-in code');
    expect(sent[0]!.html).toContain('lang="en"');
  });

  it('ends the older open challenge for the same purpose', async () => {
    const { service, user, lastCode } = setup();
    const first = await service.start(user, 'LOGIN', CONTEXT, NOW);
    const firstCode = lastCode();
    await service.start(user, 'LOGIN', CONTEXT, at(1));

    const { body } = await rejection(service.verifyLogin(first.challengeId, firstCode, CONTEXT, at(2)));
    expect(body.errorCode).toBe('TWO_FACTOR_CODE_EXPIRED');
  });
});

describe('TwoFactorService.verifyLogin', () => {
  it('accepts the emailed code once, and returns whose it was', async () => {
    const { service, user, lastCode } = setup();
    const { challengeId } = await service.start(user, 'LOGIN', CONTEXT, NOW);
    const code = lastCode();

    await expect(service.verifyLogin(challengeId, code, CONTEXT, at(30))).resolves.toBe('user-ana');

    const again = await rejection(service.verifyLogin(challengeId, code, CONTEXT, at(31)));
    expect(again.body.errorCode).toBe('TWO_FACTOR_CODE_EXPIRED');
  });

  it('counts a wrong code and says how many tries are left', async () => {
    const { service, user, challenges, lastCode, wrong } = setup();
    const { challengeId } = await service.start(user, 'LOGIN', CONTEXT, NOW);

    const { status, body } = await rejection(service.verifyLogin(challengeId, wrong(lastCode()), CONTEXT, at(5)));

    expect(status).toBe(400);
    expect(body).toMatchObject({ errorCode: 'TWO_FACTOR_CODE_INVALID', attemptsLeft: MAX_ATTEMPTS - 1 });
    expect(challenges[0]!.attempts).toBe(1);
  });

  it('dies on the fifth wrong code — even the right one is refused after — and records it', async () => {
    const { service, user, audit, lastCode, wrong } = setup();
    const { challengeId } = await service.start(user, 'LOGIN', CONTEXT, NOW);
    const code = lastCode();

    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
      const { body } = await rejection(service.verifyLogin(challengeId, wrong(code), CONTEXT, at(attempt)));
      expect(body.errorCode).toBe('TWO_FACTOR_CODE_INVALID');
    }
    const fifth = await rejection(service.verifyLogin(challengeId, wrong(code), CONTEXT, at(10)));
    expect(fifth.body.errorCode).toBe('TWO_FACTOR_TOO_MANY_ATTEMPTS');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-ana',
        action: 'TWO_FACTOR_ATTEMPTS_EXCEEDED',
        metadata: { challengeId, purpose: 'LOGIN' },
      }),
    );

    const right = await rejection(service.verifyLogin(challengeId, code, CONTEXT, at(11)));
    expect(right.body.errorCode).toBe('TWO_FACTOR_TOO_MANY_ATTEMPTS');
  });

  it('refuses the right code after ten minutes', async () => {
    const { service, user, lastCode } = setup();
    const { challengeId } = await service.start(user, 'LOGIN', CONTEXT, NOW);

    const { body } = await rejection(service.verifyLogin(challengeId, lastCode(), CONTEXT, at(600)));
    expect(body.errorCode).toBe('TWO_FACTOR_CODE_EXPIRED');
  });

  it('reads an unknown challenge exactly like an expired one', async () => {
    const { service } = setup();
    const { body } = await rejection(service.verifyLogin('nope', '123456', CONTEXT, NOW));
    expect(body.errorCode).toBe('TWO_FACTOR_CODE_EXPIRED');
  });

  it('never records the code anywhere but the email', async () => {
    const { service, user, audit, lastCode, wrong } = setup();
    const { challengeId } = await service.start(user, 'LOGIN', CONTEXT, NOW);
    const code = lastCode();
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      await rejection(service.verifyLogin(challengeId, wrong(code), CONTEXT, at(attempt + 1)));
    }
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain(code);
  });
});

describe('TwoFactorService.resendLogin', () => {
  it('waits a minute between codes', async () => {
    const { service, user } = setup();
    const { challengeId } = await service.start(user, 'LOGIN', CONTEXT, NOW);

    const { status, body } = await rejection(service.resendLogin(challengeId, CONTEXT, at(59)));
    expect(status).toBe(429);
    expect(body).toMatchObject({ errorCode: 'TWO_FACTOR_RESEND_TOO_SOON', resendAvailableAt: at(60).toISOString() });
  });

  it('sends a new code that replaces the old one, with its own ten minutes, and keeps the wrong guesses', async () => {
    const { service, user, challenges, sent, lastCode, wrong } = setup();
    const { challengeId } = await service.start(user, 'LOGIN', CONTEXT, NOW);
    const oldCode = lastCode();
    await rejection(service.verifyLogin(challengeId, wrong(oldCode), CONTEXT, at(10)));

    const resent = await service.resendLogin(challengeId, CONTEXT, at(60));
    const newCode = lastCode();

    expect(sent).toHaveLength(2);
    expect(resent.resendAvailableAt).toBe(at(120).toISOString());
    expect(challenges[0]!.expiresAt).toEqual(at(660));
    expect(challenges[0]!.attempts).toBe(1);
    if (newCode !== oldCode) {
      const { body } = await rejection(service.verifyLogin(challengeId, oldCode, CONTEXT, at(61)));
      expect(body.errorCode).toBe('TWO_FACTOR_CODE_INVALID');
    }
    await expect(service.verifyLogin(challengeId, newCode, CONTEXT, at(62))).resolves.toBe('user-ana');
  });

  it('will not revive a challenge that died of wrong guesses', async () => {
    const { service, user, lastCode, wrong } = setup();
    const { challengeId } = await service.start(user, 'LOGIN', CONTEXT, NOW);
    const code = lastCode();
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      await rejection(service.verifyLogin(challengeId, wrong(code), CONTEXT, at(attempt + 1)));
    }

    const { body } = await rejection(service.resendLogin(challengeId, CONTEXT, at(120)));
    expect(body.errorCode).toBe('TWO_FACTOR_TOO_MANY_ATTEMPTS');
  });
});

describe('TwoFactorService — switching it on and off', () => {
  it('turns on only with the emailed code, records it, and tells the owner', async () => {
    const { service, user, audit, sent, lastCode } = setup();

    await service.startEnable(user.id, CONTEXT, NOW);
    const status = await service.confirmEnable(user.id, lastCode(), CONTEXT, at(30));

    expect(status).toEqual({ enabled: true, enabledAt: at(30).toISOString() });
    expect(user.twoFactorEnabled).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'TWO_FACTOR_ENABLED' }));
    await vi.waitFor(() => expect(sent.map((message) => message.subject)).toContain('Двостепената заштита е вклучена'));
  });

  it('asks for a new code no sooner than a minute after the last one', async () => {
    const { service, user } = setup();
    await service.startEnable(user.id, CONTEXT, NOW);

    const { body } = await rejection(service.startEnable(user.id, CONTEXT, at(30)));
    expect(body.errorCode).toBe('TWO_FACTOR_RESEND_TOO_SOON');
    await expect(service.startEnable(user.id, CONTEXT, at(60))).resolves.toMatchObject({ challengeId: 'ch2' });
  });

  it('will not take a sign-in code to turn it on', async () => {
    const { service, user, lastCode } = setup();
    await service.start(user, 'LOGIN', CONTEXT, NOW);

    const { body } = await rejection(service.confirmEnable(user.id, lastCode(), CONTEXT, at(5)));
    expect(body.errorCode).toBe('TWO_FACTOR_CODE_EXPIRED');
  });

  it('turns off with the code, forgets every trusted device, records it, and tells the owner', async () => {
    const { service, user, audit, trustedDevices, sent, lastCode } = setup({ twoFactorEnabled: true });

    await service.startDisable(user.id, CONTEXT, NOW);
    const status = await service.disable(user.id, lastCode(), CONTEXT, at(30));

    expect(status).toEqual({ enabled: false, enabledAt: null });
    expect(user.twoFactorEnabled).toBe(false);
    expect(trustedDevices.revokeAll).toHaveBeenCalledWith(user.id, 'TWO_FACTOR_DISABLED', CONTEXT);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'TWO_FACTOR_DISABLED' }));
    await vi.waitFor(() => expect(sent.map((message) => message.subject)).toContain('Двостепената заштита е исклучена'));
  });

  it('refuses to turn on twice, or off when it is not on', async () => {
    const on = setup({ twoFactorEnabled: true });
    expect((await rejection(on.service.startEnable(on.user.id, CONTEXT, NOW))).body.errorCode).toBe(
      'TWO_FACTOR_ALREADY_ENABLED',
    );
    const off = setup();
    expect((await rejection(off.service.startDisable(off.user.id, CONTEXT, NOW))).body.errorCode).toBe(
      'TWO_FACTOR_NOT_ENABLED',
    );
  });
});
