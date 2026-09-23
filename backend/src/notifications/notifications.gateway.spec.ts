import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { NotificationsGateway } from './notifications.gateway.js';
import { NOTIFICATION_CREATED } from './notification.types.js';
import type { NotificationView } from './notification.types.js';
import { NotificationType } from '../generated/prisma/enums.js';

/**
 * The gateway against a real socket.io server and real clients.
 *
 * Worth the setup: the room boundary is what stops one company seeing
 * another's notifications, and a stubbed socket would prove nothing about it.
 */

const SECRET = 'test-access-secret-at-least-16-chars';

const notification = (id: string): NotificationView => ({
  id,
  type: NotificationType.ACCOUNT_INFLOW,
  title: 'Прилив на сметка',
  message: 'Пари влегоа.',
  metadata: {},
  relatedEntityType: null,
  relatedEntityId: null,
  isRead: false,
  createdAt: new Date().toISOString(),
});

describe('NotificationsGateway', () => {
  let app: INestApplication;
  let gateway: NotificationsGateway;
  let jwt: JwtService;
  let url: string;
  const open: Socket[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      providers: [
        NotificationsGateway,
        { provide: ConfigService, useValue: { getOrThrow: () => SECRET } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // Port 0: the OS picks a free one, so the suite never clashes with a dev
    // server already running on 3000.
    await app.listen(0);

    const { port } = app.getHttpServer().address() as AddressInfo;
    url = `http://localhost:${port}/notifications`;
    gateway = moduleRef.get(NotificationsGateway);
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    for (const socket of open) socket.disconnect();
    await app?.close();
  });

  /** A connection carrying whatever cookie the caller wants to present. */
  function client(cookie: string | null): Socket {
    const socket = io(url, {
      transports: ['polling'],
      reconnection: false,
      ...(cookie ? { extraHeaders: { Cookie: cookie } } : {}),
    });
    open.push(socket);
    return socket;
  }

  /**
   * Expiry is set as an `exp` claim rather than through `expiresIn`, which
   * only accepts forward-looking durations — an already-expired token is
   * exactly what one of these cases needs to present.
   */
  function cookieFor(payload: Record<string, unknown>, expired = false): string {
    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign({ ...payload, exp: now + (expired ? -60 : 300) }, { secret: SECRET });
    return `access_token=${token}`;
  }

  /** Resolves once the socket has settled either way. */
  function settled(socket: Socket): Promise<'connected' | 'closed'> {
    return new Promise((resolve) => {
      socket.on('connect', () => setTimeout(() => resolve(socket.connected ? 'connected' : 'closed'), 300));
      socket.on('connect_error', () => resolve('closed'));
      setTimeout(() => resolve('closed'), 4000);
    });
  }

  it('accepts a session that has entered a company', async () => {
    const socket = client(cookieFor({ sub: 'u-1', email: 'a@b.mk', companyId: 'co-1', role: 'CEO' }));
    await expect(settled(socket)).resolves.toBe('connected');
  });

  // Without a company there is no room to join, so the socket is closed rather
  // than held open and silent.
  it('closes a session that has not entered a company', async () => {
    const socket = client(cookieFor({ sub: 'u-1', email: 'a@b.mk' }));
    await expect(settled(socket)).resolves.toBe('closed');
  });

  it('closes an expired, forged or absent token', async () => {
    await expect(settled(client(cookieFor({ sub: 'u-1', companyId: 'co-1' }, true)))).resolves.toBe('closed');
    await expect(settled(client('access_token=not.a.jwt'))).resolves.toBe('closed');
    await expect(settled(client('theme=dark; lang=mk'))).resolves.toBe('closed');
    await expect(settled(client(null))).resolves.toBe('closed');
  });

  it('pushes a company-wide notification to that company', async () => {
    const socket = client(cookieFor({ sub: 'u-1', email: 'a@b.mk', companyId: 'co-1' }));
    await settled(socket);

    const received = new Promise<NotificationView>((resolve) => {
      socket.on(NOTIFICATION_CREATED, resolve);
    });

    gateway.emit('co-1', null, notification('n-1'));

    await expect(received).resolves.toMatchObject({ id: 'n-1', type: 'ACCOUNT_INFLOW' });
  });

  // The whole point of the rooms: one tenant's notifications must never reach
  // another's, and that is enforced by where the socket sits rather than by a
  // filter each emit has to remember to apply.
  it('never leaks one company notification to another', async () => {
    const ours = client(cookieFor({ sub: 'u-1', email: 'a@b.mk', companyId: 'co-1' }));
    const theirs = client(cookieFor({ sub: 'u-2', email: 'c@d.mk', companyId: 'co-2' }));
    await Promise.all([settled(ours), settled(theirs)]);

    let leaked = false;
    theirs.on(NOTIFICATION_CREATED, () => {
      leaked = true;
    });
    const delivered = new Promise((resolve) => ours.on(NOTIFICATION_CREATED, resolve));

    gateway.emit('co-1', null, notification('n-2'));

    await delivered;
    // Delivery to the right room has happened; anything wrong would have
    // arrived by now too, since both sockets share one server.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(leaked).toBe(false);
  });

  it('sends a notification addressed to one person only to them', async () => {
    const addressee = client(cookieFor({ sub: 'u-1', email: 'a@b.mk', companyId: 'co-1' }));
    const colleague = client(cookieFor({ sub: 'u-9', email: 'e@f.mk', companyId: 'co-1' }));
    await Promise.all([settled(addressee), settled(colleague)]);

    let reachedColleague = false;
    colleague.on(NOTIFICATION_CREATED, () => {
      reachedColleague = true;
    });
    const delivered = new Promise((resolve) => addressee.on(NOTIFICATION_CREATED, resolve));

    gateway.emit('co-1', 'u-1', notification('n-3'));

    await delivered;
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(reachedColleague).toBe(false);
  });
});
