import { Bell, Command, RefreshCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import type { WebSocketStatus } from '../../hooks/useWebSocket';
import { useAuthStore } from '../../store/authStore';
import { useNotificationStore } from '../../store/notificationStore';
import { getPageTitle } from './navItems';
import { LiveIndicator } from './LiveIndicator';
import { NotificationDrawer } from './NotificationDrawer';
import styles from './GlobalStatusBar.module.css';

interface GlobalStatusBarProps {
  wsStatus: WebSocketStatus;
  reconnectInSeconds?: number | null;
}

function initials(name?: string | null): string {
  if (!name) return 'SW';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'SW';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'SW';
}

function formatRefresh(value: string | null): string {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent('sqlwatcher:open-command-palette'));
}

export function GlobalStatusBar({ wsStatus, reconnectInSeconds = null }: GlobalStatusBarProps) {
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const lastRefreshedAt = useNotificationStore((state) => state.lastRefreshedAt);
  const setLastRefreshedAt = useNotificationStore((state) => state.setLastRefreshedAt);
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const pageTitle = useMemo(() => getPageTitle(location.pathname), [location.pathname]);

  async function refreshAll() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries();
      setLastRefreshedAt();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <header className={styles.statusBar}>
      <h1 className={styles.pageTitle}>{pageTitle}</h1>
      <div className={styles.spacer} />
      <LiveIndicator status={wsStatus} reconnectInSeconds={reconnectInSeconds} />
      <button className={styles.refreshButton} type="button" onClick={() => void refreshAll()} disabled={refreshing} aria-label="Refresh dashboard data">
        <RefreshCcw size={14} aria-hidden="true" className={refreshing ? styles.spinning : undefined} />
        <span>{refreshing ? 'Refreshing' : 'Refresh'}</span>
      </button>
      <div className={styles.refreshText}>Last refresh: {formatRefresh(lastRefreshedAt)}</div>
      <div className={styles.userChip} aria-label={`Signed in as ${user?.username ?? 'unknown user'}`}>
        <span className={styles.avatar}>{initials(user?.full_name || user?.username)}</span>
        <span className={styles.username}>{user?.username ?? 'unknown'}</span>
        <span className={styles.roleBadge}>{user?.role ?? 'viewer'}</span>
      </div>
      <button className={styles.iconButton} type="button" onClick={() => setDrawerOpen(true)} aria-label="Open notifications">
        <Bell size={17} aria-hidden="true" />
        {unreadCount > 0 && <span className={styles.unreadBadge}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>
      <button className={styles.commandButton} type="button" onClick={openCommandPalette} aria-label="Open command palette">
        <Command size={14} aria-hidden="true" />K
      </button>
      <NotificationDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </header>
  );
}
