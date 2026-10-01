import { PHASE10_DESKTOP_CHANNELS, type ApiEnvelope, type AppAboutPublic } from '@icrlogin/shared';
import type { IpcMainLike } from './ipc.js';

export function registerPhase10IpcHandlers(ipcMain: IpcMainLike, about: AppAboutPublic): void {
  ipcMain.handle(PHASE10_DESKTOP_CHANNELS.aboutGet, (): ApiEnvelope<AppAboutPublic> => ({
    ok: true,
    data: { ...about }
  }));
}
