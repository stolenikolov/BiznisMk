import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BellIcon } from './icons.tsx';
import { NotificationRow } from './NotificationRow.tsx';
import { useNotifications } from '../lib/useNotifications.ts';

/** The panel shows the latest few; the rest are one click away on /notifications. */
const PANEL_LIMIT = 8;

/**
 * The bell in the top nav and the panel behind it.
 *
 * The unread dot is drawn by `.icon-button.has-unread`, which only appears
 * while something is actually unread — an empty badge would be a permanent
 * fixture that stops meaning anything.
 */
export function NotificationBell() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const { notifications, unreadCount, isLoading, markAllRead } = useNotifications();
  const close = () => setIsOpen(false);

  // Close on an outside click or Escape, the way the app's other overlays do.
  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="notification-menu" ref={containerRef}>
      <button
        type="button"
        className={`icon-button${unreadCount > 0 ? ' has-unread' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        aria-label={
          unreadCount > 0
            ? t('nav.notificationsUnread', { count: unreadCount })
            : t('nav.notifications')
        }
        onClick={() => setIsOpen((open) => !open)}
      >
        <BellIcon />
      </button>

      {isOpen && (
        <div className="notification-panel" id={panelId} role="dialog" aria-label={t('nav.notifications')}>
          <div className="notification-panel-head">
            <h2>{t('nav.notifications')}</h2>
            {unreadCount > 0 && (
              <button type="button" className="btn-quiet" onClick={() => void markAllRead()}>
                {t('notifications.markAllRead')}
              </button>
            )}
          </div>

          <div className="notification-list">
            {isLoading && <p className="notification-empty">{t('common.loading')}</p>}

            {!isLoading && notifications.length === 0 && (
              <p className="notification-empty">{t('notifications.empty')}</p>
            )}

            {notifications.slice(0, PANEL_LIMIT).map((notification) => (
              <NotificationRow key={notification.id} notification={notification} onNavigate={close} />
            ))}
          </div>

          <div className="notification-panel-foot">
            <Link to="/notifications" className="notification-see-all" onClick={close}>
              {t('notifications.seeAll')}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
