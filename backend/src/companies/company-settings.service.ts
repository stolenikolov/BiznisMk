import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProfileService } from '../auth/profile.service.js';
import { MailService } from '../mail/mail.service.js';
import type { CompanyLegalForm } from '../generated/prisma/enums.js';
import type { CloseCompanyDto, UpdateCompanySettingsDto } from './dto/company-settings.dto.js';

export interface CompanySettingsView {
  id: string;
  name: string;
  /** Read-only: the company's legal identity. */
  embs: string;
  edb: string;
  legalForm: CompanyLegalForm;
  registeredAddress: string;
  isVatPayer: boolean;
  /** Percent, e.g. 18. */
  defaultVatRate: number;
  phone: string | null;
  website: string | null;
  paydayDayOfMonth: number | null;
  emailSenderName: string | null;
  emailReplyTo: string | null;
}

export interface MailStatus {
  /** The address emails to employees come from. */
  fromAddress: string;
  /** False when no mail server is configured, so nothing is actually sent. */
  isDelivering: boolean;
}

const SETTINGS_SELECT = {
  id: true,
  name: true,
  embs: true,
  edb: true,
  legalForm: true,
  registeredAddress: true,
  isVatPayer: true,
  defaultVatRate: true,
  phone: true,
  website: true,
  paydayDayOfMonth: true,
  emailSenderName: true,
  emailReplyTo: true,
} as const;

/** The company's own settings, and closing it for good. CEO-only at the controller. */
@Injectable()
export class CompanySettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profile: ProfileService,
    private readonly mail: MailService,
  ) {}

  async get(companyId: string): Promise<{ settings: CompanySettingsView; mail: MailStatus }> {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: SETTINGS_SELECT });
    return {
      settings: toView(company),
      mail: { fromAddress: this.mail.fromAddress, isDelivering: this.mail.mode === 'smtp' },
    };
  }

  /**
   * Applies whatever subset was sent. Fields left out keep their value; an
   * optional field sent as null is cleared. Invoices already issued keep the
   * VAT treatment they were issued with, whatever happens here.
   */
  async update(companyId: string, dto: UpdateCompanySettingsDto): Promise<CompanySettingsView> {
    const company = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        name: dto.name,
        legalForm: dto.legalForm,
        registeredAddress: dto.registeredAddress,
        isVatPayer: dto.isVatPayer,
        defaultVatRate: dto.defaultVatRate,
        phone: dto.phone,
        website: dto.website,
        paydayDayOfMonth: dto.paydayDayOfMonth,
        emailSenderName: dto.emailSenderName,
        emailReplyTo: dto.emailReplyTo,
      },
      select: SETTINGS_SELECT,
    });
    return toView(company);
  }

  /**
   * Deletes the company and everything it owns — employees, invoices, bank
   * accounts and transactions, schedules, notifications — through the
   * database's cascades, in one transaction. The user's login goes too, unless
   * they still belong to another company.
   *
   * Refused unless the password is right and the company's name is typed
   * exactly (case aside), so a stray click or an unattended session cannot
   * do it.
   */
  async close(companyId: string, userId: string, dto: CloseCompanyDto): Promise<{ userDeleted: boolean }> {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true } });
    await this.profile.assertPassword(userId, dto.password);

    if (dto.confirmName.toLocaleLowerCase('mk') !== company.name.trim().toLocaleLowerCase('mk')) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        errorCode: 'CONFIRM_NAME_MISMATCH',
        message: 'The typed name does not match the company name',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.company.delete({ where: { id: companyId } });

      const otherCompanies = await tx.companyMembership.count({ where: { userId } });
      if (otherCompanies > 0) return { userDeleted: false };

      await tx.user.delete({ where: { id: userId } });
      return { userDeleted: true };
    });
  }
}

function toView(company: {
  id: string;
  name: string;
  embs: string;
  edb: string;
  legalForm: CompanyLegalForm;
  registeredAddress: string;
  isVatPayer: boolean;
  defaultVatRate: { toNumber(): number };
  phone: string | null;
  website: string | null;
  paydayDayOfMonth: number | null;
  emailSenderName: string | null;
  emailReplyTo: string | null;
}): CompanySettingsView {
  return { ...company, defaultVatRate: company.defaultVatRate.toNumber() };
}
