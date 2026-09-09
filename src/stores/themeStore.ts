import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  mode: ThemeMode;
  isDark: boolean;
  liteMode: boolean; // Mode Ringan / Cepat untuk HP & performa tinggi
  setMode: (mode: ThemeMode) => void;
  toggleDark: () => void;
  setLiteMode: (lite: boolean) => void;
  toggleLiteMode: () => void;
}

function computeIsDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyThemeToDOM(isDark: boolean, liteMode: boolean) {
  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  if (liteMode) {
    document.documentElement.classList.add('lite-mode');
  } else {
    document.documentElement.classList.remove('lite-mode');
  }
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'light',
      isDark: false,
      // Default liteMode true pada mobile / touch screen agar otomatis super ringan
      liteMode: typeof window !== 'undefined' ? ('ontouchstart' in window || window.innerWidth < 768) : false,
      setMode: (mode) => {
        const isDark = computeIsDark(mode);
        applyThemeToDOM(isDark, get().liteMode);
        set({ mode, isDark });
      },
      toggleDark: () => {
        const nextMode: ThemeMode = get().isDark ? 'light' : 'dark';
        const isDark = computeIsDark(nextMode);
        applyThemeToDOM(isDark, get().liteMode);
        set({ mode: nextMode, isDark });
      },
      setLiteMode: (liteMode) => {
        applyThemeToDOM(get().isDark, liteMode);
        set({ liteMode });
      },
      toggleLiteMode: () => {
        const nextLite = !get().liteMode;
        applyThemeToDOM(get().isDark, nextLite);
        set({ liteMode: nextLite });
      },
    }),
    {
      name: 'retalio-theme',
      onRehydrateStorage: () => (state) => {
        if (state) {
          const isDark = computeIsDark(state.mode);
          applyThemeToDOM(isDark, state.liteMode ?? true);
          state.isDark = isDark;
        }
      },
    },
  ),
);

// Inisialisasi awal saat bundle dimuat
if (typeof window !== 'undefined') {
  try {
    const raw = localStorage.getItem('retalio-theme');
    const parsed = raw ? JSON.parse(raw)?.state : null;
    const initialMode: ThemeMode = parsed?.mode || 'light';
    const initialLite: boolean = parsed?.liteMode ?? ('ontouchstart' in window || window.innerWidth < 768);
    applyThemeToDOM(computeIsDark(initialMode), initialLite);

    // Listener perubahan preferensi sistem OS
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      const currentMode = useThemeStore.getState().mode;
      if (currentMode === 'system') {
        const isDark = computeIsDark('system');
        applyThemeToDOM(isDark, useThemeStore.getState().liteMode);
        useThemeStore.setState({ isDark });
      }
    });
  } catch {
    applyThemeToDOM(false, true);
  }
}
