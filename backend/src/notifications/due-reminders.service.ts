import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmployeeStatus, InvoiceStatus } from '../generated/prisma/enums.js';
import { NotificationsService, accountLabel } from './notifications.service.js';
import {
  collectDueReminders,
  creditLineCandidate,
  invoiceCandidate,
  paydayCandidate,
  type DueCandidate,
} from './due-reminders.js';
import {
  REMINDER_OFFSET_DAYS,
  reminderHorizonDays,
  startOfDay,
} from './notification-schedule.js';

/**
 * The daily sweep for things that are about to fall due.
 *
 * Runs once a morning, gathers invoices, loan instalments and paydays that sit
 * on one of the reminder days, and writes a notification for each. Every row it
 * writes carries a dedupe key naming the event and the offset, so running the
 * job twice — a restart, a second instance, a manual re-run — writes nothing
 * the second time. See `collectDueReminders`.
 *
 * The scan window is derived from the cadence rather than hardcoded: widening
 * `REMINDER_OFFSET_DAYS` to warn a fortnight ahead widens the query with it.
 */
@Injectable()
export class DueRemindersService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DueRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * The same sweep, once, as soon as the app is up.
   *
   * The cron fires only if the process happens to be running at 07:00 — which
   * in development it usually is not, and on a server means a restart across
   * that minute silently drops the day. A "payday is today" reminder is
   * worthless tomorrow, so the day is caught up on instead of skipped.
   * Repeating a sweep costs nothing: every row carries a dedupe key, so a
   * second run over the same day writes nothing.
   */
  async onApplicationBootstrap(): Promise<void> {
    await this.runDaily();
  }

  /**
   * Early enough to be waiting when the working day starts, late enough that a
   * "today" reminder still leaves time to act on it.
   */
  @Cron(CronExpression.EVERY_DAY_AT_7AM, { name: 'due-date-reminders' })
  async runDaily(): Promise<void> {
    try {
      const written = await this.run(new Date());
      if (written > 0) {
        this.logger.log(`Wrote ${written} due-date notification(s)`);
      }
    } catch (error) {
      // A failed sweep must not take the scheduler down with it; tomorrow's run
      // picks up anything today's missed, because the reminders are derived
      // from the dates rather than from a queue.
      this.logger.error(`Due-date sweep failed: ${String(error)}`);
    }
  }

  /** Exposed separately from the cron so it can be run for a given instant. */
  async run(now: Date): Promise<number> {
    const candidates = [
      ...(await this.invoiceCandidates(now)),
      ...(await this.creditLineCandidates(now)),
      ...(await this.paydayCandidates(now)),
    ];

    const reminders = collectDueReminders(candidates, now, REMINDER_OFFSET_DAYS);

    const created = await this.notifications.createMany(
      reminders.map((reminder) => ({
        companyId: reminder.companyId,
        type: reminder.type,
        metadata: reminder.metadata,
        relatedEntityType: reminder.relatedEntityType,
        relatedEntityId: reminder.entityId,
        dedupeKey: reminder.dedupeKey,
      })),
    );

    return created.length;
  }

  /**
   * Unpaid invoices with a due date inside the reminder horizon, both
   * directions: one we issued and are waiting to be paid for, and a supplier
   * bill we owe. Paid and cancelled invoices are closed documents and are
   * never chased.
   */
  private async invoiceCandidates(now: Date): Promise<DueCandidate[]> {
    const rows = await this.prisma.invoice.findMany({
      where: {
        dueDate: this.horizon(now),
        status: { notIn: [InvoiceStatus.PAID, InvoiceStatus.CANCELLED] },
      },
      select: {
        id: true,
        companyId: true,
        direction: true,
        invoiceNumber: true,
        clientName: true,
        totalAmount: true,
        currency: true,
        dueDate: true,
      },
    });

    return rows.map((row) =>
      invoiceCandidate({
        ...row,
        // Narrowed for the pure layer: the query already excludes nulls.
        dueDate: row.dueDate!,
        totalAmount: row.totalAmount.toFixed(2),
      }),
    );
  }

  /** Loans whose next instalment date falls inside the reminder horizon. */
  private async creditLineCandidates(now: Date): Promise<DueCandidate[]> {
    const rows = await this.prisma.creditLine.findMany({
      where: { nextPaymentDate: this.horizon(now) },
      select: {
        id: true,
        installmentAmount: true,
        installmentsPaid: true,
        totalInstallments: true,
        nextPaymentDate: true,
        bankAccount: {
          select: { id: true, companyId: true, bankName: true, iban: true, currency: true },
        },
      },
    });

    return rows.map((row) =>
      creditLineCandidate({
        id: row.id,
        companyId: row.bankAccount.companyId,
        bankAccountId: row.bankAccount.id,
        accountName: accountLabel(row.bankAccount),
        installmentAmount: row.installmentAmount.toFixed(2),
        currency: row.bankAccount.currency,
        installmentsPaid: row.installmentsPaid,
        totalInstallments: row.totalInstallments,
        nextPaymentDate: row.nextPaymentDate,
      }),
    );
  }

  /**
   * Paydays for companies that have configured one and have somebody to pay.
   * A company with no active employees gets no payday reminder: there is no
   * payroll to run.
   */
  private async paydayCandidates(now: Date): Promise<DueCandidate[]> {
    const companies = await this.prisma.company.findMany({
      where: {
        paydayDayOfMonth: { not: null },
        employees: { some: { status: EmployeeStatus.ACTIVE } },
      },
      select: { id: true, paydayDayOfMonth: true },
    });

    return companies
      .map((company) => paydayCandidate(company, now))
      .filter((candidate): candidate is DueCandidate => candidate !== null);
  }

  /**
   * The date range worth reading: from today to the furthest offset the
   * cadence warns at. Anything outside it cannot produce a reminder today.
   */
  private horizon(now: Date): { gte: Date; lte: Date } {
    const from = startOfDay(now);
    const to = startOfDay(now);
    to.setDate(to.getDate() + reminderHorizonDays(REMINDER_OFFSET_DAYS));
    // End of the last day, so a due date stored with a time of day still falls
    // inside the window.
    to.setHours(23, 59, 59, 999);

    return { gte: from, lte: to };
  }
}
