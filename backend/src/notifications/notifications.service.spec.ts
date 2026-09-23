import { describe, expect, it, vi } from 'vitest';
import { NotificationsService } from './notifications.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { NotificationType, TransactionDirection } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { NotificationsGateway } from './notifications.gateway.js';

const ACCOUNT = {
  id: 'acc-1',
  bankName: 'Комерцијална банка',
  iban: 'MK07250120000058984',
  currency: 'MKD',
};

/** A Prisma stub whose `notification.create` echoes back what it was given. */
function stubPrisma(overrides: Record<string, unknown> = {}) {
  const create = vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({
      id: `n-${String(create.mock.calls.length)}`,
      relatedEntityType: null,
      relatedEntityId: null,
      isRead: false,
      createdAt: new Date('2026-09-15T09:00:00Z'),
      ...data,
    }),
  );

  return {
    notification: {
      create,
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn().mockResolvedValue(null),
      ...overrides,
    },
  } as unknown as PrismaService;
}

function stubGateway() {
  return { emit: vi.fn() } as unknown as NotificationsGateway;
}

describe('NotificationsService.create', () => {
  it('persists the row and then pushes it', async () => {
    const prisma = stubPrisma();
    const gateway = stubGateway();
    const service = new NotificationsService(prisma, gateway);

    const view = await service.create({
      companyId: 'co-1',
      type: NotificationType.ACCOUNT_INFLOW,
      metadata: { accountName: 'Комерцијална 8984', amount: '4500.00', currency: 'MKD' },
    });

    expect(view).not.toBeNull();
    expect(gateway.emit).toHaveBeenCalledWith('co-1', null, view);
  });

  it('renders and stores the Macedonian copy alongside the metadata', async () => {
    const prisma = stubPrisma();
    const service = new NotificationsService(prisma, stubGateway());

    await service.create({
      companyId: 'co-1',
      type: NotificationType.ACCOUNT_OUTFLOW,
      metadata: { accountName: 'Комерцијална 8984', amount: '4500.00', currency: 'MKD' },
    });

    const { data } = (prisma.notification.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(data.title).toBe('Одлив од сметка');
    expect(data.message).toContain('4.500 MKD');
    // The figures travel as data too, which is what lets the UI translate.
    expect(data.metadata).toMatchObject({ amount: '4500.00' });
  });

  // What makes the daily reminder job safe to re-run: a second attempt at the
  // same event is a no-op, not an error and not a second notification.
  it('treats an already-sent reminder as nothing to do', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: '7.10.0',
    });
    const prisma = stubPrisma({ create: vi.fn().mockRejectedValue(duplicate) });
    const gateway = stubGateway();
    const service = new NotificationsService(prisma, gateway);

    const view = await service.create({
      companyId: 'co-1',
      type: NotificationType.INVOICE_DUE,
      metadata: {},
      dedupeKey: 'INVOICE_DUE:inv-1:2026-09-18:d3',
    });

    expect(view).toBeNull();
    expect(gateway.emit).not.toHaveBeenCalled();
  });

  it('lets a real database failure through', async () => {
    const prisma = stubPrisma({ create: vi.fn().mockRejectedValue(new Error('connection lost')) });
    const service = new NotificationsService(prisma, stubGateway());

    await expect(
      service.create({ companyId: 'co-1', type: NotificationType.INVOICE_DUE, metadata: {} }),
    ).rejects.toThrow(/connection lost/);
  });

  it('pushes a notification addressed to one person to that person only', async () => {
    const gateway = stubGateway();
    const service = new NotificationsService(stubPrisma(), gateway);

    await service.create({
      companyId: 'co-1',
      userId: 'u-1',
      type: NotificationType.EMPLOYEE_PAYDAY,
      metadata: { daysAway: 0 },
    });

    expect(gateway.emit).toHaveBeenCalledWith('co-1', 'u-1', expect.anything());
  });
});

/**
 * Whether something is worth announcing is the caller's call — the statement
 * import filters history out, the bank webhook announces everything it gets.
 * These cases are about the announcing itself.
 */
describe('NotificationsService.transactionsRecorded', () => {

  const booking = (overrides: Record<string, unknown> = {}) => ({
    id: 'tx-1',
    direction: TransactionDirection.OUT,
    amount: '18400.00',
    description: 'Наем',
    bookedAt: new Date(2026, 8, 15, 8),
    ...overrides,
  });

  it('announces money leaving as an outflow and money arriving as an inflow', async () => {
    const prisma = stubPrisma();
    const service = new NotificationsService(prisma, stubGateway());

    await service.transactionsRecorded(
      'co-1',
      ACCOUNT,
      [booking(), booking({ id: 'tx-2', direction: TransactionDirection.IN })],
    );

    const types = (prisma.notification.create as ReturnType<typeof vi.fn>).mock.calls.map(
      ([args]) => args.data.type,
    );
    expect(types).toEqual([
      NotificationType.ACCOUNT_OUTFLOW,
      NotificationType.ACCOUNT_INFLOW,
    ]);
  });

  it('names the account the way a statement would', async () => {
    const prisma = stubPrisma();
    const service = new NotificationsService(prisma, stubGateway());

    await service.transactionsRecorded('co-1', ACCOUNT, [booking()]);

    const { data } = (prisma.notification.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(data.metadata.accountName).toBe('Комерцијална банка 8984');
    expect(data.relatedEntityType).toBe('transaction');
    expect(data.relatedEntityId).toBe('tx-1');
  });

  it('has nothing to say about an empty batch', async () => {
    const prisma = stubPrisma();
    const service = new NotificationsService(prisma, stubGateway());

    await service.transactionsRecorded('co-1', ACCOUNT, []);

    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  // Recording the money is the operation the caller asked for; it must not
  // fail because telling someone about it did.
  it('swallows a notification failure rather than failing the caller', async () => {
    const prisma = stubPrisma({ create: vi.fn().mockRejectedValue(new Error('write failed')) });
    const service = new NotificationsService(prisma, stubGateway());

    await expect(
      service.transactionsRecorded('co-1', ACCOUNT, [booking()]),
    ).resolves.toBeUndefined();
  });
});

describe('NotificationsService.list', () => {
  it('shows a member company-wide rows plus their own, and nobody else', async () => {
    const prisma = stubPrisma();
    const service = new NotificationsService(prisma, stubGateway());

    await service.list('co-1', 'u-1');

    const { where } = (prisma.notification.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(where).toEqual({ companyId: 'co-1', OR: [{ userId: null }, { userId: 'u-1' }] });
  });

  it('caps how many rows one request can pull', async () => {
    const prisma = stubPrisma();
    const service = new NotificationsService(prisma, stubGateway());

    await service.list('co-1', 'u-1', { limit: 5000 });

    // One over the page size, which is how the next-page cursor is decided.
    expect((prisma.notification.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0].take).toBe(51);
  });

  it('offers a cursor only while there is another page', async () => {
    const rows = Array.from({ length: 3 }, (_, index) => ({
      id: `n-${index}`,
      type: NotificationType.INVOICE_DUE,
      title: 'т',
      message: 'м',
      metadata: {},
      relatedEntityType: null,
      relatedEntityId: null,
      isRead: false,
      createdAt: new Date(),
    }));

    const full = new NotificationsService(
      stubPrisma({ findMany: vi.fn().mockResolvedValue(rows) }),
      stubGateway(),
    );
    const page = await full.list('co-1', 'u-1', { limit: 2 });
    expect(page.notifications).toHaveLength(2);
    expect(page.nextCursor).toBe('n-1');

    const last = new NotificationsService(
      stubPrisma({ findMany: vi.fn().mockResolvedValue(rows.slice(0, 2)) }),
      stubGateway(),
    );
    expect((await last.list('co-1', 'u-1', { limit: 2 })).nextCursor).toBeNull();
  });
});

describe('NotificationsService.markRead', () => {
  it('refuses an id that belongs to another tenant', async () => {
    const prisma = stubPrisma({
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findFirst: vi.fn().mockResolvedValue(null),
    });
    const service = new NotificationsService(prisma, stubGateway());

    await expect(service.markRead('co-1', 'u-1', 'n-other')).rejects.toThrow(/not found/i);
  });

  // Marking something read twice is not an error, it is a no-op.
  it('accepts a notification that was already read', async () => {
    const prisma = stubPrisma({
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findFirst: vi.fn().mockResolvedValue({ id: 'n-1' }),
    });
    const service = new NotificationsService(prisma, stubGateway());

    await expect(service.markRead('co-1', 'u-1', 'n-1')).resolves.toEqual({ unreadCount: 0 });
  });

  it('clears the badge when everything is marked read', async () => {
    const prisma = stubPrisma();
    const service = new NotificationsService(prisma, stubGateway());

    expect(await service.markAllRead('co-1', 'u-1')).toEqual({ unreadCount: 0 });
    const { where } = (prisma.notification.updateMany as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(where).toMatchObject({ companyId: 'co-1', isRead: false });
  });
});
