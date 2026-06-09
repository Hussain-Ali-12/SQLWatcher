import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useNotificationStore } from '../../store/notificationStore';
import type { NotificationItem } from '../../types';
import styles from './ToastQueue.module.css';

interface ToastEntry extends NotificationItem {
  toastId: string;
  expiresAt: number;
}

const TOAST_LIFETIME_MS = 5500;
const BOOTSTRAP_SUPPRESSION_MS = 2000;

function severityClass(severity: string): string {
  const normalized = severity.toLowerCase();
  if (normalized in styles) return styles[normalized];
  return styles.none;
}

function timestampMs(value: string | undefined): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function notificationIdentity(item: NotificationItem): string {
  return `${item.notification_id}-${item.alert_id}-${item.created_at}`;
}

function shouldShowToast(item: NotificationItem, armedAtMs: number): boolean {
  if (item.is_read) return false;
  if (item.source && item.source !== 'websocket') return false;

  // WebSocket streams can replay or rapidly deliver already-existing alerts during
  // initial page hydration. Keep those in the drawer/live feed, but do not show a
  // toast until the shell has been mounted long enough to be considered live.
  const receivedAtMs = timestampMs(item.received_at) || timestampMs(item.created_at);
  return receivedAtMs >= armedAtMs;
}

export function ToastQueue() {
  const items = useNotificationStore((state) => state.items);
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const seenRef = useRef(new Set<string>());
  const armedAtRef = useRef(Date.now() + BOOTSTRAP_SUPPRESSION_MS);

  useEffect(() => {
    const newest = items[0];
    if (!newest || !shouldShowToast(newest, armedAtRef.current)) return;

    const identity = notificationIdentity(newest);
    if (seenRef.current.has(identity)) return;
    seenRef.current.add(identity);

    const toast: ToastEntry = {
      ...newest,
      toastId: identity,
      expiresAt: Date.now() + TOAST_LIFETIME_MS,
    };
    setToasts((current) => [toast, ...current].slice(0, 4));
  }, [items]);

  useEffect(() => {
    if (toasts.length === 0) return undefined;

    const now = Date.now();
    const nextExpiry = Math.min(...toasts.map((toast) => toast.expiresAt));
    const delay = Math.max(0, nextExpiry - now);

    const timeout = window.setTimeout(() => {
      const currentTime = Date.now();
      setToasts((current) => current.filter((entry) => entry.expiresAt > currentTime));
    }, delay + 25);

    return () => window.clearTimeout(timeout);
  }, [toasts]);

  function dismiss(toastId: string) {
    setToasts((current) => current.filter((entry) => entry.toastId !== toastId));
  }

  if (toasts.length === 0) return null;

  return (
    <div className={styles.toastQueue} aria-live="polite" aria-label="Alert notifications">
      {toasts.map((toast) => (
        <article key={toast.toastId} className={`${styles.toast} ${severityClass(toast.severity)}`}>
          <button className={styles.closeButton} type="button" onClick={() => dismiss(toast.toastId)} aria-label="Dismiss notification">
            <X size={14} aria-hidden="true" />
          </button>
          <div className={styles.toastTitle}>{toast.title}</div>
          <p className={styles.toastMessage}>{toast.message}</p>
          <div className={styles.progress} aria-hidden="true" />
        </article>
      ))}
    </div>
  );
}
