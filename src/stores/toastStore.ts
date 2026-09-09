import { create } from 'zustand';
import type { IconName } from '../components/icons/Icon';
import { uid } from '../lib/format';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  icon?: IconName;
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (toast) => {
    const id = uid('toast');
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function toast(t: Omit<Toast, 'id'>): void {
  useToastStore.getState().push(t);
}
