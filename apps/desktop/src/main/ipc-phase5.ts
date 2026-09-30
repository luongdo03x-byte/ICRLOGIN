import { AppError, PHASE5_DESKTOP_CHANNELS, Phase5DesktopPayloadSchemas, type ApiEnvelope } from '@icrlogin/shared';
import type { AppServices } from './app-services.js';
import type { IpcMainLike } from './ipc.js';

export interface Phase5FileDialogs {
  selectRestoreBackup(): Promise<string | null>;
  selectConfigImport(): Promise<string | null>;
  selectConfigExport(profileName: string): Promise<string | null>;
}

function errorEnvelope(error: unknown): ApiEnvelope<never> {
  if (error instanceof AppError) return { ok: false, error: { code: error.code, message: error.message } };
  return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Internal error' } };
}
async function respond<T>(operation: () => Promise<T> | T): Promise<ApiEnvelope<T>> {
  try { return { ok: true, data: await operation() }; }
  catch (error) { return errorEnvelope(error) as ApiEnvelope<T>; }
}
function parse<T>(schema: { parse(value: unknown): T }, payload: unknown): T {
  try { return schema.parse(payload); }
  catch { throw new AppError('INVALID_REQUEST', 'Invalid desktop API payload'); }
}

export function registerPhase5IpcHandlers(ipcMain: IpcMainLike, services: AppServices, dialogs: Phase5FileDialogs): void {
  ipcMain.handle(PHASE5_DESKTOP_CHANNELS.backupsList, () => respond(() => services.backups.list()));
  ipcMain.handle(PHASE5_DESKTOP_CHANNELS.profilesBackup, (_event, payload) => respond(async () => {
    const { id, mode } = parse(Phase5DesktopPayloadSchemas.profileBackup, payload);
    if (mode === 'full' && services.browsers.getState(id) !== 'stopped') throw new AppError('INVALID_REQUEST', 'Stop the profile before full backup');
    return services.profileBackups.backup(id, mode);
  }));
  ipcMain.handle(PHASE5_DESKTOP_CHANNELS.profilesRestoreBackup, () => respond(async () => {
    const source = await dialogs.selectRestoreBackup();
    return source ? services.profileRestore.restore(source) : null;
  }));
  ipcMain.handle(PHASE5_DESKTOP_CHANNELS.profilesExportConfig, (_event, payload) => respond(async () => {
    const { id } = parse(Phase5DesktopPayloadSchemas.id, payload);
    const profile = await services.profiles.get(id);
    if (!profile) throw new AppError('PROFILE_NOT_FOUND', 'Profile not found');
    const destination = await dialogs.selectConfigExport(profile.name);
    if (!destination) return null;
    await services.profileConfigTransfer.exportProfile(id, destination);
    return null;
  }));
  ipcMain.handle(PHASE5_DESKTOP_CHANNELS.profilesImportConfig, (_event, payload) => respond(async () => {
    const { requestedName } = parse(Phase5DesktopPayloadSchemas.importConfig, payload ?? {});
    const source = await dialogs.selectConfigImport();
    return source ? services.profileConfigTransfer.importProfile(source, requestedName) : null;
  }));
  ipcMain.handle(PHASE5_DESKTOP_CHANNELS.profilesListTrash, () => respond(() => services.profiles.listTrash()));
  ipcMain.handle(PHASE5_DESKTOP_CHANNELS.profilesRestoreTrash, (_event, payload) => respond(async () => {
    const { id } = parse(Phase5DesktopPayloadSchemas.id, payload);
    return services.profiles.restore(id);
  }));
  ipcMain.handle(PHASE5_DESKTOP_CHANNELS.profilesPermanentDelete, (_event, payload) => respond(async () => {
    const { id } = parse(Phase5DesktopPayloadSchemas.id, payload);
    await services.profiles.permanentDelete(id);
    return null;
  }));
}
