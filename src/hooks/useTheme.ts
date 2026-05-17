import { useEffect } from 'react';
import { useAppStore } from '@/stores/app-store';

type Theme = 'dark' | 'light' | 'system';

function isTheme(v: unknown): v is Theme {
  return v === 'dark' || v === 'light' || v === 'system';
}

function applyThemeClass(theme: Theme): () => void {
  const root = document.documentElement;

  if (theme === 'system') {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      root.classList.toggle('dark', mq.matches);
      root.classList.toggle('light', !mq.matches);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }

  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');
  return () => {};
}

/**
 * Applies the active theme to document.documentElement and keeps it in sync.
 * - serverTheme: value from the settings IPC query (takes precedence once loaded)
 * - Falls back to the Zustand-persisted theme during the initial render
 * - 'system' mode tracks prefers-color-scheme via MediaQueryList
 * - Also tracks prefers-reduced-motion and adds/removes `motion-reduce` class
 */
export function useTheme(serverTheme?: unknown): void {
  const storeTheme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  // Keep store in sync with persisted settings value
  useEffect(() => {
    if (isTheme(serverTheme) && serverTheme !== storeTheme) {
      setTheme(serverTheme);
    }
  }, [serverTheme, storeTheme, setTheme]);

  const activeTheme: Theme = isTheme(serverTheme) ? serverTheme : storeTheme;

  // Apply dark/light class (or follow OS preference for 'system')
  useEffect(() => applyThemeClass(activeTheme), [activeTheme]);

  // Reflect OS motion preference so animations can be suppressed via CSS
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => document.documentElement.classList.toggle('motion-reduce', mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
}
