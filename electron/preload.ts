/**
 * Ledger — Electron preload script
 *
 * Exposes a typed `window.ledger` API to the renderer.
 * Every IPC channel is whitelisted here. The renderer never has direct
 * Node access; it goes through this bridge.
 */

import { contextBridge, ipcRenderer } from 'electron';

const api = {
  // ── Settings ──────────────────────────────────────
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch: Record<string, unknown>) =>
      ipcRenderer.invoke('settings:update', patch),
    moveDataFolder: (newPath: string) =>
      ipcRenderer.invoke('settings:move-data-folder', newPath),
  },

  // ── Accounts ──────────────────────────────────────
  accounts: {
    list: () => ipcRenderer.invoke('accounts:list'),
    get: (id: string) => ipcRenderer.invoke('accounts:get', id),
    create: (data: unknown) => ipcRenderer.invoke('accounts:create', data),
    update: (id: string, patch: unknown) =>
      ipcRenderer.invoke('accounts:update', id, patch),
    delete: (id: string) => ipcRenderer.invoke('accounts:delete', id),
  },

  // ── Trades ────────────────────────────────────────
  trades: {
    list: (filters: unknown) => ipcRenderer.invoke('trades:list', filters),
    get: (id: string) => ipcRenderer.invoke('trades:get', id),
    create: (data: unknown) => ipcRenderer.invoke('trades:create', data),
    update: (id: string, patch: unknown) =>
      ipcRenderer.invoke('trades:update', id, patch),
    softDelete: (ids: string[]) => ipcRenderer.invoke('trades:soft-delete', ids),
    restore: (ids: string[]) => ipcRenderer.invoke('trades:restore', ids),
    permanentlyDelete: (ids: string[]) =>
      ipcRenderer.invoke('trades:permanently-delete', ids),
    bulkUpdate: (ids: string[], patch: unknown) =>
      ipcRenderer.invoke('trades:bulk-update', ids, patch),
    bulkAddTags: (ids: string[], tagIds: number[]) =>
      ipcRenderer.invoke('trades:bulk-add-tags', ids, tagIds),
    search: (query: string) => ipcRenderer.invoke('trades:search', query) as Promise<{ rows: unknown[]; total: number }>,
    aggregate: (filters: unknown) =>
      ipcRenderer.invoke('trades:aggregate', filters),
    clearSample: () =>
      ipcRenderer.invoke('trades:clear-sample') as Promise<{ count: number }>,
  },

  // ── Legs ──────────────────────────────────────────
  legs: {
    listForTrade: (tradeId: string) =>
      ipcRenderer.invoke('legs:list-for-trade', tradeId),
    create: (data: unknown) => ipcRenderer.invoke('legs:create', data),
    update: (id: string, patch: unknown) =>
      ipcRenderer.invoke('legs:update', id, patch),
    delete: (id: string) => ipcRenderer.invoke('legs:delete', id),
  },

  // ── Notes ─────────────────────────────────────────
  notes: {
    listForTrade: (tradeId: string) =>
      ipcRenderer.invoke('notes:list-for-trade', tradeId),
    create: (tradeId: string, body: string) =>
      ipcRenderer.invoke('notes:create', tradeId, body),
    update: (id: string, body: string) =>
      ipcRenderer.invoke('notes:update', id, body),
    delete: (id: string) => ipcRenderer.invoke('notes:delete', id),
  },

  // ── Screenshots ───────────────────────────────────
  screenshots: {
    listForTrade: (tradeId: string) =>
      ipcRenderer.invoke('screenshots:list-for-trade', tradeId),
    saveFromBuffer: (
      tradeId: string,
      kind: string,
      buffer: ArrayBuffer,
      caption?: string,
    ) => {
      // T3-2: Reject oversized buffers before sending to main process.
      // A 1GB+ ArrayBuffer would exhaust memory in the main process IPC handler.
      const MAX_BYTES = 50 * 1024 * 1024; // 50 MB
      if (buffer.byteLength > MAX_BYTES) {
        return Promise.reject(
          new RangeError(
            `Screenshot buffer too large: ${buffer.byteLength} bytes (max ${MAX_BYTES}).`,
          ),
        );
      }
      return ipcRenderer.invoke('screenshots:save-from-buffer', tradeId, kind, buffer, caption);
    },
    saveFromPath: (tradeId: string, kind: string, path: string, caption?: string) =>
      ipcRenderer.invoke('screenshots:save-from-path', tradeId, kind, path, caption),
    delete: (id: string) => ipcRenderer.invoke('screenshots:delete', id),
    getDataUrl: (id: string) => ipcRenderer.invoke('screenshots:data-url', id),
  },

  // ── Tags & setups ─────────────────────────────────
  tags: {
    list: (category?: string) => ipcRenderer.invoke('tags:list', category),
    create: (name: string, category: string, color?: string) =>
      ipcRenderer.invoke('tags:create', name, category, color),
    delete: (id: number) => ipcRenderer.invoke('tags:delete', id),
  },
  setups: {
    list: () => ipcRenderer.invoke('setups:list'),
    create: (name: string, description?: string) =>
      ipcRenderer.invoke('setups:create', name, description),
    delete: (id: number) => ipcRenderer.invoke('setups:delete', id),
  },

  // ── Instruments ───────────────────────────────────
  instruments: {
    list: () => ipcRenderer.invoke('instruments:list'),
    upsert: (data: unknown) => ipcRenderer.invoke('instruments:upsert', data),
  },

  // ── Imports ───────────────────────────────────────
  imports: {
    parseFile: (filePath: string) => ipcRenderer.invoke('imports:parse-file', filePath),
    commit: (parseResultId: string, choices: unknown) =>
      ipcRenderer.invoke('imports:commit', parseResultId, choices),
    history: () => ipcRenderer.invoke('imports:history'),
  },

  // ── Live bridge ───────────────────────────────────
  bridge: {
    status: () => ipcRenderer.invoke('bridge:status'),
    setWatchDir: (path: string) => ipcRenderer.invoke('bridge:set-watch-dir', path),
    pause: () => ipcRenderer.invoke('bridge:pause'),
    resume: () => ipcRenderer.invoke('bridge:resume'),
    onTradeReceived: (cb: (trade: unknown) => void): (() => void) => {
      const handler = (_: unknown, trade: unknown) => cb(trade);
      ipcRenderer.on('bridge:trade-received', handler);
      return () => { ipcRenderer.removeListener('bridge:trade-received', handler); };
    },
  },

  // ── Capture overlay ───────────────────────────────
  capture: {
    show: () => ipcRenderer.invoke('capture:show'),
    hide: () => ipcRenderer.invoke('capture:hide'),
    captureForegroundWindow: () => ipcRenderer.invoke('capture:foreground-window'),
  },

  // ── Reviews ───────────────────────────────────────
  reviews: {
    list: (kind: 'DAILY' | 'WEEKLY') => ipcRenderer.invoke('reviews:list', kind),
    get: (id: string) => ipcRenderer.invoke('reviews:get', id),
    upsert: (data: unknown) => ipcRenderer.invoke('reviews:upsert', data),
  },

  // ── Calendar (news events) ────────────────────────
  calendar: {
    importCsv: (filePath: string) => ipcRenderer.invoke('calendar:import-csv', filePath),
    list: (range: { from: string; to: string }) =>
      ipcRenderer.invoke('calendar:list', range),
    retagTrades: () => ipcRenderer.invoke('calendar:retag-trades'),
  },

  // ── Reports ───────────────────────────────────────
  reports: {
    tradePdf: (tradeId: string) => ipcRenderer.invoke('reports:trade-pdf', tradeId),
    summaryPdf: (filters: unknown) =>
      ipcRenderer.invoke('reports:summary-pdf', filters),
    exportCsv: (filters: unknown) => ipcRenderer.invoke('reports:export-csv', filters),
  },

  // ── Backup ────────────────────────────────────────
  backup: {
    now: () => ipcRenderer.invoke('backup:now'),
    list: () => ipcRenderer.invoke('backup:list'),
    restore: (zipPath: string) => ipcRenderer.invoke('backup:restore', zipPath),
  },

  // ── Dashboard ─────────────────────────────────────
  dashboard: {
    stats: (filters: unknown, timezone: string) =>
      ipcRenderer.invoke('dashboard:stats', filters, timezone),
  },

  // ── Audit log ─────────────────────────────────────
  audit: {
    forTrade: (tradeId: string) => ipcRenderer.invoke('audit:for-trade', tradeId),
  },

  // ── Files / shell ─────────────────────────────────
  shell: {
    openDataFolder: () => ipcRenderer.invoke('shell:open-data-folder'),
    openLogFolder: () => ipcRenderer.invoke('shell:open-log-folder'),
    showInExplorer: (path: string) => ipcRenderer.invoke('shell:show-in-explorer', path),
  },

  // ── Updater ───────────────────────────────────────
  updater: {
    check: () =>
      ipcRenderer.invoke('updater:check') as Promise<{ ok: boolean; error?: string }>,
    download: () =>
      ipcRenderer.invoke('updater:download') as Promise<void>,
    installAndRestart: () =>
      void ipcRenderer.invoke('updater:install'),
    onEvent: (cb: (e: unknown) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, e: unknown) => cb(e);
      ipcRenderer.on('updater:event', handler);
      return () => ipcRenderer.off('updater:event', handler);
    },
  },
};

contextBridge.exposeInMainWorld('ledger', api);

export type LedgerApi = typeof api;
declare global {
  interface Window {
    ledger: LedgerApi;
  }
}
