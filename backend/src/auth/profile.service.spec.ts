import { describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { ProfileService } from './profile.service.js';
import { hashToken } from './auth.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { TrustedDevicesService } from './two-factor/trusted-devices.service.js';
import type { MailMessage, MailService } from '../mail/mail.service.js';
import type { ConfigService } from '@nestjs/config';

const USER = 'user-1';

async function serviceWith({ emailTakenBy = null as string | null } = {}) {
  const user = {
    id: USER,
    email: 'stole@devshop.mk',
    firstName: 'Столе',
    lastName: 'Николов',
    passwordHash: await argon2.hash('correct-horse'),
  };
  const tx = {
    user: { update: vi.fn(async ({ data }: { data: object }) => ({ ...user, ...data })) },
    refreshToken: { updateMany: vi.fn(async () => ({ count: 2 })) },
  };
  const prisma = {
    user: {
      findUniqueOrThrow: vi.fn(async () => user),
      findUnique: vi.fn(async () => (emailTakenBy ? { id: emailTakenBy } : null)),
    },
    $transaction: vi.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)),
  };
  const sent: MailMessage[] = [];
  const mail = { send: vi.fn(async (message: MailMessage) => void sent.push(message)) };
  const config = { getOrThrow: () => 'http://localhost:5173' };
  const trustedDevices = { revokeAll: vi.fn(async () => 0) };
  const service = new ProfileService(
    prisma as unknown as PrismaService,
    mail as unknown as MailService,
    config as unknown as ConfigService,
    trustedDevices as unknown as TrustedDevicesService,
  );
  return { service, prisma, tx, sent, trustedDevices };
}

const form = { firstName: 'Столе', lastName: 'Николов', email: 'stole@devshop.mk' };

describe('ProfileService.update', () => {
  it('saves names without touching the password or any session, and tells nobody', async () => {
    const { service, tx, sent } = await serviceWith();

    const result = await service.update(USER, { ...form, firstName: 'Стојан' });

    expect(result).toMatchObject({ emailChanged: false, passwordChanged: false });
    expect(tx.user.update.mock.calls[0]![0].data).toMatchObject({ firstName: 'Стојан', passwordHash: undefined });
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });

  it('changes the login address without the current password, and tells the old address', async () => {
    const { service, sent } = await serviceWith();

    const result = await service.update(USER, { ...form, email: 'nov@devshop.mk' });

    expect(result.emailChanged).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'stole@devshop.mk', subject: 'Мејлот за најава на BiznisMk е сменет' });
    expect(sent[0]!.text).toContain('nov@devshop.mk');
    expect(sent[0]!.text).toContain('http://localhost:5173/forgot-password');
  });

  it('refuses an address another account already uses', async () => {
    const { service, tx } = await serviceWith({ emailTakenBy: 'user-2' });

    await expect(service.update(USER, { ...form, email: 'zafateno@devshop.mk' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('sets a new password, signs out every other session, and says so by email', async () => {
    const { service, tx, sent } = await serviceWith();

    const result = await service.update(USER, { ...form, password: 'battery-staple' }, 'this-token');

    expect(result.passwordChanged).toBe(true);
    const { passwordHash } = tx.user.update.mock.calls[0]![0].data as { passwordHash: string };
    expect(await argon2.verify(passwordHash, 'battery-staple')).toBe(true);
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: USER, revokedAt: null, tokenHash: { not: hashToken('this-token') } },
      data: { revokedAt: expect.any(Date) },
    });
    expect(sent.map((message) => message.subject)).toEqual(['Лозинката за BiznisMk е сменета']);
  });

  it('forgets every trusted device with a new password, and none without one', async () => {
    const changed = await serviceWith();
    await changed.service.update(USER, { ...form, password: 'battery-staple' }, 'this-token');
    expect(changed.trustedDevices.revokeAll).toHaveBeenCalledWith(USER, 'PASSWORD_CHANGED');

    const renamed = await serviceWith();
    await renamed.service.update(USER, form, 'this-token');
    expect(renamed.trustedDevices.revokeAll).not.toHaveBeenCalled();
  });
});

describe('ProfileService.assertPassword', () => {
  it('refuses a wrong password with a code, not a 401', async () => {
    const { service } = await serviceWith();

    const error = await service.assertPassword(USER, 'guess').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({ errorCode: 'WRONG_PASSWORD' });
  });
});
