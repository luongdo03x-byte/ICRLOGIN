import { PHASE6_DESKTOP_CHANNELS, type ApiEnvelope, type StartupRecoveryPublic } from '@icrlogin/shared';
import type { AppServices } from './app-services.js';
import type { IpcMainLike } from './ipc.js';

function errorEnvelope(): ApiEnvelope<never> {
  return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Internal error' } };
}
async function respond<T>(operation: () => Promise<T> | T): Promise<ApiEnvelope<T>> {
  try { return { ok: true, data: await operation() }; }
  catch { return errorEnvelope() as ApiEnvelope<T>; }
}

export function registerPhase6IpcHandlers(
  ipcMain: IpcMainLike,
  services: Pick<AppServices, 'monitoring'> | null,
  recoveryStatus: StartupRecoveryPublic
): void {
  ipcMain.handle(PHASE6_DESKTOP_CHANNELS.monitoringSnapshot, () => {
    if (!services) return Promise.resolve(errorEnvelope());
    return respond(() => services.monitoring.sample());
  });
  ipcMain.handle(PHASE6_DESKTOP_CHANNELS.recoveryStatus, () => respond(() => ({ ...recoveryStatus })));
}
