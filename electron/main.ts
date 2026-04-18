/**
 * FXLedger — Electron main process
 *
 * Responsibilities:
 *  - Create the main BrowserWindow
 *  - Initialize the data directory and SQLite database
 *  - Register the global hotkey for capture overlay
 *  - Start the MT4/5 file bridge watcher
 *  - Wire up all IPC handlers
 *  - Handle clean shutdown (auto-backup)
 */

import { app, BrowserWindow, dialog, globalShortcut, screen, Tray, Menu, nativeImage } from 'electron';
import log from 'electron-log/main.js';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { registerIpcHandlers } from './ipc/index';
import { initializeDatabase, closeDatabase } from '../src/lib/db/client';
import { getTodayStats } from '../src/lib/db/queries';
import { startBridgeWatcher, stopBridgeWatcher } from './services/bridge-watcher';
import { runAutoBackup } from './services/backup';
import { seedSampleData } from './services/seed';
// Auto-updater — only activated when user enables it in Settings.
import { initAutoUpdateService, runAutoUpdateCheck } from './services/auto-update';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const APP_NAME = 'FXLedger';
// Data folder name remains 'Ledger' for the v1.1 rename to keep existing
// installs pointing at %APPDATA%\Ledger\. A silent auto-backup + optional
// folder migration is planned for T1.3; do not change this literal here.
const DATA_FOLDER_NAME = 'Ledger';
const DEFAULT_DATA_DIR = join(app.getPath('appData'), DATA_FOLDER_NAME);
const CONFIG_FILENAME = 'config.json';

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

// ─────────────────────────────────────────────────────────────
// Logging setup
// ─────────────────────────────────────────────────────────────

log.initialize();
log.transports.file.level = 'info';
log.transports.file.maxSize = 5 * 1024 * 1024; // 5MB
log.transports.console.level = 'debug';

// ─────────────────────────────────────────────────────────────
// Config bootstrap
// ─────────────────────────────────────────────────────────────

function ensureDir(p: string) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

// T2-7: Atomic config save — write to .tmp then rename so that a crash or
// disk-full mid-write never leaves a partially-written config.json. We also
// update in-memory AFTER the file write succeeds, so in-memory and disk stay
// consistent even if writeFileSync throws.
function atomicSaveConfig(next: AppConfig) {
  const configPath = join(DEFAULT_DATA_DIR, CONFIG_FILENAME);
  const tmpPath = configPath + '.tmp';
  writeFileSync(tmpPath, JSON.stringify(next, null, 2));
  renameSync(tmpPath, configPath);
  config = next; // Only updated after the file is safely on disk.
}

function loadOrCreateConfig(): AppConfig {
  ensureDir(DEFAULT_DATA_DIR);
  const configPath = join(DEFAULT_DATA_DIR, CONFIG_FILENAME);

  if (existsSync(configPath)) {
    try {
      return JSON.parse(readFileSync(configPath, 'utf-8')) as AppConfig;
    } catch (err) {
      log.error('Config parse failed, using defaults', err);
    }
  }

  const defaults: AppConfig = {
    data_dir: DEFAULT_DATA_DIR,
    first_run_complete: false,
    theme: 'dark',
    display_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    hotkey: 'CommandOrControl+Alt+L',
    last_account_id: null,
    auto_launch: false,
    auto_update: false,
  };
  writeFileSync(configPath, JSON.stringify(defaults, null, 2));
  return defaults;
}

let config = loadOrCreateConfig();
let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// ─────────────────────────────────────────────────────────────
// Data folder layout
// ─────────────────────────────────────────────────────────────

function ensureDataFolderLayout(dataDir: string) {
  ensureDir(dataDir);
  ensureDir(join(dataDir, 'screenshots'));
  ensureDir(join(dataDir, 'imports'));
  ensureDir(join(dataDir, 'bridge', 'inbox'));
  ensureDir(join(dataDir, 'bridge', 'processed'));
  ensureDir(join(dataDir, 'bridge', 'failed'));
  ensureDir(join(dataDir, 'calendar'));
  ensureDir(join(dataDir, 'reports'));
  ensureDir(join(dataDir, 'logs'));
  ensureDir(join(dataDir, 'backups'));
  ensureDir(join(dataDir, 'backups', 'auto'));
}

// ─────────────────────────────────────────────────────────────
// Window creation
// ─────────────────────────────────────────────────────────────

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0a0a0a',
    show: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      // electron-vite compiles the preload with entryFileNames: '[name].cjs'
      // so the output is preload.cjs, not preload.js.
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // T3-3: sandbox: true is the recommended Electron security setting.
      // Our preload only uses contextBridge + ipcRenderer (both available in
      // sandboxed mode). No bare Node.js requires in preload.ts.
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  // electron-vite 3.x sets ELECTRON_RENDERER_URL (not VITE_DEV_SERVER_URL)
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    // T3-1: Validate ELECTRON_RENDERER_URL before loading — a tampered env var
    // pointing to file:// or a remote URL would load with full IPC privileges.
    try {
      const parsed = new URL(devUrl);
      const isLocal = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
      const isHttp = ['http:', 'https:'].includes(parsed.protocol);
      if (!isLocal || !isHttp) throw new Error(`Untrusted dev URL: ${devUrl}`);
      mainWindow.loadURL(devUrl);
      mainWindow.webContents.openDevTools();
    } catch (err) {
      log.error('ELECTRON_RENDERER_URL validation failed — loading dist instead', err);
      mainWindow.loadFile(join(__dirname, '../dist/index.html'));
    }
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createOverlayWindow() {
  if (overlayWindow) {
    overlayWindow.show();
    overlayWindow.focus();
    return;
  }

  // Place on the monitor where the cursor currently is
  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);
  const width = 420;
  const height = 640;

  overlayWindow = new BrowserWindow({
    width,
    height,
    x: Math.floor(display.bounds.x + (display.bounds.width - width) / 2),
    y: Math.floor(display.bounds.y + (display.bounds.height - height) / 2),
    alwaysOnTop: true,
    skipTaskbar: true,
    frame: false,
    resizable: false,
    backgroundColor: '#0a0a0a',
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const url = process.env.ELECTRON_RENDERER_URL
    ? `${process.env.ELECTRON_RENDERER_URL}#/overlay`
    : `file://${join(__dirname, '../dist/index.html')}#/overlay`;
  overlayWindow.loadURL(url);
  overlayWindow.once('ready-to-show', () => overlayWindow?.show());
  overlayWindow.on('blur', () => {
    // Auto-hide on blur unless user pinned it
    overlayWindow?.hide();
  });
  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

// ─────────────────────────────────────────────────────────────
// Hotkey
// ─────────────────────────────────────────────────────────────

let lastHotkeyAt = 0;

function registerHotkey(combo: string): boolean {
  globalShortcut.unregisterAll();
  const ok = globalShortcut.register(combo, () => {
    // 3-second cooldown
    const now = Date.now();
    if (now - lastHotkeyAt < 3000) return;
    lastHotkeyAt = now;
    log.info('Hotkey triggered:', combo);
    createOverlayWindow();
  });
  if (!ok) {
    log.warn(`Hotkey registration failed for ${combo}`);
  }
  return ok;
}

// ─────────────────────────────────────────────────────────────
// System tray
// ─────────────────────────────────────────────────────────────

function createTray() {
  // Use a minimal 16x16 pixel icon. In production this is replaced by build/tray.png.
  // For dev, generate a 1x1 transparent PNG as fallback.
  let icon: Electron.NativeImage;
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'tray.png')
    : join(process.cwd(), 'build', 'tray.png');

  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) throw new Error('empty icon');
  } catch {
    // Fallback: 1x1 transparent pixel
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('FXLedger — Forex Trading Journal');

  // F-4: Build a fresh context menu each time it is shown so Today's P&L is live.
  async function buildTrayMenu() {
    // Compute UTC midnight for "today" in the user's configured timezone.
    // Approximate by using local date string to get midnight UTC.
    let pnlLabel = "Today's P&L: —";
    try {
      const todayLocal = new Date();
      const midnightUtc = new Date(
        Date.UTC(todayLocal.getFullYear(), todayLocal.getMonth(), todayLocal.getDate()),
      ).toISOString();
      const stats = await getTodayStats(midnightUtc);
      const sign = stats.pnl >= 0 ? '+' : '';
      pnlLabel = `Today: ${sign}$${stats.pnl.toFixed(2)} (${stats.wins}/${stats.trades} trades)`;
    } catch {
      // DB may not be initialized yet during startup — silently use placeholder.
    }

    return Menu.buildFromTemplate([
      { label: pnlLabel, enabled: false },
      { type: 'separator' },
      {
        label: 'Open FXLedger',
        click: () => {
          if (!mainWindow) {
            createMainWindow();
          } else {
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      {
        label: 'New Trade (overlay)',
        click: () => createOverlayWindow(),
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => app.quit(),
      },
    ]);
  }

  // Set an initial static menu, then rebuild on every right-click.
  buildTrayMenu().then((menu) => tray?.setContextMenu(menu)).catch(() => {});

  tray.on('right-click', () => {
    buildTrayMenu()
      .then((menu) => {
        tray?.setContextMenu(menu);
        tray?.popUpContextMenu(menu);
      })
      .catch(() => {});
  });

  tray.on('double-click', () => {
    if (!mainWindow) {
      createMainWindow();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  log.info('Tray created');
}

// ─────────────────────────────────────────────────────────────
// App lifecycle
// ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Set the app's display name so window title, tray tooltip, and
  // taskbar entries show the product brand (FXLedger) even though the
  // npm package name is lowercase.
  app.setName(APP_NAME);

  ensureDataFolderLayout(config.data_dir);

  // schema.sql is an extraResource bundled alongside the app in production.
  // In development, it lives at the project root (CWD when launched by electron-vite).
  const schemaPath = app.isPackaged
    ? join(process.resourcesPath, 'schema.sql')
    : join(process.cwd(), 'schema.sql');

  try {
    await initializeDatabase(join(config.data_dir, 'ledger.db'), schemaPath);
    log.info('Database initialized');
  } catch (err) {
    log.error('Database initialization failed', err);
    // Show a blocking dialog so the user knows WHY the app quit rather than
    // seeing a silent close. This also makes fresh-install failures diagnosable
    // (missing VC++ runtime, locked db file, etc.).
    dialog.showMessageBoxSync({
      type: 'error',
      title: 'FXLedger — Startup Failed',
      message: 'Could not initialize the database.',
      detail:
        `Data folder: ${config.data_dir}\n\n` +
        `Error: ${err instanceof Error ? err.message : String(err)}\n\n` +
        'Check that the data folder is accessible and that no other instance of FXLedger is running.',
      buttons: ['Quit'],
    });
    app.quit();
    return;
  }

  // On first run, populate the DB with sample trades so the dashboard
  // is not empty. The guided tour (App.tsx) checks first_run_complete === false
  // and shows itself; it sets first_run_complete = true on completion.
  if (!config.first_run_complete) {
    seedSampleData().catch((err) => {
      log.warn('seed: sample data population failed (non-fatal)', err);
    });
  }

  registerIpcHandlers({
    config,
    saveConfig: (next: AppConfig) => {
      // T2-7: Atomic write via atomicSaveConfig — updates in-memory only after
      // the file rename succeeds, keeping disk and memory in sync.
      atomicSaveConfig(next);
    },
    showOverlay: createOverlayWindow,
    hideOverlay: () => overlayWindow?.hide(),
  });

  // Try the configured hotkey, fall back through alternatives.
  const hotkeyCandidates = [
    config.hotkey,
    'CommandOrControl+Alt+L',
    'CommandOrControl+Alt+J',
    'CommandOrControl+Shift+L',
  ].filter(Boolean);
  let hotkeyRegistered = false;
  for (const combo of hotkeyCandidates) {
    if (registerHotkey(combo)) {
      hotkeyRegistered = true;
      if (combo !== config.hotkey) {
        // T2-7: Use atomic save instead of direct writeFileSync.
        atomicSaveConfig({ ...config, hotkey: combo });
      }
      break;
    }
  }
  // T2-8: Log a visible error when ALL hotkey candidates fail so the user knows
  // why Ctrl+Alt+L does nothing. The empty string sentinel lets Settings UI
  // display a "Hotkey unavailable" banner.
  if (!hotkeyRegistered) {
    log.error(
      'Hotkey registration failed for all candidates. ' +
        'The capture overlay is unreachable via keyboard. ' +
        'Go to Settings → Hotkey to choose a different shortcut.',
    );
    atomicSaveConfig({ ...config, hotkey: '' });
  }

  startBridgeWatcher(config.data_dir).catch((err) => {
    log.error('Bridge watcher failed to start', err);
  });

  // Sync Windows auto-launch setting based on stored config.
  try {
    app.setLoginItemSettings({ openAtLogin: config.auto_launch ?? false });
  } catch (err) {
    log.warn('setLoginItemSettings failed', err);
  }

  // Auto-updater — event listeners are always registered (so Settings can
  // trigger manual checks), but the background check only fires if the user
  // has opted in.
  initAutoUpdateService();
  if (config.auto_update) {
    runAutoUpdateCheck();
  }

  createMainWindow();
  createTray();
});

app.on('window-all-closed', async () => {
  // On Windows, closing the main window hides to tray rather than quitting.
  // The app stays alive for the tray icon and the hotkey overlay.
  // Actual quit happens via Tray → Quit or app.quit().
  try {
    await runAutoBackup(config.data_dir);
  } catch (err) {
    log.error('Auto-backup on close failed', err);
  }
  if (process.platform === 'darwin') {
    // macOS convention: closing last window ≠ quit
  }
  // On Windows: do NOT call app.quit() here — tray keeps it running.
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopBridgeWatcher().catch((err) => log.error('stopBridgeWatcher on quit', err));
  closeDatabase();
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled promise rejection:', reason);
});
