import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { api } from './api.ts';
import { useAuth } from '../auth/useAuth.ts';
import { NOTIFICATION_CREATED, connectNotifications } from './notificationSocket.ts';

export type NotificationType =
  | 'ACCOUNT_OUTFLOW'
  | 'ACCOUNT_INFLOW'
  | 'INVOICE_DUE'
  | 'LOAN_INSTALLMENT_DUE'
  | 'EMPLOYEE_PAYDAY';

export interface AppNotification {
  id: string;
  type: NotificationType;
  /** Macedonian copy rendered by the server; the fallback for an unknown type. */
  title: string;
  message: string;
  /** The figures behind the sentence, which is what the UI translates from. */
  metadata: Record<string, unknown>;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  isRead: boolean;
  createdAt: string;
}

interface NotificationPage {
  notifications: AppNotification[];
  nextCursor: string | null;
  unreadCount: number;
}

const PAGE_SIZE = 20;

/**
 * Serverless hosting (Vercel) cannot hold a websocket open, so there the feed
 * is polled instead. Set at build time; local development keeps the socket.
 */
const LIVE_FEED = import.meta.env.VITE_LIVE_NOTIFICATIONS !== 'off';
const POLL_INTERVAL_MS = 30_000;

/**
 * Where a notification points.
 *
 * Returns null when there is nowhere useful to go — the row still renders, it
 * just is not a link. Kept beside the hook rather than in the component so the
 * mapping is one list rather than a switch buried in markup.
 */
export function notificationLink(notification: AppNotification): string | null {
  const accountId = notification.metadata['bankAccountId'];

  switch (notification.relatedEntityType) {
    case 'invoice':
      return notification.relatedEntityId ? `/invoices/${notification.relatedEntityId}` : null;
    case 'transaction':
    case 'creditLine':
      return typeof accountId === 'string' ? `/finance/accounts/${accountId}` : null;
    case 'company':
      // Payday concerns the payroll, which lives under the team section.
      return '/employees';
    case 'schedule':
      // The related id is the week's Monday.
      return notification.relatedEntityId ? `/schedule?week=${notification.relatedEntityId}` : '/schedule';
    default:
      return null;
  }
}

/**
 * The notification centre: the persisted list, the live feed, and read state.
 *
 * Rows are loaded over REST and then kept current by the websocket — a
 * notification that arrives while the panel is open appears at the top on its
 * own. Reconnecting reloads the list, because anything that happened while the
 * socket was down was persisted but never pushed. Where no socket can be held
 * (VITE_LIVE_NOTIFICATIONS=off), the first page is polled instead.
 *
 * Only runs for a session that has entered a company: notifications are
 * company-scoped, and there is no room to join without one.
 *
 * Called once, by NotificationsProvider. The bell and the notifications page
 * read it through `useNotifications`, so they share one socket and one read
 * state — a row opened on the page stops being unread under the bell too.
 */
export function useNotificationFeed() {
  const { user } = useAuth();
  const companyId = user?.companyId;

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Read inside the socket handlers, which are bound once per connection and
  // must not capture a stale `load`.
  const loadRef = useRef<() => Promise<void>>(async () => {});

  const load = useCallback(async () => {
    if (!companyId) {
      setNotifications([]);
      setUnreadCount(0);
      setNextCursor(null);
      setIsLoading(false);
      return;
    }

    try {
      const { data } = await api.get<NotificationPage>('/notifications', {
        params: { limit: PAGE_SIZE },
      });
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
      setNextCursor(data.nextCursor);
    } catch {
      // A failed load leaves the bell quiet rather than showing a stale count;
      // the next reconnect or panel open tries again.
      setNotifications([]);
      setUnreadCount(0);
      setNextCursor(null);
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    loadRef.current = load;
    void load();
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);

    try {
      const { data } = await api.get<NotificationPage>('/notifications', {
        params: { limit: PAGE_SIZE, cursor: nextCursor },
      });
      // Merged by id: a notification pushed over the socket since the last page
      // was fetched can already be in the list.
      setNotifications((current) => mergeById(current, data.notifications));
      setUnreadCount(data.unreadCount);
      setNextCursor(data.nextCursor);
    } catch {
      // Keep what is already on screen and let the user try again.
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextCursor, isLoadingMore]);

  // Polling: the first page is re-read and folded into what is on screen, so
  // pages loaded further down stay put and a row read elsewhere updates here.
  useEffect(() => {
    if (!companyId || LIVE_FEED) return;

    const refresh = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const { data } = await api.get<NotificationPage>('/notifications', { params: { limit: PAGE_SIZE } });
        setNotifications((current) => withLatest(current, data.notifications));
        setUnreadCount(data.unreadCount);
      } catch {
        // The next tick tries again.
      }
    };

    const timer = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    // Coming back to the tab is when someone looks, so it refreshes at once.
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [companyId]);

  useEffect(() => {
    if (!companyId || !LIVE_FEED) return;

    const socket: Socket = connectNotifications();

    socket.on('connect', () => {
      // Anything that happened while the socket was down was persisted but not
      // pushed, so the list is re-read rather than assumed current.
      void loadRef.current();
    });

    socket.on(NOTIFICATION_CREATED, (notification: AppNotification) => {
      setNotifications((current) =>
        current.some((existing) => existing.id === notification.id)
          ? current
          : [notification, ...current],
      );
      if (!notification.isRead) setUnreadCount((count) => count + 1);
    });

    socket.on('connect_error', () => {
      // The usual cause is an expired access cookie: the server refuses the
      // handshake rather than holding an unauthenticated socket open. This
      // request renews the cookie through the API client's refresh
      // interceptor, so socket.io's next retry carries a valid one.
      void loadRef.current();
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [companyId]);

  /** Marks one row read. Already-read rows are left alone. */
  const markRead = useCallback(async (notificationId: string) => {
    let wasUnread = false;

    setNotifications((current) =>
      current.map((notification) => {
        if (notification.id !== notificationId || notification.isRead) return notification;
        wasUnread = true;
        return { ...notification, isRead: true };
      }),
    );

    if (!wasUnread) return;

    // Optimistic: the row greys out immediately and the server's own count
    // replaces the guess when it answers.
    setUnreadCount((count) => Math.max(count - 1, 0));

    try {
      const { data } = await api.patch<{ unreadCount: number }>(
        `/notifications/${notificationId}/read`,
      );
      setUnreadCount(data.unreadCount);
    } catch {
      void loadRef.current();
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((current) =>
      current.map((notification) =>
        notification.isRead ? notification : { ...notification, isRead: true },
      ),
    );
    setUnreadCount(0);

    try {
      await api.patch('/notifications/read-all');
    } catch {
      void loadRef.current();
    }
  }, []);

  return {
    notifications,
    unreadCount,
    isLoading,
    isLoadingMore,
    hasMore: nextCursor !== null,
    loadMore,
    markRead,
    markAllRead,
    reload: load,
  };
}

export type NotificationFeed = ReturnType<typeof useNotificationFeed>;

export const NotificationsContext = createContext<NotificationFeed | null>(null);

export function useNotifications(): NotificationFeed {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return context;
}

/** Appends a page, dropping anything already on screen. */
/** A fresh first page folded into the list: new rows on top, known rows updated in place. */
function withLatest(current: AppNotification[], latest: AppNotification[]): AppNotification[] {
  const latestById = new Map(latest.map((notification) => [notification.id, notification]));
  const known = new Set(current.map((notification) => notification.id));
  return [
    ...latest.filter((notification) => !known.has(notification.id)),
    ...current.map((notification) => latestById.get(notification.id) ?? notification),
  ];
}

function mergeById(current: AppNotification[], incoming: AppNotification[]): AppNotification[] {
  const seen = new Set(current.map((notification) => notification.id));
  return [...current, ...incoming.filter((notification) => !seen.has(notification.id))];
}
