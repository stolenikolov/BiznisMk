/**
 * Unread notification count.
 *
 * The notifications feature isn't built yet, so there is nothing to count and
 * this reports zero — which is why the bell shows no badge. This is the single
 * place to wire the real count (or a websocket subscription) when that feature
 * lands; the bell reads from here and nowhere else.
 */
export function useUnreadNotifications(): number {
  return 0;
}
