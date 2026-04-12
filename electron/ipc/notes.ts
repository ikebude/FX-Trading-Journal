import { ipcMain } from 'electron';
import log from 'electron-log/main.js';

import { createNote, deleteNote, listNotes, updateNote } from '../../src/lib/db/queries';

export function registerNoteHandlers(): void {
  ipcMain.handle('notes:list-for-trade', async (_e, tradeId: string) => {
    try {
      return await listNotes(tradeId);
    } catch (err) {
      log.error('notes:list-for-trade', err);
      throw new Error('Failed to load notes');
    }
  });

  ipcMain.handle('notes:create', async (_e, tradeId: string, body: string) => {
    try {
      return await createNote(tradeId, body);
    } catch (err) {
      log.error('notes:create', err);
      throw new Error('Failed to create note');
    }
  });

  ipcMain.handle('notes:update', async (_e, id: string, body: string) => {
    try {
      return await updateNote(id, body);
    } catch (err) {
      log.error('notes:update', err);
      throw new Error('Failed to update note');
    }
  });

  ipcMain.handle('notes:delete', async (_e, id: string) => {
    try {
      await deleteNote(id);
    } catch (err) {
      log.error('notes:delete', err);
      throw new Error('Failed to delete note');
    }
  });
}
