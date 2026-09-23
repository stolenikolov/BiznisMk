import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { EmployeeMessagesService } from './employee-messages.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { MailMessage, MailService } from '../mail/mail.service.js';

const COMPANY = 'company-1';
const SENDER = { userId: 'user-1', email: 'stole@devshop.mk' };

const team = [
  { id: 'ana', firstName: 'Ана', lastName: 'Петровска', email: 'ana@gmail.com', companyId: COMPANY },
  { id: 'marko', firstName: 'Марко', lastName: 'Марковски', email: 'marko@gmail.com', companyId: COMPANY },
  { id: 'stranger', firstName: 'Туѓ', lastName: 'Вработен', email: 'x@other.mk', companyId: 'company-2' },
];

function serviceWith(company: { emailSenderName?: string | null; emailReplyTo?: string | null } = {}) {
  const prisma = {
    company: {
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({ name: 'DevShop', emailSenderName: null, emailReplyTo: null, ...company }),
    },
    user: { findUniqueOrThrow: vi.fn().mockResolvedValue({ firstName: 'Столе', lastName: 'Николов' }) },
    employee: {
      findMany: vi.fn(async ({ where }: { where: { companyId: string; id: { in: string[] } } }) =>
        team.filter((employee) => employee.companyId === where.companyId && where.id.in.includes(employee.id)),
      ),
    },
  };
  const sentMail: MailMessage[] = [];
  const mail = {
    sendAll: vi.fn(async <T>(items: readonly T[], compose: (item: T) => MailMessage) => {
      sentMail.push(...items.map(compose));
      return { mode: 'smtp' as const, sent: [...items], failed: [] as T[] };
    }),
  };
  const service = new EmployeeMessagesService(prisma as unknown as PrismaService, mail as unknown as MailService);
  return { service, prisma, mail, sentMail };
}

const dto = (employeeIds: string[]) => ({ employeeIds, subject: 'Собир во петок', body: 'Во 16:00.' });

describe('EmployeeMessagesService.send', () => {
  it('sends one email per chosen employee, from the company, with replies to the sender', async () => {
    const { service, sentMail } = serviceWith();

    const result = await service.send(COMPANY, SENDER, dto(['ana', 'marko']));

    expect(result).toEqual({ mode: 'smtp', sent: 2, failed: [] });
    expect(sentMail).toHaveLength(2);
    expect(sentMail.map((message) => message.to)).toEqual(['ana@gmail.com', 'marko@gmail.com']);
    for (const message of sentMail) {
      // Nobody's email names anyone else.
      expect(message.to).not.toContain(',');
      expect(message).toMatchObject({ replyTo: 'stole@devshop.mk', fromName: 'DevShop', subject: 'Собир во петок' });
      expect(message.text).toContain('— Столе Николов, DevShop');
    }
  });

  it('uses the sender name and reply address the company set in Settings', async () => {
    const { service, sentMail } = serviceWith({ emailSenderName: 'DevShop Тим', emailReplyTo: 'info@devshop.mk' });

    await service.send(COMPANY, SENDER, dto(['ana']));

    expect(sentMail[0]).toMatchObject({ fromName: 'DevShop Тим', replyTo: 'info@devshop.mk' });
    expect(sentMail[0]!.text).toContain('одговорот стигнува до info@devshop.mk.');
  });

  it('refuses another company’s employee and sends nothing at all', async () => {
    const { service, mail } = serviceWith();

    await expect(service.send(COMPANY, SENDER, dto(['ana', 'stranger']))).rejects.toBeInstanceOf(NotFoundException);
    expect(mail.sendAll).not.toHaveBeenCalled();
  });

  it('names the employees the email could not reach', async () => {
    const { service, mail } = serviceWith();
    mail.sendAll.mockImplementationOnce(async <T>(items: readonly T[]) => ({
      mode: 'smtp' as const,
      sent: items.slice(1),
      failed: items.slice(0, 1),
    }));

    const result = await service.send(COMPANY, SENDER, dto(['ana', 'marko']));

    expect(result).toEqual({ mode: 'smtp', sent: 1, failed: [{ employeeId: 'ana', name: 'Ана Петровска' }] });
  });
});
