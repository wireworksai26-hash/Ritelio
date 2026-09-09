import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppNotification } from '../types';

interface NotificationState {
  notifications: AppNotification[];
  markRead: (id: string) => void;
  markAllRead: () => void;
  push: (n: AppNotification) => void;
  clearAll: () => void;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      notifications: [],
      markRead: (id) =>
        set((s) => ({
          notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
        })),
      markAllRead: () =>
        set((s) => ({
          notifications: s.notifications.map((n) => ({ ...n, read: true })),
        })),
      push: (n) =>
        set((s) => {
          // Cegah notifikasi duplikat ID
          if (s.notifications.some((existing) => existing.id === n.id)) return s;
          return { notifications: [n, ...s.notifications] };
        }),
      clearAll: () => set({ notifications: [] }),
    }),
    { name: 'retalio-notifications' },
  ),
);

export function unreadCount(list: AppNotification[]): number {
  return list.filter((n) => !n.read).length;
}
