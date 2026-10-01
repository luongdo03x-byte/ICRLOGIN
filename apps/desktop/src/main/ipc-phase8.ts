import { PHASE8_DESKTOP_CHANNELS, type ApiEnvelope, type AppUpdateSnapshot } from '@icrlogin/shared';
import type { IpcMainLike } from './ipc.js';

interface UpdateServiceLike {
  snapshot(): AppUpdateSnapshot;
  check(): Promise<AppUpdateSnapshot>;
  download(): Promise<AppUpdateSnapshot>;
}

function errorEnvelope(): ApiEnvelope<never> {
  return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Internal error' } };
}

async function respond<T>(operation: () => Promise<T> | T): Promise<ApiEnvelope<T>> {
  try { return { ok: true, data: await operation() }; }
  catch { return errorEnvelope() as ApiEnvelope<T>; }
}

export function registerPhase8IpcHandlers(ipcMain: IpcMainLike, updates: UpdateServiceLike): void {
  ipcMain.handle(PHASE8_DESKTOP_CHANNELS.updateStatus, () => respond(() => updates.snapshot()));
  ipcMain.handle(PHASE8_DESKTOP_CHANNELS.updateCheck, () => respond(() => updates.check()));
  ipcMain.handle(PHASE8_DESKTOP_CHANNELS.updateDownload, () => respond(() => updates.download()));
}
