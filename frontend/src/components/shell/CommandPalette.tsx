import { useEffect, useMemo, useState } from 'react';
import { Command } from 'cmdk';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useApi } from '../../hooks/useApi';
import { useAuthStore } from '../../store/authStore';
import { useNotificationStore } from '../../store/notificationStore';
import { usePreferenceStore } from '../../store/preferenceStore';
import { shellNavItems } from './navItems';
import styles from './CommandPalette.module.css';

interface ActionItem {
  label: string;
  description: string;
  run: () => void | Promise<void>;
  adminOnly?: boolean;
}

function snippet(value: string, max = 64): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const api = useApi();
  const user = useAuthStore((state) => state.user);
  const notifications = useNotificationStore((state) => state.items);
  const markAllRead = useNotificationStore((state) => state.markAllRead);
  const toggleSidebar = usePreferenceStore((state) => state.toggleSidebar);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isPaletteShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (isPaletteShortcut) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }

    function handleOpenEvent() {
      setOpen(true);
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('sqlwatcher:open-command-palette', handleOpenEvent);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('sqlwatcher:open-command-palette', handleOpenEvent);
    };
  }, []);

  const actions = useMemo<ActionItem[]>(
    () => [
      {
        label: 'Refresh data',
        description: 'Invalidate all React Query caches',
        run: () => queryClient.invalidateQueries(),
      },
      {
        label: 'Mark notifications read',
        description: 'POST /notifications/mark-read',
        run: async () => {
          await api.post('/notifications/mark-read');
          markAllRead();
        },
      },
      {
        label: 'Toggle sidebar',
        description: 'Collapse or expand the navigation rail',
        run: toggleSidebar,
      },
      {
        label: 'Reset demo',
        description: 'POST /demo/reset',
        adminOnly: true,
        run: async () => {
          await api.post('/demo/reset');
          await queryClient.invalidateQueries();
        },
      },
      {
        label: 'Seed traffic',
        description: 'POST /demo/seed-normal-traffic',
        adminOnly: true,
        run: async () => {
          await api.post('/demo/seed-normal-traffic');
          await queryClient.invalidateQueries();
        },
      },
      {
        label: 'Train baseline',
        description: 'POST /ml/train-baseline',
        adminOnly: true,
        run: async () => {
          await api.post('/ml/train-baseline');
          await queryClient.invalidateQueries({ queryKey: ['profiles'] });
        },
      },
    ],
    [api, markAllRead, queryClient, toggleSidebar],
  );

  const visibleActions = actions.filter((action) => !action.adminOnly || user?.role === 'admin');

  async function runAction(action: ActionItem) {
    await action.run();
    setOpen(false);
  }

  function go(path: string) {
    navigate(path);
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className={styles.layer} role="presentation">
      <button className={styles.backdrop} type="button" onClick={() => setOpen(false)} aria-label="Close command palette" />
      <Command className={styles.palette} shouldFilter>
        <Command.Input className={styles.input} placeholder="Type a command or route..." autoFocus />
        <Command.List className={styles.list}>
          <Command.Empty className={styles.empty}>No matching command.</Command.Empty>

          <Command.Group className={styles.group} heading="Navigate">
            {shellNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <Command.Item key={item.path} className={styles.item} value={`navigate ${item.label}`} onSelect={() => go(item.path)}>
                  <Icon size={16} aria-hidden="true" />
                  <span>{item.label}</span>
                  <kbd>{item.path}</kbd>
                </Command.Item>
              );
            })}
          </Command.Group>

          <Command.Group className={styles.group} heading="Recent Alerts">
            {notifications.slice(0, 5).length === 0 ? (
              <div className={styles.mutedRow}>No recent alerts.</div>
            ) : (
              notifications.slice(0, 5).map((item) => (
                <Command.Item
                  key={`${item.notification_id}-${item.created_at}`}
                  className={styles.item}
                  value={`alert ${item.severity} ${item.title} ${item.message}`}
                  onSelect={() => go('/alerts')}
                >
                  <span className={styles.alertPrefix}>[{item.severity}]</span>
                  <span>{snippet(item.message)}</span>
                </Command.Item>
              ))
            )}
          </Command.Group>

          <Command.Group className={styles.group} heading="Actions">
            {visibleActions.map((action) => (
              <Command.Item key={action.label} className={styles.item} value={`action ${action.label}`} onSelect={() => void runAction(action)}>
                <span>{action.label}</span>
                <small>{action.description}</small>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
