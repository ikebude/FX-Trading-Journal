import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  // ── Main process ────────────────────────────────────────────────────────────
  // better-sqlite3, electron-log, chokidar, pdfkit, sharp, etc. are all native
  // Node.js modules — externalizeDepsPlugin keeps them out of the bundle and
  // lets them be require()'d at runtime from node_modules.
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist-electron',
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'electron/main.ts'),
        },
        output: {
          // Emit CJS with explicit .cjs extension so Node/Electron treats this
          // as CommonJS even when package.json has "type": "module".
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
    },
  },

  // ── Preload ─────────────────────────────────────────────────────────────────
  // Runs in a sandboxed renderer context. Only 'electron' module must be
  // externalized — contextBridge and ipcRenderer come from there.
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist-electron',
      emptyOutDir: false, // main.cjs is already there — don't wipe it
      rollupOptions: {
        input: {
          preload: resolve(__dirname, 'electron/preload.ts'),
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
    },
  },

  // ── Renderer ─────────────────────────────────────────────────────────────────
  // Standard Vite + React setup. '@' maps to src/ for clean imports.
  // No Node.js APIs here — everything goes through window.ledger IPC bridge.
  renderer: {
    root: '.',
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html'),
        },
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    plugins: [react()],
  },
});
