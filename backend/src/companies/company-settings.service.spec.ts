import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CompanySettingsService } from './company-settings.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ProfileService } from '../auth/profile.service.js';
import type { MailService } from '../mail/mail.service.js';

const COMPANY = 'company-1';
const USER = 'user-1';

const stored = {
  id: COMPANY,
  name: 'DevShop',
  embs: '7654321',
  edb: '4030012345678',
  legalForm: 'DOOEL',
  registeredAddress: 'Партизанска 1, Скопје',
  isVatPayer: true,
  defaultVatRate: { toNumber: () => 18 },
  phone: null,
  website: null,
  paydayDayOfMonth: null,
  emailSenderName: null,
  emailReplyTo: null,
};

function serviceWith({ passwordOk = true, otherCompanies = 0 } = {}) {
  const tx = {
    company: { delete: vi.fn(async () => stored) },
    companyMembership: { count: vi.fn(async () => otherCompanies) },
    user: { delete: vi.fn(async () => ({})) },
  };
  const prisma = {
    company: {
      findUniqueOrThrow: vi.fn(async () => stored),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...stored,
        ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)),
        defaultVatRate: { toNumber: () => (data.defaultVatRate as number | undefined) ?? 18 },
      })),
    },
    $transaction: vi.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)),
  };
  const profile = {
    assertPassword: vi.fn(async () => {
      if (!passwordOk) throw new ForbiddenException({ errorCode: 'WRONG_PASSWORD' });
    }),
  };
  const mail = { fromAddress: 'raspored.biznis.mk@gmail.com', mode: 'smtp' };
  const service = new CompanySettingsService(
    prisma as unknown as PrismaService,
    profile as unknown as ProfileService,
    mail as unknown as MailService,
  );
  return { service, prisma, tx, profile };
}

describe('CompanySettingsService', () => {
  it('reads the settings with the VAT rate as a number, and where emails come from', async () => {
    const { service } = serviceWith();

    const result = await service.get(COMPANY);

    expect(result.settings).toMatchObject({ name: 'DevShop', edb: '4030012345678', defaultVatRate: 18 });
    expect(result.mail).toEqual({ fromAddress: 'raspored.biznis.mk@gmail.com', isDelivering: true });
  });

  it('writes only what was sent, and clears an optional field sent as null', async () => {
    const { service, prisma } = serviceWith();

    await service.update(COMPANY, { paydayDayOfMonth: 25, website: null });

    const data = prisma.company.update.mock.calls[0]![0].data;
    expect(Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))).toEqual({
      paydayDayOfMonth: 25,
      website: null,
    });
  });

  describe('close', () => {
    it('deletes the company and, with no other company left, the user too', async () => {
      const { service, tx } = serviceWith();

      expect(await service.close(COMPANY, USER, { password: 'secret', confirmName: 'devshop' })).toEqual({
        userDeleted: true,
      });
      expect(tx.company.delete).toHaveBeenCalledWith({ where: { id: COMPANY } });
      expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: USER } });
    });

    it('keeps the login of someone who still belongs to another company', async () => {
      const { service, tx } = serviceWith({ otherCompanies: 1 });

      expect(await service.close(COMPANY, USER, { password: 'secret', confirmName: 'DevShop' })).toEqual({
        userDeleted: false,
      });
      expect(tx.user.delete).not.toHaveBeenCalled();
    });

    it('deletes nothing with the wrong password', async () => {
      const { service, prisma } = serviceWith({ passwordOk: false });

      await expect(service.close(COMPANY, USER, { password: 'wrong', confirmName: 'DevShop' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('deletes nothing when the typed name is not the company’s', async () => {
      const { service, prisma } = serviceWith();

      const error = await service
        .close(COMPANY, USER, { password: 'secret', confirmName: 'DevShp' })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({ errorCode: 'CONFIRM_NAME_MISMATCH' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
