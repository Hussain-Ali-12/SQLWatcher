import { create } from 'zustand';
import type { NotificationItem } from '../types';

export interface NotificationState {
  items: NotificationItem[];
  unreadCount: number;
  lastRefreshedAt: string | null;
  push(item: NotificationItem): void;
  markAllRead(): void;
  dismiss(notificationId: number, createdAt?: string): void;
  clear(): void;
  setLastRefreshedAt(value?: string): void;
}

function countUnread(items: NotificationItem[]): number {
  return items.reduce((count, item) => count + (item.is_read ? 0 : 1), 0);
}

export const useNotificationStore = create<NotificationState>((set) => ({
  items: [],
  unreadCount: 0,
  lastRefreshedAt: null,
  push: (item) =>
    set((state) => {
      const items = [item, ...state.items].slice(0, 50);
      return { items, unreadCount: countUnread(items) };
    }),
  markAllRead: () =>
    set((state) => ({
      items: state.items.map((item) => ({ ...item, is_read: true })),
      unreadCount: 0,
    })),
  dismiss: (notificationId, createdAt) =>
    set((state) => {
      const items = state.items.filter((item) => {
        if (item.notification_id !== notificationId) return true;
        return createdAt ? item.created_at !== createdAt : false;
      });
      return { items, unreadCount: countUnread(items) };
    }),
  clear: () => set({ items: [], unreadCount: 0 }),
  setLastRefreshedAt: (value) => set({ lastRefreshedAt: value ?? new Date().toISOString() }),
}));
