import { io, type Socket } from 'socket.io-client';

/**
 * The live notification connection.
 *
 * Auth rides on the same httpOnly cookie the REST calls use — `withCredentials`
 * is what puts it on the handshake — so there is no token for this file to hold
 * and none to leak into a query string. The server reads the cookie, works out
 * the company, and puts the socket in that company's room; nothing here decides
 * what this client is allowed to see.
 */

/** Must match `NOTIFICATIONS_NAMESPACE` on the server. */
const NAMESPACE = '/notifications';

/** Must match `NOTIFICATION_CREATED` on the server. */
export const NOTIFICATION_CREATED = 'notification:created';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/**
 * Opens the connection.
 *
 * Reconnection is socket.io's own, with one deliberate exception: a handshake
 * the server refuses means the access cookie has expired, and retrying with the
 * same expired cookie would only be refused again. The caller renews it and
 * reconnects instead — see `useNotifications`.
 */
export function connectNotifications(): Socket {
  return io(`${API_URL}${NAMESPACE}`, {
    withCredentials: true,
    // Poll first, then upgrade. The long-poll handshake carries the cookie the
    // same way an XHR does, which keeps auth working behind proxies that will
    // not pass websockets.
    transports: ['polling', 'websocket'],
  });
}
