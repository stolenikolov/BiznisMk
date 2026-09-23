import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { notificationAge, notificationMessage, notificationTitle } from '../lib/notificationText.ts';
import { notificationLink, useNotifications, type AppNotification } from '../lib/useNotifications.ts';

/**
 * One notification, in the bell's panel or on the notifications page.
 *
 * Opening it marks it read and, when it points somewhere, goes there;
 * `onNavigate` lets the panel close itself first.
 */
export function NotificationRow({
  notification,
  onNavigate,
}: {
  notification: AppNotification;
  onNavigate?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { markRead } = useNotifications();

  const open = () => {
    void markRead(notification.id);

    const target = notificationLink(notification);
    if (target) {
      onNavigate?.();
      navigate(target);
    }
  };

  return (
    <button
      type="button"
      className={`notification-row${notification.isRead ? '' : ' is-unread'}`}
      onClick={open}
    >
      <span className="notification-row-title">
        {notificationTitle(t, notification)}
        {!notification.isRead && <span className="notification-dot" aria-hidden="true" />}
      </span>
      <span className="notification-row-message">{notificationMessage(t, notification, i18n.language)}</span>
      <span className="notification-row-age">{notificationAge(t, notification.createdAt)}</span>
    </button>
  );
}
