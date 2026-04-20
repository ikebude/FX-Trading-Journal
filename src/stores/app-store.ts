/**
 * Ledger — Global UI state (Zustand)
 *
 * Stores UI-level state that does not belong in the server-state cache
 * (TanStack Query). Examples: active account selection, sidebar open/closed,
 * active trade for the detail drawer.
 *
 * Server state (trades list, accounts list) lives in TanStack Query.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  // The account currently viewed in the blotter / dashboard.
  // null means "all accounts" (aggregate view).
  activeAccountId: string | null;
  setActiveAccountId: (id: string | null) => void;

  // Display timezone — kept in sync with config.display_timezone after load.
  displayTimezone: string;
  setDisplayTimezone: (tz: string) => void;

  // Theme — kept in sync with config.theme.
  theme: 'dark' | 'light' | 'system';
  setTheme: (t: 'dark' | 'light' | 'system') => void;

  // Whether the blotter filter panel is expanded.
  filterPanelOpen: boolean;
  toggleFilterPanel: () => void;

  // Blotter filters — persisted across navigation.
  blotterFilters: Record<string, unknown>;
  setBlotterFilters: (filters: Record<string, unknown>) => void;

  // Trade detail drawer — id of the trade currently shown, or null.
  detailTradeId: string | null;
  setDetailTradeId: (id: string | null) => void;

  // New-trade dialog open state.
  newTradeOpen: boolean;
  setNewTradeOpen: (open: boolean) => void;

  // Risk calculator open state (toggled by Ctrl+Shift+R hotkey).
  calcOpen: boolean;
  setCalcOpen: (open: boolean) => void;

  // Lot size pre-fill: set by RiskCalculator "Use this lot size" button.
  // TradeForm reads this once on mount, then clears it.
  pendingLotSize: number | null;
  setPendingLotSize: (v: number | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeAccountId: null,
      setActiveAccountId: (id) => set({ activeAccountId: id }),

      displayTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      setDisplayTimezone: (tz) => set({ displayTimezone: tz }),

      theme: 'dark',
      setTheme: (t) => set({ theme: t }),

      filterPanelOpen: false,
      toggleFilterPanel: () => set((s) => ({ filterPanelOpen: !s.filterPanelOpen })),

      blotterFilters: {},
      setBlotterFilters: (filters) => set({ blotterFilters: filters }),

      detailTradeId: null,
      setDetailTradeId: (id) => set({ detailTradeId: id }),

      newTradeOpen: false,
      setNewTradeOpen: (open) => set({ newTradeOpen: open }),

      calcOpen: false,
      setCalcOpen: (open) => set({ calcOpen: open }),

      pendingLotSize: null,
      setPendingLotSize: (v) => set({ pendingLotSize: v }),
    }),
    {
      name: 'ledger-ui',
      partialize: (s) => ({
        activeAccountId: s.activeAccountId,
        displayTimezone: s.displayTimezone,
        theme: s.theme,
        filterPanelOpen: s.filterPanelOpen,
        blotterFilters: s.blotterFilters,
      }),
    },
  ),
);
