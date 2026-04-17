import { useState, useEffect, useCallback } from 'react';

export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'up-to-date'
  | 'downloading'
  | 'ready'
  | 'error';

interface UpdaterState {
  status: UpdaterStatus;
  version: string | null;
  progress: number | null;
  error: string | null;
  lastCheckedAt: Date | null;
  dismissed: boolean;
}

export interface UseUpdaterReturn extends UpdaterState {
  check: () => void;
  download: () => void;
  install: () => void;
  dismiss: () => void;
}

type UpdaterEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string }
  | { type: 'up-to-date'; version: string }
  | { type: 'progress'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; message: string };

const INITIAL: UpdaterState = {
  status: 'idle',
  version: null,
  progress: null,
  error: null,
  lastCheckedAt: null,
  dismissed: false,
};

export function useUpdater(): UseUpdaterReturn {
  const [state, setState] = useState<UpdaterState>(INITIAL);

  useEffect(() => {
    const unsub = window.ledger.updater.onEvent((raw: unknown) => {
      const e = raw as UpdaterEvent;
      setState((prev) => {
        switch (e.type) {
          case 'checking':
            return { ...prev, status: 'checking', dismissed: false, lastCheckedAt: new Date() };
          case 'available':
            return { ...prev, status: 'available', version: e.version, dismissed: false };
          case 'up-to-date':
            return { ...prev, status: 'up-to-date', version: e.version, lastCheckedAt: new Date() };
          case 'progress':
            return { ...prev, status: 'downloading', progress: e.percent };
          case 'downloaded':
            return { ...prev, status: 'ready', version: e.version };
          case 'error':
            return { ...prev, status: 'error', error: e.message };
          default:
            return prev;
        }
      });
    });
    return unsub;
  }, []);

  const check = useCallback(() => {
    window.ledger.updater.check().catch(() => undefined);
  }, []);

  const download = useCallback(() => {
    window.ledger.updater.download().catch(() => undefined);
  }, []);

  const install = useCallback(() => {
    window.ledger.updater.installAndRestart();
  }, []);

  const dismiss = useCallback(() => {
    setState((prev) => ({ ...prev, dismissed: true }));
  }, []);

  return { ...state, check, download, install, dismiss };
}
