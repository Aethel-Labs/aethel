import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ThemeState {
  isDarkMode: boolean;
  toggleTheme: () => void;
  setTheme: (isDark: boolean) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      isDarkMode: false,
      toggleTheme: () => {
        const newTheme = !get().isDarkMode;
        set({ isDarkMode: newTheme });
        updateBodyClass(newTheme);
      },
      setTheme: (isDark: boolean) => {
        set({ isDarkMode: isDark });
        updateBodyClass(isDark);
      },
    }),
    {
      name: 'theme-storage',
      onRehydrateStorage: () => (state) => {
        if (state) {
          updateBodyClass(state.isDarkMode);
        }
      },
    },
  ),
);

function updateBodyClass(isDark: boolean) {
  if (typeof document !== 'undefined') {
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
    }
  }
}

if (typeof window !== 'undefined') {
  const stored = localStorage.getItem('theme-storage');
  if (stored) {
    try {
      const { state } = JSON.parse(stored);
      updateBodyClass(state.isDarkMode);
    } catch (_e) {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      updateBodyClass(prefersDark);
    }
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    updateBodyClass(prefersDark);
  }
}
