/**
 * useGlobalKeys — registers application-wide keyboard shortcuts.
 *
 * Called once from AppShell. Sequences like G→B (navigate to blotter) are
 * handled with a 1-second window between keypresses.
 *
 * Shortcuts:
 *   N         → New Trade dialog
 *   ?         → Keyboard shortcuts panel
 *   F         → Toggle filter panel (blotter)
 *   /         → Focus search input (if any is visible)
 *   G B       → Navigate to /  (Blotter)
 *   G D       → Navigate to /dashboard
 *   G R       → Navigate to /reviews
 *   G C       → Navigate to /calendar
 *   G S       → Navigate to /settings
 *   Ctrl+Shift+R → Toggle lot-size risk calculator
 */

import { useEffect, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAppStore } from '@/stores/app-store';

export function useGlobalKeys(options: {
  onShortcuts: () => void;
}) {
  const navigate = useNavigate();
  const setNewTradeOpen = useAppStore((s) => s.setNewTradeOpen);
  const toggleFilterPanel = useAppStore((s) => s.toggleFilterPanel);
  const setCalcOpen = useAppStore((s) => s.setCalcOpen);
  const pendingG = useRef(false);
  const pendingGTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ignore keypresses inside inputs, textareas, and contenteditable elements
      const target = e.target as HTMLElement;
      const tag = target?.tagName;
      const isEditable =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target?.isContentEditable;

      if (isEditable) return;

      // Ctrl+Shift+R — toggle risk calculator (must check before the broad Ctrl guard)
      if (e.ctrlKey && e.shiftKey && e.key === 'R') {
        e.preventDefault();
        setCalcOpen(true);
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key;

      // Handle pending G sequence
      if (pendingG.current) {
        pendingG.current = false;
        if (pendingGTimer.current) clearTimeout(pendingGTimer.current);

        switch (key.toLowerCase()) {
          case 'b': navigate({ to: '/' }); return;
          case 'd': navigate({ to: '/dashboard' }); return;
          case 'r': navigate({ to: '/reviews' }); return;
          case 'c': navigate({ to: '/calendar' }); return;
          case 's': navigate({ to: '/settings' }); return;
        }
        return;
      }

      switch (key) {
        case 'g':
        case 'G':
          pendingG.current = true;
          pendingGTimer.current = setTimeout(() => {
            pendingG.current = false;
          }, 1000);
          break;

        case 'n':
        case 'N':
          e.preventDefault();
          setNewTradeOpen(true);
          break;

        case '?':
          e.preventDefault();
          options.onShortcuts();
          break;

        case 'f':
        case 'F':
          toggleFilterPanel();
          break;

        case '/':
          e.preventDefault();
          // Focus the first visible search input if any
          (document.querySelector('input[type="search"], input[placeholder*="Search"], input[placeholder*="search"]') as HTMLElement | null)?.focus();
          break;
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, setNewTradeOpen, toggleFilterPanel, setCalcOpen, options]);
}
