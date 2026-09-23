import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PasswordResetService, RESET_LINK_TTL_MS } from './password-reset.service.js';
import { hashToken } from './auth.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { TrustedDevicesService } from './two-factor/trusted-devices.service.js';
import type { MailMessage, MailService } from '../mail/mail.service.js';
import type { ConfigService } from '@nestjs/config';

const NOW = new Date('2026-09-18T12:00:00Z');
const USER = { id: 'user-1', email: 'stole@devshop.mk', firstName: 'Столе' };

interface StoredToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

function serviceWith({ userExists = true, tokens = [] as StoredToken[] } = {}) {
  const store = [...tokens];
  const matches = (token: StoredToken, where: Record<string, unknown>) =>
    (where.id === undefined || token.id === where.id) &&
    (where.userId === undefined || token.userId === where.userId) &&
    (!('usedAt' in where) || token.usedAt === where.usedAt) &&
    (where.expiresAt === undefined || token.expiresAt > (where.expiresAt as { gt: Date }).gt) &&
    (where.createdAt === undefined || token.createdAt > (where.createdAt as { gt: Date }).gt);

  const passwordResetToken = {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => store.find((t) => matches(t, where)) ?? null),
    findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) =>
      store.find((t) => t.tokenHash === where.tokenHash) ?? null,
    ),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: { usedAt: Date } }) => {
      const hit = store.filter((t) => matches(t, where));
      hit.forEach((t) => (t.usedAt = data.usedAt));
      return { count: hit.length };
    }),
    create: vi.fn(async ({ data }: { data: Omit<StoredToken, 'id' | 'usedAt' | 'createdAt'> }) => {
      const row = { id: `t-${store.length + 1}`, usedAt: null, createdAt: NOW, ...data };
      store.push(row);
      return row;
    }),
  };
  const user = { findUnique: vi.fn(async () => (userExists ? USER : null)), update: vi.fn(async () => USER) };
  const refreshToken = { updateMany: vi.fn(async () => ({ count: 3 })) };
  const client = { passwordResetToken, user, refreshToken };
  const prisma = {
    ...client,
    $transaction: vi.fn(async (work: unknown) =>
      typeof work === 'function' ? (work as (tx: typeof client) => Promise<unknown>)(client) : Promise.all(work as unknown[]),
    ),
  };

  const sent: MailMessage[] = [];
  const mail = { send: vi.fn(async (message: MailMessage) => void sent.push(message)) };
  const config = { getOrThrow: () => 'https://app.biznis.mk' };
  const trustedDevices = { revokeAll: vi.fn(async () => 0) };
  const service = new PasswordResetService(
    prisma as unknown as PrismaService,
    mail as unknown as MailService,
    config as unknown as ConfigService,
    trustedDevices as unknown as TrustedDevicesService,
  );
  return { service, store, sent, user, refreshToken, trustedDevices };
}

const token = (overrides: Partial<StoredToken> = {}): StoredToken => ({
  id: 't-old',
  userId: USER.id,
  tokenHash: hashToken('the-emailed-token-0123456789'),
  expiresAt: new Date(NOW.getTime() + RESET_LINK_TTL_MS),
  usedAt: null,
  createdAt: new Date(NOW.getTime() - 10 * 60 * 1000),
  ...overrides,
});

describe('PasswordResetService.request', () => {
  it('emails a one-hour link and keeps only the token’s hash', async () => {
    const { service, store, sent } = serviceWith();

    await service.request(USER.email, NOW);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: USER.email, fromName: 'BiznisMk', subject: 'Нова лозинка за BiznisMk' });
    const link = /https:\/\/app\.biznis\.mk\/reset-password\?token=([\w-]+)/.exec(sent[0]!.text)?.[1];
    expect(link).toBeDefined();
    expect(store).toHaveLength(1);
    expect(store[0]!.tokenHash).toBe(hashToken(link!));
    expect(store[0]!.tokenHash).not.toBe(link);
    expect(store[0]!.expiresAt).toEqual(new Date(NOW.getTime() + RESET_LINK_TTL_MS));
  });

  it('does nothing — and says nothing different — for an address with no account', async () => {
    const { service, store, sent } = serviceWith({ userExists: false });

    await expect(service.request('nobody@devshop.mk', NOW)).resolves.toBeUndefined();
    expect(store).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('sends at most one email a minute', async () => {
    const { service, sent } = serviceWith({ tokens: [token({ createdAt: new Date(NOW.getTime() - 20 * 1000) })] });

    await service.request(USER.email, NOW);

    expect(sent).toEqual([]);
  });

  it('retires the earlier link when a new one is sent', async () => {
    const { service, store } = serviceWith({ tokens: [token()] });

    await service.request(USER.email, NOW);

    expect(store.find((t) => t.id === 't-old')!.usedAt).toEqual(NOW);
    expect(store.filter((t) => t.usedAt === null)).toHaveLength(1);
  });
});

describe('PasswordResetService.reset', () => {
  it('sets the new password, spends the link, signs out every session and forgets every trusted device', async () => {
    const { service, store, user, refreshToken, trustedDevices } = serviceWith({ tokens: [token()] });

    await service.reset('the-emailed-token-0123456789', 'battery-staple', NOW);

    const { passwordHash } = (user.update.mock.calls[0] as unknown as [{ data: { passwordHash: string } }])[0].data;
    expect(await argon2.verify(passwordHash, 'battery-staple')).toBe(true);
    expect(store[0]!.usedAt).toEqual(NOW);
    expect(refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: USER.id, revokedAt: null },
      data: { revokedAt: NOW },
    });
    expect(trustedDevices.revokeAll).toHaveBeenCalledWith(USER.id, 'PASSWORD_RESET');
  });

  it.each([
    ['an unknown link', 'not-a-token-we-ever-issued', token()],
    ['a used link', 'the-emailed-token-0123456789', token({ usedAt: new Date(NOW.getTime() - 1000) })],
    ['an expired link', 'the-emailed-token-0123456789', token({ expiresAt: new Date(NOW.getTime() - 1000) })],
  ])('refuses %s and changes nothing', async (_case, presented, stored) => {
    const { service, user } = serviceWith({ tokens: [stored] });

    const error = await service.reset(presented, 'battery-staple', NOW).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({ errorCode: 'RESET_LINK_INVALID' });
    expect(user.update).not.toHaveBeenCalled();
  });
});
