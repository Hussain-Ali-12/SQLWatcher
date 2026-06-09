import { createContext, useCallback, useContext } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useWebSocket, type WebSocketStatus } from '../../hooks/useWebSocket';
import { useNotificationStore } from '../../store/notificationStore';
import { usePreferenceStore } from '../../store/preferenceStore';
import type { NotificationItem } from '../../types';
import { CommandPalette } from './CommandPalette';
import { GlobalStatusBar } from './GlobalStatusBar';
import { Sidebar } from './Sidebar';
import { ToastQueue } from './ToastQueue';
import styles from './Shell.module.css';

interface SocketEvent {
  type?: string;
  event?: string;
  notification?: Partial<NotificationItem>;
  alert?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

function textFromUnknown(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function numberFromUnknown(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function booleanFromUnknown(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function notificationFromSocketEvent(event: SocketEvent): NotificationItem {
  const source = (event.notification ?? event.payload ?? event.alert ?? event) as Record<string, unknown>;
  const alert = (event.alert ?? source) as Record<string, unknown>;
  const rawSql = textFromUnknown(alert.raw_sql ?? alert.sql ?? alert.query, 'SQL activity detected');
  const severity = textFromUnknown(source.severity ?? alert.severity, 'HIGH').toUpperCase();
  const title = textFromUnknown(source.title, `${severity} alert`);
  const message = textFromUnknown(source.message, rawSql.length > 120 ? `${rawSql.slice(0, 117)}...` : rawSql);

  const receivedAt = new Date().toISOString();

  return {
    notification_id: numberFromUnknown(source.notification_id, Date.now()),
    alert_id: numberFromUnknown(source.alert_id ?? alert.alert_id ?? alert.id, Date.now()),
    created_at: textFromUnknown(source.created_at ?? alert.created_at, receivedAt),
    title,
    message,
    severity,
    is_read: booleanFromUnknown(source.is_read, false),
    source: 'websocket',
    received_at: receivedAt,
  };
}

function eventType(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const event = data as SocketEvent;
  return textFromUnknown(event.type ?? event.event, '');
}


function syncReason(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const event = data as SocketEvent;
  const payload = event.payload && typeof event.payload === 'object' ? event.payload : undefined;
  return textFromUnknown(event.reason ?? payload?.reason, '').toLowerCase();
}

interface ShellContextValue {
  wsStatus: WebSocketStatus;
  reconnectInSeconds: number | null;
}

const ShellStatusContext = createContext<ShellContextValue>({
  wsStatus: 'disconnected',
  reconnectInSeconds: null,
});

export function useShellStatus() {
  return useContext(ShellStatusContext);
}

export function Shell() {
  const density = usePreferenceStore((state) => state.density);
  const sidebarCollapsed = usePreferenceStore((state) => state.sidebarCollapsed);
  const fontScale = usePreferenceStore((state) => state.fontScale);
  const pushNotification = useNotificationStore((state) => state.push);
  const queryClient = useQueryClient();
  const location = useLocation();

  const handleSocketMessage = useCallback(
    (data: unknown) => {
      const type = eventType(data);

      if (type === 'new_alert') {
        pushNotification(notificationFromSocketEvent(data as SocketEvent));
        void queryClient.invalidateQueries({ queryKey: ['alerts'] });
        void queryClient.invalidateQueries({ queryKey: ['stats'] });
        return;
      }

      if (type === 'sync_required') {
        const reason = syncReason(data);

        if (reason.includes('demo')) {
          void queryClient.invalidateQueries();
          return;
        }

        if (!reason || reason === 'query_processed') {
          void queryClient.invalidateQueries({ queryKey: ['stats'] });
          void queryClient.invalidateQueries({ queryKey: ['logs'] });
          void queryClient.invalidateQueries({ queryKey: ['timeline'] });
          void queryClient.invalidateQueries({ queryKey: ['performance'] });
        }

        if (reason.includes('rule')) {
          void queryClient.invalidateQueries({ queryKey: ['rules'] });
        }

        if (reason.includes('anomaly') || reason.includes('baseline') || reason.includes('ml')) {
          void queryClient.invalidateQueries({ queryKey: ['profiles'] });
          void queryClient.invalidateQueries({ queryKey: ['anomalies'] });
          void queryClient.invalidateQueries({ queryKey: ['evaluation'] });
          void queryClient.invalidateQueries({ queryKey: ['stats'] });
        }
      }
    },
    [pushNotification, queryClient],
  );

  const { status: wsStatus, reconnectInSeconds } = useWebSocket(handleSocketMessage);
  const shellContext: ShellContextValue = { wsStatus, reconnectInSeconds };

  return (
    <div
      className={`${styles.shell} ${styles[`density-${density}`]} ${styles[`font-${fontScale}`]} ${sidebarCollapsed ? styles.collapsed : ''}`}
      data-density={density}
      data-font-scale={fontScale}
      data-sidebar-collapsed={sidebarCollapsed ? 'true' : 'false'}
    >
      <ShellStatusContext.Provider value={shellContext}>
        <Sidebar />
        <div className={styles.mainColumn}>
          <GlobalStatusBar wsStatus={shellContext.wsStatus} reconnectInSeconds={shellContext.reconnectInSeconds} />
          <main key={location.pathname} className={styles.pageArea} data-page={location.pathname}>
            <Outlet />
          </main>
        </div>
        <CommandPalette />
        <ToastQueue />
      </ShellStatusContext.Provider>
    </div>
  );
}
