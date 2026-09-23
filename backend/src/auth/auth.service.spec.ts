import { beforeEach, describe, expect, it, vi } from 'vitest';

// ESM exports cannot be spied on, so the password check is mocked wholesale.
vi.mock('argon2', () => ({
  verify: vi.fn().mockResolvedValue(true),
  hash: vi.fn().mockResolvedValue('hash'),
}));
import * as argon2 from 'argon2';
import { AuthService, hashToken, LOGIN_LOCK_MS, MAX_FAILED_LOGINS } from './auth.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { TokensService } from './tokens.service.js';
import type { MailService } from '../mail/mail.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { ConfigService } from '@nestjs/config';

/**
 * The company a session is working in travels in the access token. These cases
 * pin down when it gets attached: losing it leaves every company-scoped
 * endpoint answering "No active company selected" even though the user is
 * signed in and has a company.
 */

const USER = {
  id: 'user-1',
  email: 'ceo@example.com',
  firstName: 'Ана',
  isActive: true,
  passwordHash: 'hash',
  failedLoginCount: 0,
  lockedUntil: null as Date | null,
};

const config = { getOrThrow: () => 'http://localhost:5173' } as unknown as ConfigService;

function sideServices() {
  const mail = { send: vi.fn().mockResolvedValue(undefined) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  return { mail, audit, args: [mail as unknown as MailService, audit as unknown as AuditService, config] as const };
}

/** `sessionCompanyId` is the company the presented refresh token's session had entered. */
function build(memberships: { companyId: string; role: string }[], sessionCompanyId: string | null = null) {
  const signAccessToken = vi.fn().mockReturnValue('access-token');

  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(USER),
      findUniqueOrThrow: vi.fn().mockResolvedValue(USER),
    },
    companyMembership: {
      findMany: vi.fn().mockResolvedValue(memberships),
      findUnique: vi.fn(
        async ({ where }: { where: { userId_companyId: { companyId: string } } }) =>
          memberships.find((m) => m.companyId === where.userId_companyId.companyId) ?? null,
      ),
    },
    refreshToken: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'rt-1',
        userId: USER.id,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86_400_000),
        companyId: sessionCompanyId,
      }),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: vi.fn().mockResolvedValue([]),
  } as unknown as PrismaService;

  const tokens = {
    signAccessToken,
    signRefreshToken: vi.fn().mockReturnValue('refresh-token'),
    verifyRefreshToken: vi.fn().mockReturnValue({ sub: USER.id }),
    refreshExpiryDate: vi.fn().mockReturnValue(new Date(Date.now() + 86_400_000)),
  } as unknown as TokensService;

  return { service: new AuthService(prisma, tokens, ...sideServices().args), signAccessToken, prisma };
}

const ONE = [{ companyId: 'company-1', role: 'CEO' }];
const TWO = [
  { companyId: 'company-1', role: 'CEO' },
  { companyId: 'company-2', role: 'CEO' },
];

describe('AuthService — company claims on refresh', () => {
  it('keeps the company when the token is rotated', async () => {
    const { service, signAccessToken } = build(ONE);

    await service.refresh('raw-refresh-token');

    expect(signAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ sub: USER.id, companyId: 'company-1', role: 'CEO' }),
    );
  });

  it('leaves the choice open when the user belongs to several companies', async () => {
    const { service, signAccessToken } = build(TWO);

    await service.refresh('raw-refresh-token');

    const payload = signAccessToken.mock.calls[0]![0];
    expect(payload.companyId).toBeUndefined();
    expect(payload.role).toBeUndefined();
  });

  it('issues no company for a user who belongs to none', async () => {
    const { service, signAccessToken } = build([]);

    await service.refresh('raw-refresh-token');

    expect(signAccessToken.mock.calls[0]![0].companyId).toBeUndefined();
  });
});

describe('AuthService — the company a session picked', () => {
  it('keeps a multi-company user in the company they picked when the token is rotated', async () => {
    const { service, signAccessToken, prisma } = build(TWO, 'company-2');

    await service.refresh('raw-refresh-token');

    expect(signAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ sub: USER.id, companyId: 'company-2', role: 'CEO' }),
    );
    // …and the rotated session remembers it for the next rotation too.
    expect(prisma.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ companyId: 'company-2' }),
    });
  });

  it('drops a picked company the user no longer belongs to', async () => {
    const { service, signAccessToken, prisma } = build(TWO, 'company-gone');

    await service.refresh('raw-refresh-token');

    expect(signAccessToken.mock.calls[0]![0].companyId).toBeUndefined();
    expect(prisma.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ companyId: null }),
    });
  });

  it('records the choice on the caller’s own live session when switching', async () => {
    const { service, signAccessToken, prisma } = build(TWO);

    await service.switchCompany(USER.id, USER.email, 'company-2', 'raw-refresh-token');

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: hashToken('raw-refresh-token'), userId: USER.id, revokedAt: null },
      data: { companyId: 'company-2' },
    });
    expect(signAccessToken).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'company-2' }));
  });

  it('refuses a company the user does not belong to, without touching the session', async () => {
    const { service, prisma } = build(ONE);

    await expect(service.switchCompany(USER.id, USER.email, 'company-2', 'raw-refresh-token')).rejects.toThrow(
      'You are not a member of this company',
    );
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});

describe('AuthService — company claims on login', () => {
  it('signs a single-company user straight into that company', async () => {
    // The switcher is hidden below two companies, so nothing would ever call
    // /auth/switch-company for these users.
    const { service, signAccessToken } = build(ONE);
    await service.login({ email: USER.email, password: 'secret' } as never);

    expect(signAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'company-1', role: 'CEO' }),
    );
  });

  it('does not pick a company for a multi-company user', async () => {
    // The picker after sign-in asks them; the session stays company-less until then.
    const { service, signAccessToken, prisma } = build(TWO);
    await service.login({ email: USER.email, password: 'secret' } as never);

    expect(signAccessToken.mock.calls[0]![0].companyId).toBeUndefined();
    expect(prisma.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ companyId: null }),
    });
  });
});

describe('AuthService — locking an account after wrong passwords in a row', () => {
  const NOW = new Date('2026-09-23T12:00:00Z');

  /** A user row that remembers what the service does to it, the way the database would. */
  function buildLockable(start: Partial<typeof USER> = {}) {
    const row = { ...USER, ...start };
    const prisma = {
      user: {
        findUnique: vi.fn(async () => ({ ...row })),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          if (typeof data.failedLoginCount === 'object') row.failedLoginCount += 1;
          else Object.assign(row, data);
          return { ...row };
        }),
        updateMany: vi.fn(
          async ({ where, data }: { where: { failedLoginCount: { gte: number } }; data: Partial<typeof USER> }) => {
            if (row.failedLoginCount < where.failedLoginCount.gte) return { count: 0 };
            Object.assign(row, data);
            return { count: 1 };
          },
        ),
      },
    } as unknown as PrismaService;
    const { mail, audit, args } = sideServices();
    return { service: new AuthService(prisma, {} as TokensService, ...args), row, mail, audit };
  }

  const attempt = (service: AuthService, now = NOW) =>
    service.verifyCredentials({ email: USER.email, password: 'guess' } as never, { ip: '203.0.113.9' }, now);

  /** The HTTP status a sign-in attempt ends with, or 'ok'. */
  const outcome = (promise: Promise<unknown>) =>
    promise.then(
      () => 'ok' as const,
      (error: { getStatus: () => number }) => error.getStatus(),
    );

  beforeEach(() => {
    vi.mocked(argon2.verify).mockReset().mockResolvedValue(false as never);
    return () => vi.mocked(argon2.verify).mockResolvedValue(true as never);
  });

  it('locks on the fifth wrong password, not before, and tells the owner', async () => {
    const { service, row, mail, audit } = buildLockable();

    for (let i = 1; i < MAX_FAILED_LOGINS; i++) expect(await outcome(attempt(service))).toBe(401);
    expect(mail.send).not.toHaveBeenCalled();

    expect(await outcome(attempt(service))).toBe(423);
    expect(row.lockedUntil).toEqual(new Date(NOW.getTime() + LOGIN_LOCK_MS));
    expect(row.failedLoginCount).toBe(0);
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(mail.send.mock.calls[0]![0]).toMatchObject({ to: USER.email });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER.id, action: 'ACCOUNT_LOCKED', ip: '203.0.113.9' }),
    );
  });

  it('refuses even the right password while locked, without checking it', async () => {
    const { service } = buildLockable({ lockedUntil: new Date(NOW.getTime() + 60_000) });
    vi.mocked(argon2.verify).mockResolvedValue(true as never);

    expect(await outcome(attempt(service))).toBe(423);
    expect(argon2.verify).not.toHaveBeenCalled();
  });

  it('lets the right password in once the lock has passed, and clears it', async () => {
    const { service, row } = buildLockable({ lockedUntil: new Date(NOW.getTime() - 1), failedLoginCount: 2 });
    vi.mocked(argon2.verify).mockResolvedValue(true as never);

    expect(await outcome(attempt(service))).toBe('ok');
    expect(row).toMatchObject({ failedLoginCount: 0, lockedUntil: null });
  });

  it('counts only wrong passwords in a row: a right one starts the count again', async () => {
    const { service, row } = buildLockable({ failedLoginCount: MAX_FAILED_LOGINS - 1 });
    vi.mocked(argon2.verify).mockResolvedValueOnce(true as never);

    expect(await outcome(attempt(service))).toBe('ok');
    expect(await outcome(attempt(service))).toBe(401);
    expect(row).toMatchObject({ failedLoginCount: 1, lockedUntil: null });
  });
});
