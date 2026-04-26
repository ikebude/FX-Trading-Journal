import { ipcMain } from 'electron';
import log from 'electron-log/main.js';

import {
  listMethodologies,
  getMethodology,
  createMethodology,
  updateMethodology,
  softDeleteMethodology,
  listPropFirmPresets,
  getPropFirmPreset,
  createPropFirmPreset,
  updatePropFirmPreset,
  softDeletePropFirmPreset,
} from '../../src/lib/features/library';

export function registerLibraryHandlers(): void {
  // ── Methodologies ────────────────────────────────
  ipcMain.handle('library:methodologies:list', async (_e, activeOnly?: boolean) => {
    try {
      return await listMethodologies(activeOnly ?? true);
    } catch (err) {
      log.error('library:methodologies:list', err);
      throw new Error('Failed to load methodologies');
    }
  });

  ipcMain.handle('library:methodologies:get', async (_e, id: string) => {
    try {
      return await getMethodology(id);
    } catch (err) {
      log.error('library:methodologies:get', err);
      throw new Error('Failed to get methodology');
    }
  });

  ipcMain.handle('library:methodologies:create', async (_e, data: unknown) => {
    try {
      const { name, description, isActive } = data as {
        name: string;
        description?: string;
        isActive?: boolean;
      };
      return await createMethodology({ name, description, isActive: isActive ?? true });
    } catch (err) {
      log.error('library:methodologies:create', err);
      throw new Error('Failed to create methodology');
    }
  });

  ipcMain.handle('library:methodologies:update', async (_e, id: string, data: unknown) => {
    try {
      await updateMethodology(id, data as Parameters<typeof updateMethodology>[1]);
    } catch (err) {
      log.error('library:methodologies:update', err);
      throw new Error('Failed to update methodology');
    }
  });

  ipcMain.handle('library:methodologies:delete', async (_e, id: string) => {
    try {
      await softDeleteMethodology(id);
    } catch (err) {
      log.error('library:methodologies:delete', err);
      throw new Error('Failed to delete methodology');
    }
  });

  // ── Prop firm presets ─────────────────────────────
  ipcMain.handle('library:presets:list', async (_e, activeOnly?: boolean) => {
    try {
      return await listPropFirmPresets(activeOnly ?? true);
    } catch (err) {
      log.error('library:presets:list', err);
      throw new Error('Failed to load prop firm presets');
    }
  });

  ipcMain.handle('library:presets:get', async (_e, id: string) => {
    try {
      return await getPropFirmPreset(id);
    } catch (err) {
      log.error('library:presets:get', err);
      throw new Error('Failed to get prop firm preset');
    }
  });

  ipcMain.handle('library:presets:create', async (_e, data: unknown) => {
    try {
      const { name, maxDrawdownPct, maxDailyLossPct, maxDrawdownAmount, isActive } = data as {
        name: string;
        maxDrawdownPct?: number;
        maxDailyLossPct?: number;
        maxDrawdownAmount?: number;
        isActive?: boolean;
      };
      return await createPropFirmPreset({
        name,
        maxDrawdownPct: maxDrawdownPct ?? null,
        maxDailyLossPct: maxDailyLossPct ?? null,
        maxDrawdownAmount: maxDrawdownAmount ?? null,
        isActive: isActive ?? true,
      });
    } catch (err) {
      log.error('library:presets:create', err);
      throw new Error('Failed to create prop firm preset');
    }
  });

  ipcMain.handle('library:presets:update', async (_e, id: string, data: unknown) => {
    try {
      await updatePropFirmPreset(id, data as Parameters<typeof updatePropFirmPreset>[1]);
    } catch (err) {
      log.error('library:presets:update', err);
      throw new Error('Failed to update prop firm preset');
    }
  });

  ipcMain.handle('library:presets:delete', async (_e, id: string) => {
    try {
      await softDeletePropFirmPreset(id);
    } catch (err) {
      log.error('library:presets:delete', err);
      throw new Error('Failed to delete prop firm preset');
    }
  });
}
