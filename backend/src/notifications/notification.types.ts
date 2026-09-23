import type { NotificationType } from '../generated/prisma/enums.js';

/** The socket.io namespace the notification stream lives on. */
export const NOTIFICATIONS_NAMESPACE = '/notifications';

/** Server → client: one notification, just persisted. */
export const NOTIFICATION_CREATED = 'notification:created';

/**
 * What the UI needs to render and link one row.
 *
 * `metadata` carries the figures rather than the sentence, so the frontend can
 * render the row in whichever language is selected. `title`/`message` are the
 * Macedonian copy rendered at write time and travel alongside as the fallback
 * for a type the client does not yet know how to translate.
 */
export interface NotificationView {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  isRead: boolean;
  createdAt: string;
}

/** A notification about to be written. */
export interface NewNotification {
  companyId: string;
  /** Null (or omitted) for a notification the whole company sees. */
  userId?: string | null;
  type: NotificationType;
  metadata: Record<string, unknown>;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  /** Set on scheduled reminders, which must not be written twice. */
  dedupeKey?: string | null;
}
