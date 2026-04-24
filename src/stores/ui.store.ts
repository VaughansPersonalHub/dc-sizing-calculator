import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export type TabId =
  | 'engagements'
  | 'inputs'
  | 'reference'
  | 'design-rules'
  | 'scenarios'
  | 'outputs'
  | 'layout';

export interface Toast {
  id: string;
  kind: 'info' | 'success' | 'warning' | 'error';
  message: string;
  createdAt: number;
}

interface UIState {
  activeTab: TabId;
  toasts: Toast[];
  darkMode: boolean;
  setActiveTab: (t: TabId) => void;
  pushToast: (toast: Omit<Toast, 'id' | 'createdAt'>) => void;
  dismissToast: (id: string) => void;
  toggleDarkMode: () => void;
}

export const useUIStore = create<UIState>()(
  immer((set) => ({
    activeTab: 'engagements',
    toasts: [],
    darkMode: false,
    setActiveTab: (t) =>
      set((s) => {
        s.activeTab = t;
      }),
    pushToast: (toast) =>
      set((s) => {
        s.toasts.push({
          ...toast,
          id: Math.random().toString(36).slice(2),
          createdAt: Date.now(),
        });
      }),
    dismissToast: (id) =>
      set((s) => {
        s.toasts = s.toasts.filter((t) => t.id !== id);
      }),
    toggleDarkMode: () =>
      set((s) => {
        s.darkMode = !s.darkMode;
      }),
  }))
);
