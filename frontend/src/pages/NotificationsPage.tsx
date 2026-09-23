import { useTranslation } from 'react-i18next';
import { BellIcon } from '../components/icons.tsx';
import { NotificationRow } from '../components/NotificationRow.tsx';
import { notificationDayKey, notificationDayLabel } from '../lib/notificationText.ts';
import { useNotifications, type AppNotification } from '../lib/useNotifications.ts';

/** Rows arrive newest first, so a day's rows are always next to each other. */
function groupByDay(notifications: AppNotification[]): { day: string; items: AppNotification[] }[] {
  const groups: { day: string; items: AppNotification[] }[] = [];
  for (const notification of notifications) {
    const day = notificationDayKey(notification.createdAt);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.items.push(notification);
    else groups.push({ day, items: [notification] });
  }
  return groups;
}

/** Every notification the company has had, by day, with the bell's panel as the short version. */
export function NotificationsPage() {
  const { t } = useTranslation();
  const { notifications, unreadCount, isLoading, isLoadingMore, hasMore, loadMore, markAllRead } =
    useNotifications();

  return (
    <section className="notifications-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">{t('nav.notifications')}</h1>
          <p className="page-subtitle">
            {unreadCount > 0
              ? t('notifications.page.unread', { count: unreadCount })
              : t('notifications.page.subtitle')}
          </p>
        </div>
        {unreadCount > 0 && (
          <button type="button" className="btn-ghost" onClick={() => void markAllRead()}>
            {t('notifications.markAllRead')}
          </button>
        )}
      </header>

      {isLoading && <p className="dashboard-placeholder">{t('common.loading')}</p>}

      {!isLoading && notifications.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <span className="empty-state-icon">
              <BellIcon />
            </span>
            <p>{t('notifications.empty')}</p>
          </div>
        </div>
      )}

      {groupByDay(notifications).map((group) => (
        <section key={group.day} className="notification-day">
          <h2 className="label-caps">{notificationDayLabel(t, group.day)}</h2>
          <div className="card notification-day-card">
            {group.items.map((notification) => (
              <NotificationRow key={notification.id} notification={notification} />
            ))}
          </div>
        </section>
      ))}

      {hasMore && (
        <div className="notifications-more">
          <button type="button" className="btn-ghost" disabled={isLoadingMore} onClick={() => void loadMore()}>
            {isLoadingMore ? t('common.loading') : t('notifications.loadMore')}
          </button>
        </div>
      )}
    </section>
  );
}
