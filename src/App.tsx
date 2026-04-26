/**
 * Ledger — App root
 *
 * Wires together:
 *  - TanStack Router (hash-based for Electron file:// protocol)
 *  - TanStack Query (server-state cache over IPC)
 *  - Full sidebar + top-bar shell layout
 */

import type { FC } from 'react';
import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  RouterProvider,
  createRouter,
  createRootRoute,
  createRoute,
  createHashHistory,
  Outlet,
} from '@tanstack/react-router';

import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { PropFirmBanner } from '@/components/layout/PropFirmBanner';
import { UpdateBanner } from '@/components/layout/UpdateBanner';
import { DriftBanner } from '@/components/session-header/DriftBanner';
import { KeyboardShortcuts } from '@/components/help/KeyboardShortcuts';
import { Glossary } from '@/components/help/Glossary';
import { EAInstallGuide } from '@/components/help/EAInstallGuide';
import { GuidedTour } from '@/components/tour/GuidedTour';
import { useGlobalKeys } from '@/hooks/useGlobalKeys';
import { NewTradeDialog } from '@/components/trade-form/NewTradeDialog';
import { TradeDetailDrawer } from '@/components/trade-detail/TradeDetailDrawer';
import { ToastProvider, useToast } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAppStore } from '@/stores/app-store';
import { BlotterPage } from '@/pages/BlotterPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ReviewsPage } from '@/pages/ReviewsPage';
import { CalendarPage } from '@/pages/CalendarPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { TrashPage } from '@/pages/TrashPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { OverlayPage } from '@/pages/OverlayPage';
import { ImporterPage } from '@/pages/ImporterPage';
import { LibraryPage } from '@/pages/LibraryPage';

// ─────────────────────────────────────────────────────────────
// TanStack Query client
// ─────────────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      retry: 1,
    },
  },
});

// ─────────────────────────────────────────────────────────────
// Layout shell (sidebar + content area)
// ─────────────────────────────────────────────────────────────

function BridgeToastListener() {
  const { toast } = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    const unsub = window.ledger.bridge.onTradeReceived((payload) => {
      const p = payload as {
        message: string;
        variant: 'success' | 'error';
        trade?: {
          symbol: string;
          direction: string;
          netPips: number | null;
          netPnl: number | null;
          status: 'open' | 'closed';
        };
      };

      // Always invalidate trades so the blotter refreshes immediately
      qc.invalidateQueries({ queryKey: ['trades'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });

      if (!p.trade) {
        // Error or skipped-duplicate event — show raw message
        toast(p.message, { variant: p.variant === 'error' ? 'error' : 'default' });
        return;
      }

      const t = p.trade;
      if (t.status === 'open') {
        toast(`${t.symbol} ${t.direction} — position opened`, {
          description: 'Live trade detected — click to add setup details',
          variant: 'default',
        });
      } else {
        const pips =
          t.netPips !== null
            ? ` ${t.netPips > 0 ? '+' : ''}${t.netPips.toFixed(1)} pips`
            : '';
        toast(`${t.symbol} ${t.direction}${pips}`, {
          description: 'Trade closed and journal updated',
          variant: t.netPips !== null && t.netPips >= 0 ? 'success' : 'error',
        });
      }
    });
    return unsub;
  }, [toast, qc]);
  return null;
}

function AppShell() {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [tourActive, setTourActive] = useState(false);
  const activeAccountId = useAppStore((s) => s.activeAccountId);
  useGlobalKeys({ onShortcuts: () => setShortcutsOpen(true) });

  // Show tour on first run
  const { data: settings } = useQuery<Record<string, unknown>>({
    queryKey: ['settings'],
    queryFn: () => window.ledger.settings.get(),
  });
  // Show tour once: when first_run_complete is false and we have settings loaded
  const firstRunRef = useState(false);
  if (settings && settings.first_run_complete === false && !firstRunRef[0]) {
    firstRunRef[1](true);
    // Delay slightly so the app renders first
    setTimeout(() => setTourActive(true), 1200);
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          onShortcuts={() => setShortcutsOpen(true)}
          onGlossary={() => setGlossaryOpen(true)}
        />
        <PropFirmBanner />
        <UpdateBanner />
        {activeAccountId && <DriftBanner accountId={activeAccountId} />}
        <main className="flex flex-1 flex-col overflow-hidden">
          <Outlet />
        </main>
      </div>
      <NewTradeDialog />
      <TradeDetailDrawer />
      <BridgeToastListener />
      {shortcutsOpen && <KeyboardShortcuts onClose={() => setShortcutsOpen(false)} />}
      {glossaryOpen && <Glossary open={glossaryOpen} onClose={() => setGlossaryOpen(false)} />}
      {tourActive && (
        <GuidedTour
          onComplete={() => {
            setTourActive(false);
            window.ledger.settings.update({ first_run_complete: true });
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────

const rootRoute = createRootRoute();

// Overlay lives at its own root (no sidebar/topbar — frameless window)
const overlayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/overlay',
  component: OverlayPage,
});

// Shell layout wraps all main app routes
const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'shell',
  component: AppShell,
});

const indexRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/',
  component: BlotterPage,
});

const dashboardRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/dashboard',
  component: DashboardPage,
});

const reviewsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/reviews',
  component: ReviewsPage,
});

const calendarRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/calendar',
  component: CalendarPage,
});

const reportsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/reports',
  component: ReportsPage,
});

const importRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/import',
  component: ImporterPage,
});

const trashRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/trash',
  component: TrashPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings',
  component: SettingsPage,
});

const libraryRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/library',
  component: LibraryPage,
});

const eaGuideRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/ea-guide',
  component: EAInstallGuide,
});

const routeTree = rootRoute.addChildren([
  overlayRoute,
  shellRoute.addChildren([
    indexRoute,
    dashboardRoute,
    reviewsRoute,
    calendarRoute,
    reportsRoute,
    importRoute,
    libraryRoute,
    trashRoute,
    settingsRoute,
    eaGuideRoute,
  ]),
]);

const router = createRouter({
  routeTree,
  history: createHashHistory(),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// ─────────────────────────────────────────────────────────────
// App root
// ─────────────────────────────────────────────────────────────

export const App: FC = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider delayDuration={400}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </TooltipProvider>
  </QueryClientProvider>
);
