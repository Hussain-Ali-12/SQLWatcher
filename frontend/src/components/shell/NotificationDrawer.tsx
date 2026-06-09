import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useNotificationStore } from '../../store/notificationStore';
import type { NotificationItem } from '../../types';
import styles from './NotificationDrawer.module.css';

interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
}

function severityClass(severity: string): string {
  const normalized = severity.toLowerCase();
  if (normalized in styles) return styles[normalized];
  return styles.none;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function NotificationRow({ item, onDismiss }: { item: NotificationItem; onDismiss: (item: NotificationItem) => void }) {
  return (
    <article className={`${styles.notificationRow} ${item.is_read ? styles.read : styles.unread}`}>
      <button className={styles.rowCloseButton} type="button" onClick={() => onDismiss(item)} aria-label="Remove notification">
        <X size={13} aria-hidden="true" />
      </button>
      <div className={styles.rowTopline}>
        <span className={`${styles.severityBadge} ${severityClass(item.severity)}`}>{item.severity}</span>
        <time className={styles.timestamp} dateTime={item.created_at}>{formatTime(item.created_at)}</time>
      </div>
      <h3 className={styles.rowTitle}>{item.title}</h3>
      <p className={styles.rowMessage}>{item.message}</p>
    </article>
  );
}

export function NotificationDrawer({ open, onClose }: NotificationDrawerProps) {
  const items = useNotificationStore((state) => state.items);
  const markAllRead = useNotificationStore((state) => state.markAllRead);
  const clear = useNotificationStore((state) => state.clear);
  const dismiss = useNotificationStore((state) => state.dismiss);

  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.drawerLayer} role="presentation">
      <button className={styles.backdrop} type="button" onClick={onClose} aria-label="Close notifications" />
      <aside className={styles.drawer} aria-label="Notifications">
        <header className={styles.drawerHeader}>
          <div>
            <h2>Notifications</h2>
            <p>{items.length} retained events</p>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.textButton} type="button" onClick={markAllRead}>Mark read</button>
            <button className={styles.textButton} type="button" onClick={clear}>Clear</button>
            <button className={styles.iconButton} type="button" onClick={onClose} aria-label="Close notification drawer">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </header>
        <div className={styles.list}>
          {items.length === 0 ? (
            <div className={styles.emptyState}>No notifications yet. Realtime alerts will appear here.</div>
          ) : (
            items.map((item) => (
              <NotificationRow
                key={`${item.notification_id}-${item.created_at}`}
                item={item}
                onDismiss={(nextItem) => dismiss(nextItem.notification_id, nextItem.created_at)}
              />
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
