import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { ACCESS_TOKEN_COOKIE } from '../auth/constants.js';
import type { AccessTokenPayload } from '../auth/types/jwt-payload.type.js';
import { parseOrigins } from '../config/app.config.js';
import { NOTIFICATIONS_NAMESPACE, NOTIFICATION_CREATED } from './notification.types.js';
import type { NotificationView } from './notification.types.js';
import { companyRoom, readCookie, userRoom } from './ws-auth.js';

/**
 * The live half of the notification system.
 *
 * Connections authenticate with the same short-lived access token the REST API
 * uses — read from the httpOnly cookie the browser puts on the handshake, never
 * from a query string — and are then put into a room scoped to the company the
 * token was issued for. That room is the multi-tenant boundary on the socket:
 * a client can only ever be sent what its own company's room receives, so
 * emitting is a single `to(room)` rather than a per-connection filter that
 * could be got wrong.
 *
 * A socket carries the company its token named. Switching company re-issues
 * the token, and the client reconnects — which is what moves it between rooms.
 *
 * CORS is negotiated here rather than by the Express middleware, because
 * socket.io runs its own handshake; the origin list is the same one `main.ts`
 * uses.
 */
@Injectable()
@WebSocketGateway({
  namespace: NOTIFICATIONS_NAMESPACE,
  cors: {
    origin: parseOrigins(process.env['CORS_ORIGIN']),
    credentials: true,
  },
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  private server?: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  handleConnection(client: Socket): void {
    const payload = this.authenticate(client);

    // No token, an expired one, or a session that has not entered a company
    // yet: there is no room to put this socket in, so it is closed rather than
    // left connected and silent.
    if (!payload?.companyId) {
      client.disconnect(true);
      return;
    }

    void client.join(companyRoom(payload.companyId));
    void client.join(userRoom(payload.companyId, payload.sub));
  }

  handleDisconnect(): void {
    // Socket.io removes the socket from its rooms on its own; nothing of ours
    // outlives the connection.
  }

  /**
   * Pushes one notification to whoever it is for: the single member it names,
   * or the whole company when it names nobody.
   *
   * Never throws. A notification is persisted before it is pushed, so a failure
   * here costs the live update and nothing else — the row is still waiting in
   * the notification centre on the next load.
   */
  emit(companyId: string, userId: string | null, notification: NotificationView): void {
    if (!this.server) return;

    const room = userId ? userRoom(companyId, userId) : companyRoom(companyId);

    try {
      this.server.to(room).emit(NOTIFICATION_CREATED, notification);
    } catch (error) {
      this.logger.warn(
        `Could not push notification ${notification.id} to ${room}: ${String(error)}`,
      );
    }
  }

  private authenticate(client: Socket): AccessTokenPayload | null {
    const token = readCookie(client.handshake.headers.cookie, ACCESS_TOKEN_COOKIE);
    if (!token) return null;

    try {
      return this.jwtService.verify<AccessTokenPayload>(token, {
        secret: this.configService.getOrThrow<string>('jwt.accessSecret', { infer: true }),
      });
    } catch {
      // Expired or forged. The client's HTTP layer refreshes the cookie on its
      // next 401 and reconnects, so this is an ordinary event, not an error.
      return null;
    }
  }
}
