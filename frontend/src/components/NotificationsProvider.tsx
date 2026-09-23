import type { ReactNode } from 'react';
import { NotificationsContext, useNotificationFeed } from '../lib/useNotifications.ts';

/** One notification feed for the signed-in shell: the bell and the notifications page both read it. */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const feed = useNotificationFeed();
  return <NotificationsContext.Provider value={feed}>{children}</NotificationsContext.Provider>;
}
