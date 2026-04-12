import { ipcMain } from 'electron';
import log from 'electron-log/main.js';

import {
  createSetup,
  createTag,
  deleteSetup,
  deleteTag,
  listSetups,
  listTags,
} from '../../src/lib/db/queries';
import { CreateSetupSchema, CreateTagSchema } from '../../src/lib/schemas';
import type { Tag } from '../../src/lib/db/schema';

export function registerTagHandlers(): void {
  ipcMain.handle('tags:list', async (_e, category?: string) => {
    try {
      return await listTags(category);
    } catch (err) {
      log.error('tags:list', err);
      throw new Error('Failed to load tags');
    }
  });

  ipcMain.handle('tags:create', async (_e, name: string, category: string, color?: string) => {
    try {
      const parsed = CreateTagSchema.parse({ name, category, color });
      return await createTag(parsed.name, parsed.category as Tag['category'], parsed.color);
    } catch (err) {
      log.error('tags:create', err);
      throw new Error('Failed to create tag');
    }
  });

  ipcMain.handle('tags:delete', async (_e, id: number) => {
    try {
      await deleteTag(id);
    } catch (err) {
      log.error('tags:delete', err);
      throw new Error('Failed to delete tag');
    }
  });

  ipcMain.handle('setups:list', async () => {
    try {
      return await listSetups();
    } catch (err) {
      log.error('setups:list', err);
      throw new Error('Failed to load setups');
    }
  });

  ipcMain.handle('setups:create', async (_e, name: string, description?: string) => {
    try {
      const parsed = CreateSetupSchema.parse({ name, description });
      return await createSetup(parsed.name, parsed.description);
    } catch (err) {
      log.error('setups:create', err);
      throw new Error('Failed to create setup');
    }
  });

  ipcMain.handle('setups:delete', async (_e, id: number) => {
    try {
      await deleteSetup(id);
    } catch (err) {
      log.error('setups:delete', err);
      throw new Error('Failed to delete setup');
    }
  });
}
