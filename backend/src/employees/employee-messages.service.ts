import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService, type MailMode } from '../mail/mail.service.js';
import { renderEmployeeMessage } from './employee-message-email.js';
import type { SendEmployeeMessageDto } from './dto/send-employee-message.dto.js';

export interface EmployeeMessageResult {
  /** `outbox`: no mail server is configured, so nothing actually left. */
  mode: MailMode;
  /** Employees the message went out to. */
  sent: number;
  /** Employees it could not be sent to, by name, so the sender can reach them another way. */
  failed: { employeeId: string; name: string }[];
}

/**
 * Written messages from the owner to the team, by email: employees do not log
 * in, so their inbox is the only place they can be reached.
 */
@Injectable()
export class EmployeeMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /**
   * One email per recipient, so nobody sees anyone else's address. It comes
   * from the company's chosen sender name, or the company itself, and replies
   * go to the company's reply address if it set one, otherwise straight to
   * the sender. Every id
   * has to be this company's employee; one that is not — another tenant's, or
   * someone removed meanwhile — fails the whole send before anything goes out.
   */
  async send(
    companyId: string,
    sender: { userId: string; email: string },
    dto: SendEmployeeMessageDto,
  ): Promise<EmployeeMessageResult> {
    const ids = [...new Set(dto.employeeIds)];

    const [company, user, employees] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { name: true, emailSenderName: true, emailReplyTo: true },
      }),
      this.prisma.user.findUniqueOrThrow({
        where: { id: sender.userId },
        select: { firstName: true, lastName: true },
      }),
      this.prisma.employee.findMany({
        where: { companyId, id: { in: ids } },
        select: { id: true, firstName: true, lastName: true, email: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
    ]);

    if (employees.length !== ids.length) {
      throw new NotFoundException('Some of the recipients are not employees of this company');
    }

    const senderName = `${user.firstName} ${user.lastName}`;
    const message = renderEmployeeMessage({
      companyName: company.name,
      senderName,
      replyTarget: company.emailReplyTo ?? senderName,
      subject: dto.subject,
      body: dto.body,
    });

    const result = await this.mail.sendAll(employees, (employee) => ({
      to: employee.email,
      replyTo: company.emailReplyTo ?? sender.email,
      fromName: company.emailSenderName ?? company.name,
      ...message,
    }));

    return {
      mode: result.mode,
      sent: result.sent.length,
      failed: result.failed.map((employee) => ({
        employeeId: employee.id,
        name: `${employee.firstName} ${employee.lastName}`,
      })),
    };
  }
}
