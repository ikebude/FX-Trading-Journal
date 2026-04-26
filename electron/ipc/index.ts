/**
 * Ledger — IPC handler registry (main process)
 *
 * Registers all renderer↔main IPC channels.
 * Called once from electron/main.ts after the DB is ready.
 */

import log from 'electron-log/main.js';

import { registerAccountHandlers } from './accounts';
import { registerBridgeHandlers } from './bridge';
import { registerCaptureHandlers } from './capture';
import { registerDashboardHandlers } from './dashboard';
import { registerAuditHandlers } from './audit';
import { registerInstrumentHandlers } from './instruments';
import { registerLegHandlers } from './legs';
import { registerNoteHandlers } from './notes';
import { registerReviewHandlers } from './reviews';
import { registerCalendarHandlers } from './calendar';
import { registerReportHandlers } from './reports';
import { registerBackupHandlers } from './backup';
import { registerScreenshotHandlers } from './screenshots';
import { registerSettingsHandlers } from './settings';
import { registerImportHandlers } from './imports';
import { registerStubHandlers } from './stubs';
import { registerTagHandlers } from './tags';
import { registerTradeHandlers } from './trades';
import { registerUpdaterHandlers } from './updater';
import { registerReconciliationHandlers } from './reconciliation';
import { registerLibraryHandlers } from './library';

interface AppConfig {
  data_dir: string;
  first_run_complete: boolean;
  theme: 'dark' | 'light' | 'system';
  display_timezone: string;
  hotkey: string;
  last_account_id: string | null;
  auto_launch: boolean;
  auto_update: boolean;
}

export interface IpcContext {
  config: AppConfig;
  saveConfig: (next: AppConfig) => void;
  showOverlay: () => void;
  hideOverlay: () => void;
}

export function registerIpcHandlers(ctx: IpcContext): void {
  log.info('IPC: registering handlers');

  registerSettingsHandlers(ctx);
  registerDashboardHandlers();
  registerCaptureHandlers(ctx);
  registerBridgeHandlers(ctx);
  registerAccountHandlers();
  registerTradeHandlers();
  registerLegHandlers();
  registerNoteHandlers();
  registerScreenshotHandlers(ctx);
  registerTagHandlers();
  registerInstrumentHandlers();
  registerReviewHandlers();
  registerCalendarHandlers();
  registerReportHandlers();
  registerBackupHandlers(ctx);
  registerAuditHandlers();
  registerImportHandlers(ctx);
  registerStubHandlers();
  registerUpdaterHandlers();
  registerReconciliationHandlers();
  registerLibraryHandlers();

  log.info('IPC: all handlers registered');
}
