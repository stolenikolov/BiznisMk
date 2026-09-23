/**
 * Pulling the access token off a websocket handshake.
 *
 * Auth is cookie-based across the whole app — there is no token for client code
 * to attach — so the socket is authenticated from the same httpOnly cookie the
 * REST calls send. The browser attaches it to the handshake on its own once the
 * client connects with credentials; nothing is passed through query strings,
 * where it would end up in server logs.
 *
 * Kept free of Nest so the parsing can be tested directly.
 */

/** Rooms are the multi-tenant boundary on the socket: one per company. */
export function companyRoom(companyId: string): string {
  return `company:${companyId}`;
}

/**
 * A room for one member of one company, for notifications addressed to a
 * single person rather than the whole company. Scoped by company as well as
 * user: the same person in two companies must not receive one company's
 * notifications while looking at the other.
 */
export function userRoom(companyId: string, userId: string): string {
  return `company:${companyId}:user:${userId}`;
}

/**
 * Reads one cookie out of a raw `Cookie` header.
 *
 * Values are percent-encoded by the browser, so they are decoded here; a value
 * that is not valid encoding is returned verbatim rather than throwing, since
 * a malformed cookie should fail authentication, not the connection handler.
 */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;

    if (part.slice(0, separator).trim() !== name) continue;

    const value = part.slice(separator + 1).trim();
    if (!value) return null;

    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return null;
}
