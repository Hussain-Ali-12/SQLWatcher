import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, fromAction, fromSeverity } from '../../components/ui/Badge';
import { useNotificationStore } from '../../store/notificationStore';
import type { NotificationItem } from '../../types';
import type { AlertSummary } from './useOverviewData';
import styles from './styles.module.css';

interface FeedItem {
  id: string;
  alertId?: number;
  createdAt: string;
  severity: string;
  action: string;
  sql: string;
  title: string;
  source: 'alert' | 'notification';
}

interface LiveFeedProps {
  alerts: AlertSummary[];
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function relativeTime(value: string): string {
  const date = new Date(value);
  const timestamp = date.getTime();
  if (Number.isNaN(timestamp)) return 'unknown';

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function fromAlert(alert: AlertSummary): FeedItem {
  return {
    id: `alert-${alert.alert_id}`,
    alertId: alert.alert_id,
    createdAt: alert.created_at,
    severity: alert.severity || 'NONE',
    action: alert.action_taken || 'FLAG',
    sql: alert.raw_sql || alert.description || alert.title || 'SQL activity detected',
    title: alert.title || 'Alert',
    source: 'alert',
  };
}

function fromNotification(item: NotificationItem): FeedItem {
  return {
    id: `notification-${item.notification_id}`,
    alertId: item.alert_id,
    createdAt: item.created_at,
    severity: item.severity || 'NONE',
    action: 'FLAG',
    sql: item.message || item.title || 'SQL activity detected',
    title: item.title || 'Realtime alert',
    source: 'notification',
  };
}

export function LiveFeed({ alerts }: LiveFeedProps) {
  const navigate = useNavigate();
  const notifications = useNotificationStore((state) => state.items);
  const newestNotificationId = notifications[0]?.notification_id ?? null;
  const previousNewestRef = useRef<number | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);

  useEffect(() => {
    if (newestNotificationId !== null && newestNotificationId !== previousNewestRef.current) {
      const id = `notification-${newestNotificationId}`;
      setFlashId(id);
      const timeout = window.setTimeout(() => setFlashId(null), 1000);
      previousNewestRef.current = newestNotificationId;
      return () => window.clearTimeout(timeout);
    }

    previousNewestRef.current = newestNotificationId;
    return undefined;
  }, [newestNotificationId]);

  const items = useMemo(() => {
    const merged = [...notifications.slice(0, 5).map(fromNotification), ...alerts.map(fromAlert)];
    const unique = new Map<string, FeedItem>();

    merged.forEach((item) => {
      const key = item.alertId ? `alert-ref-${item.alertId}` : item.id;
      if (!unique.has(key)) unique.set(key, item);
    });

    return Array.from(unique.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);
  }, [alerts, notifications]);

  return (
    <section className={styles.panel} aria-label="Live query feed">
      <div className={styles.panelHeader}>
        <h2>Live Feed</h2>
        <span>Last 10 security-relevant query events</span>
      </div>

      {items.length === 0 ? (
        <div className={styles.emptyFeed}>No recent query activity yet.</div>
      ) : (
        <ul className={styles.feedList}>
          {items.map((item) => (
            <li key={item.id} className={`${styles.feedItem} ${flashId === item.id ? styles.feedFlash : ''}`}>
              <button
                type="button"
                className={styles.feedButton}
                onClick={() => navigate(item.alertId ? `/alerts?alert=${item.alertId}` : '/alerts')}
              >
                <div className={styles.feedMeta}>
                  <Badge label={item.severity} variant={fromSeverity(item.severity)} />
                  <Badge label={item.action} variant={fromAction(item.action)} />
                  <time dateTime={item.createdAt}>{relativeTime(item.createdAt)}</time>
                </div>
                <code className={styles.feedSql}>{truncate(item.sql.replace(/\s+/g, ' ').trim(), 80)}</code>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
