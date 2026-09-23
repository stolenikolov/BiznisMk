import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { TransactionCategory } from '../generated/prisma/enums.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PayrollRunService } from '../payroll/payroll-run.service.js';
import type { AccountMovements, BankWebhookEvent } from './bank-webhook.types.js';

const Decimal = Prisma.Decimal;

/** Prisma's unique-constraint violation — here, a webhook delivered twice. */
const UNIQUE_VIOLATION = 'P2002';

export interface WebhookOutcome {
  /** Movements written as new transactions. */
  recorded: number;
  /** Movements already on file, from an earlier delivery of the same event. */
  duplicates: number;
  /** IBANs the bank reported that no company here has connected. */
  unknownAccounts: number;
}

@Injectable()
export class BankWebhookService {
  private readonly logger = new Logger(BankWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly payrollRuns: PayrollRunService,
  ) {}

  /**
   * Records what the bank reported and tells the owning company about it.
   *
   * An IBAN nobody here has connected is skipped, not an error: the mock bank
   * holds accounts that no BiznisMk company has registered, and it is only when
   * an account belongs to a company that there is anyone to notify.
   *
   * Each movement is written on its own rather than in one transaction per
   * event. A payroll run touching five accounts should record the four that
   * work even if the fifth collides with an earlier delivery — an all-or-nothing
   * write would roll back the four and the retry would collide again.
   */
  async apply(event: BankWebhookEvent): Promise<WebhookOutcome> {
    const outcome: WebhookOutcome = { recorded: 0, duplicates: 0, unknownAccounts: 0 };
    const isPayroll = event.eventType === 'PAYROLL_COMPLETED';
    let anyAccountOurs = false;

    for (const reported of event.accounts) {
      const account = await this.ownedAccount(reported.iban, event.companyId);

      if (!account) {
        outcome.unknownAccounts += 1;
        continue;
      }

      anyAccountOurs = true;
      const applied = await this.applyToAccount(account, reported, isPayroll);
      outcome.recorded += applied.recorded;
      outcome.duplicates += applied.duplicates;
    }

    // ownedAccount only matches the company the bank names, so it is not null here.
    if (isPayroll && anyAccountOurs) await this.filePayrollRun(event.companyId!, event);

    return outcome;
  }

  /**
   * Files the period as paid, so the app stops offering to pay it.
   *
   * This runs for a run this app started and for one approved at the bank
   * alike — from here they are the same event, and the money is equally gone.
   * The period is taken from when the salaries were booked rather than from
   * the clock, so a webhook that arrives late, or is replayed days later,
   * still files against the month it paid.
   *
   * Failures are logged and swallowed: the transactions and balances above are
   * what the bank asked us to record, and they must not be rolled back — and
   * retried — because our own bookkeeping row could not be written.
   */
  private async filePayrollRun(companyId: string, event: BankWebhookEvent): Promise<void> {
    const paidAt = newestBooking(event.accounts.flatMap((account) => account.movements));

    try {
      const totals = event.accounts.flatMap((account) => account.movements);

      await this.payrollRuns.record({
        companyId,
        period: await this.payrollRuns.periodFor(companyId, paidAt ?? new Date()),
        currency: (await this.currencyOf(companyId)) ?? 'MKD',
        totalAmount: totals.reduce((sum, movement) => sum.plus(movement.amount), new Decimal(0)),
        // Movements, not people: a run also transfers the contributions and
        // the income tax, and from here they are simply two more debits.
        paymentCount: totals.length,
        bankRequestId: event.payrollRequestId,
        paidAt: paidAt ?? new Date(),
      });
    } catch (error) {
      this.logger.error(`Could not file the completed payroll run: ${String(error)}`);
    }
  }

  private async currencyOf(companyId: string): Promise<string | null> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { currency: true },
    });
    return company?.currency ?? null;
  }

  private async applyToAccount(
    account: OwnedAccount,
    reported: AccountMovements,
    isPayroll: boolean,
  ): Promise<{ recorded: number; duplicates: number }> {
    // Read before writing: once this event's own movements are in, they would
    // look like the newest thing on the account and every replay would pass.
    const latestOnFile = await this.latestBankBooking(account.id);

    let duplicates = 0;
    const recorded: {
      id: string;
      direction: (typeof reported.movements)[number]['direction'];
      amount: string;
      description: string;
      bookedAt: Date;
    }[] = [];

    for (const movement of reported.movements) {
      try {
        const row = await this.prisma.transaction.create({
          data: {
            companyId: account.companyId,
            bankAccountId: account.id,
            externalId: movement.externalId,
            description: movement.description,
            // The bank sends a description, not a category. Guessing one from
            // free text would mislabel the finance page's category split, so
            // rows land uncategorised until something classifies them — except
            // on a payroll run, where the event type is the classification and
            // no guessing is involved.
            category: isPayroll ? TransactionCategory.SALARIES : TransactionCategory.OTHER,
            direction: movement.direction,
            amount: new Decimal(movement.amount),
            bookedAt: movement.bookedAt,
          },
        });

        recorded.push({
          id: row.id,
          direction: movement.direction,
          amount: row.amount.toFixed(2),
          description: row.description,
          bookedAt: row.bookedAt,
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === UNIQUE_VIOLATION
        ) {
          // The bank retries until it is acknowledged, so a movement already on
          // file is an earlier delivery of this same event, not a problem.
          duplicates += 1;
          continue;
        }
        throw error;
      }
    }

    // The bank's figure is authoritative — it is the account, we only mirror
    // it — so the balance is set from the event rather than added up here.
    //
    // Except when the event is older than what we have already applied. A
    // delivery that failed sits in the bank's retry queue carrying the balance
    // as it stood back then, and replaying it must not wind the account
    // backwards past movements that landed since — the queue is replayed one
    // event at a time and in no particular order. The movements themselves are
    // still recorded, because they really happened; only the stale figure is
    // dropped.
    if (reported.newBalance !== null) {
      const eventAt = newestBooking(reported.movements);

      if (latestOnFile !== null && eventAt !== null && eventAt < latestOnFile) {
        this.logger.warn(
          `Keeping the stored balance on ${reported.iban}: this event is from ` +
            `${eventAt.toISOString()}, behind the ${latestOnFile.toISOString()} ` +
            'movement already on file',
        );
      } else {
        await this.prisma.bankAccount.update({
          where: { id: account.id },
          data: { balance: new Decimal(reported.newBalance) },
        });
      }
    }

    // Only what was actually written is announced. A redelivered deposit must
    // not notify the company a second time.
    if (recorded.length > 0) {
      await this.notifications.transactionsRecorded(account.companyId, account, recorded);
    }

    return { recorded: recorded.length, duplicates };
  }

  /**
   * When the newest movement the bank has told us about was booked, ignoring
   * anything we booked ourselves. Null on an account the bank has never
   * reported on, where whatever balance it now sends is the best we have.
   */
  private async latestBankBooking(bankAccountId: string): Promise<Date | null> {
    const newest = await this.prisma.transaction.findFirst({
      where: { bankAccountId, externalId: { not: null } },
      orderBy: { bookedAt: 'desc' },
      select: { bookedAt: true },
    });

    return newest?.bookedAt ?? null;
  }

  /**
   * The account behind an IBAN, provided the bank names the same company as
   * its owner.
   *
   * Found by IBAN, not by session — a webhook has none — and an IBAN is one
   * company's here. The bank's word is checked as well: an account on file for
   * a company the bank does not name (connected before linking was enforced,
   * or unclaimed at the bank) is skipped and logged, never booked to a company
   * that may not own it.
   */
  private async ownedAccount(iban: string, companyId: string | null): Promise<OwnedAccount | null> {
    const account = await this.prisma.bankAccount.findUnique({
      where: { iban },
      select: { id: true, companyId: true, bankName: true, iban: true, currency: true },
    });

    if (!account) {
      this.logger.debug(`Bank reported ${iban}, which no company has connected`);
      return null;
    }
    if (account.companyId !== companyId) {
      this.logger.warn(
        `Bank reported ${iban} for ${companyId ?? 'no company'}, but it is on file for another; skipped`,
      );
      return null;
    }
    return account;
  }
}

type OwnedAccount = { id: string; companyId: string; bankName: string; iban: string; currency: string };

/** The latest booking time in one event, or null when it carries none. */
function newestBooking(movements: readonly { bookedAt: Date }[]): Date | null {
  let newest: Date | null = null;

  for (const movement of movements) {
    if (newest === null || movement.bookedAt > newest) newest = movement.bookedAt;
  }

  return newest;
}
