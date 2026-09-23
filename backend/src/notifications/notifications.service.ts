import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { NotificationType, TransactionDirection } from '../generated/prisma/enums.js';
import { NotificationsGateway } from './notifications.gateway.js';
import { buildNotificationCopy } from './notification-messages.js';
import type { NewNotification, NotificationView } from './notification.types.js';

/** Prisma's unique-constraint violation — here, a reminder already sent. */
const UNIQUE_VIOLATION = 'P2002';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

export interface NotificationPage {
  notifications: NotificationView[];
  /** Pass back as `cursor` to fetch the next page; null at the end. */
  nextCursor: string | null;
  /** Everything unread this user can see, not just what is on this page. */
  unreadCount: number;
}

/** One transaction, as the caller that recorded it knows it. */
export interface RecordedTransaction {
  id: string;
  direction: TransactionDirection;
  /** Decimal string, so precision survives the hand-off. */
  amount: string;
  description: string;
  bookedAt: Date;
}

/** The account a recorded transaction landed on. */
export interface NotifyingAccount {
  id: string;
  bankName: string;
  iban: string;
  currency: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
  ) {}

  /**
   * One page of the notification centre, newest first.
   *
   * Scoped to the company and then to what this user may see inside it:
   * company-wide rows plus the ones addressed to them. Cursor-based rather
   * than offset-based because new notifications arrive at the top while the
   * dropdown is open, and offsets would make that shift repeat a row.
   */
  async list(
    companyId: string,
    userId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<NotificationPage> {
    const take = Math.min(Math.max(options.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const where = this.visibleTo(companyId, userId);

    const [rows, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        // One extra row answers "is there another page?" without a second query.
        take: take + 1,
        ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      }),
      this.prisma.notification.count({ where: { ...where, isRead: false } }),
    ]);

    const page = rows.slice(0, take);

    return {
      notifications: page.map(toView),
      nextCursor: rows.length > take ? (page.at(-1)?.id ?? null) : null,
      unreadCount,
    };
  }

  /**
   * Marks one notification read. Scoped by company and viewer as well as by id,
   * so an id from another tenant reads as "not found" rather than as somebody
   * else's notification.
   */
  async markRead(
    companyId: string,
    userId: string,
    notificationId: string,
  ): Promise<{ unreadCount: number }> {
    const { count } = await this.prisma.notification.updateMany({
      where: { ...this.visibleTo(companyId, userId), id: notificationId, isRead: false },
      data: { isRead: true },
    });

    // Nothing updated is either "already read" or "not yours"; only the second
    // is an error, so the two are told apart before answering.
    if (count === 0) {
      const exists = await this.prisma.notification.findFirst({
        where: { ...this.visibleTo(companyId, userId), id: notificationId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Notification not found');
    }

    return { unreadCount: await this.unreadCount(companyId, userId) };
  }

  async markAllRead(companyId: string, userId: string): Promise<{ unreadCount: number }> {
    await this.prisma.notification.updateMany({
      where: { ...this.visibleTo(companyId, userId), isRead: false },
      data: { isRead: true },
    });

    return { unreadCount: 0 };
  }

  async unreadCount(companyId: string, userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { ...this.visibleTo(companyId, userId), isRead: false },
    });
  }

  /**
   * The single door every notification goes through: persist, then push.
   *
   * In that order deliberately. The row is the record — someone offline when
   * something happened still finds it in the notification centre — and the
   * websocket is only how a client that is already looking hears about it
   * sooner. A push that fails costs the immediacy, never the notification.
   *
   * Returns null when a `dedupeKey` says this event has already been
   * announced, which is what makes the daily reminder job safe to re-run.
   */
  async create(input: NewNotification): Promise<NotificationView | null> {
    const copy = buildNotificationCopy(input.type, input.metadata);

    try {
      const row = await this.prisma.notification.create({
        data: {
          companyId: input.companyId,
          userId: input.userId ?? null,
          type: input.type,
          title: copy.title,
          message: copy.message,
          metadata: input.metadata as Prisma.InputJsonValue,
          relatedEntityType: input.relatedEntityType ?? null,
          relatedEntityId: input.relatedEntityId ?? null,
          dedupeKey: input.dedupeKey ?? null,
        },
      });

      const view = toView(row);
      this.gateway.emit(row.companyId, row.userId, view);
      return view;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION) {
        // Another run of the daily job got there first. Nothing to do, and
        // nothing wrong: the notification exists.
        return null;
      }
      throw error;
    }
  }

  /** Writes a batch and returns the ones that were not already there. */
  async createMany(inputs: readonly NewNotification[]): Promise<NotificationView[]> {
    const created: NotificationView[] = [];

    for (const input of inputs) {
      const view = await this.create(input);
      if (view) created.push(view);
    }

    return created;
  }

  /**
   * Announces money that moved on a company account.
   *
   * Announces everything it is given. Deciding what is worth announcing
   * belongs to the caller, because it differs by caller: a webhook is telling
   * us about something that just happened, while connecting an account
   * replays a year of history that nobody wants notified. The import filters
   * with `isFreshBooking`; the webhook does not.
   *
   * Failures are logged and swallowed. Recording the money is the operation the
   * caller asked for, and it must not fail because telling someone about it did.
   */
  async transactionsRecorded(
    companyId: string,
    account: NotifyingAccount,
    transactions: readonly RecordedTransaction[],
  ): Promise<void> {
    if (transactions.length === 0) return;

    try {
      await this.createMany(
        transactions.map((transaction) => ({
          companyId,
          type:
            transaction.direction === TransactionDirection.IN
              ? NotificationType.ACCOUNT_INFLOW
              : NotificationType.ACCOUNT_OUTFLOW,
          relatedEntityType: 'transaction',
          relatedEntityId: transaction.id,
          metadata: {
            transactionId: transaction.id,
            bankAccountId: account.id,
            accountName: accountLabel(account),
            bankName: account.bankName,
            amount: transaction.amount,
            currency: account.currency,
            description: transaction.description,
          },
        })),
      );
    } catch (error) {
      this.logger.error(`Could not record transaction notifications: ${String(error)}`);
    }
  }

  /**
   * What one member of one company may see: everything addressed to the
   * company, plus anything addressed to them personally.
   */
  private visibleTo(companyId: string, userId: string): Prisma.NotificationWhereInput {
    return { companyId, OR: [{ userId: null }, { userId }] };
  }
}

/** How an account is named in a notification, the way a statement would. */
export function accountLabel(account: NotifyingAccount): string {
  const iban = account.iban.trim();
  const tail = iban.length <= 4 ? iban : iban.slice(-4);
  return `${account.bankName} ${tail}`.trim();
}

function toView(row: {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata: Prisma.JsonValue;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  isRead: boolean;
  createdAt: Date;
}): NotificationView {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    // Metadata is written as an object by every caller; anything else is
    // corrupt rather than meaningful, and an empty object keeps the UI
    // rendering off the stored title/message instead of crashing on it.
    metadata:
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
    relatedEntityType: row.relatedEntityType,
    relatedEntityId: row.relatedEntityId,
    isRead: row.isRead,
    createdAt: row.createdAt.toISOString(),
  };
}
