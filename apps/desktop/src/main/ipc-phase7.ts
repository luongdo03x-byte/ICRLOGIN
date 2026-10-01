import {
  AppError,
  HttpVersionParamsSchema,
  PHASE7_DESKTOP_CHANNELS,
  UpdateAppSettingsSchema,
  type ApiEnvelope,
  type AppSettings,
  type UpdateAppSettings
} from '@icrlogin/shared';
import type { IpcMainLike } from './ipc.js';

interface SettingsLike {
  read(): Promise<AppSettings>;
  update(patch: UpdateAppSettings): Promise<AppSettings>;
}

interface BrowserVersionsLike {
  remove(version: string): Promise<void>;
}

export interface RegisterPhase7IpcOptions {
  settings: SettingsLike;
  setLaunchAtLogin(enabled: boolean): void | Promise<void>;
  browserVersions: BrowserVersionsLike | null;
}

function errorEnvelope(error: unknown): ApiEnvelope<never> {
  if (error instanceof AppError) return { ok: false, error: { code: error.code, message: error.message } };
  return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Internal error' } };
}

async function respond<T>(operation: () => Promise<T> | T): Promise<ApiEnvelope<T>> {
  try { return { ok: true, data: await operation() }; }
  catch (error) { return errorEnvelope(error) as ApiEnvelope<T>; }
}

export function registerPhase7IpcHandlers(ipcMain: IpcMainLike, options: RegisterPhase7IpcOptions): void {
  ipcMain.handle(PHASE7_DESKTOP_CHANNELS.settingsGet, () => respond(() => options.settings.read()));

  ipcMain.handle(PHASE7_DESKTOP_CHANNELS.settingsUpdate, (_event, payload) => respond(async () => {
    let patch: UpdateAppSettings;
    try { patch = UpdateAppSettingsSchema.parse(payload) as UpdateAppSettings; }
    catch { throw new AppError('INVALID_REQUEST', 'Invalid settings payload'); }

    const before = await options.settings.read();
    const launchChanged = patch.launchAtLogin !== undefined && patch.launchAtLogin !== before.launchAtLogin;
    if (launchChanged) await options.setLaunchAtLogin(patch.launchAtLogin!);

    try {
      const settings = await options.settings.update(patch);
      return { settings, restartRequired: settings.localApiPort !== before.localApiPort };
    } catch (error) {
      if (launchChanged) {
        try { await options.setLaunchAtLogin(before.launchAtLogin); } catch { /* preserve persistence error */ }
      }
      throw error;
    }
  }));

  ipcMain.handle(PHASE7_DESKTOP_CHANNELS.browserRemove, (_event, payload) => respond(async () => {
    if (!options.browserVersions) throw new AppError('INTERNAL_ERROR', 'Browser services are unavailable');
    let version: string;
    try { ({ version } = HttpVersionParamsSchema.parse(payload)); }
    catch { throw new AppError('INVALID_REQUEST', 'Invalid browser version'); }
    await options.browserVersions.remove(version);
    return null;
  }));
}
