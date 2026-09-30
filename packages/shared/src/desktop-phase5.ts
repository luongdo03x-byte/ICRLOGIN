import { z } from 'zod';
import type { ApiEnvelope } from './desktop-api.js';
import type { BackupMode, BackupRecordPublic, ImportProfileResult, RestoreProfileResult } from './backup.js';
import type { Profile } from './profile.js';

export const PHASE5_DESKTOP_CHANNELS = {
  backupsList: 'icr:backups:list',
  profilesBackup: 'icr:profiles:backup',
  profilesRestoreBackup: 'icr:profiles:restore-backup',
  profilesExportConfig: 'icr:profiles:export-config',
  profilesImportConfig: 'icr:profiles:import-config',
  profilesListTrash: 'icr:profiles:list-trash',
  profilesRestoreTrash: 'icr:profiles:restore-trash',
  profilesPermanentDelete: 'icr:profiles:permanent-delete'
} as const;

const uuid = z.string().uuid();
export const Phase5DesktopPayloadSchemas = {
  profileBackup: z.object({ id: uuid, mode: z.enum(['metadata', 'full']) }).strict(),
  id: z.object({ id: uuid }).strict(),
  importConfig: z.object({ requestedName: z.string().trim().min(1).max(100).optional() }).strict()
} as const;

export interface IcrPhase5DesktopApi {
  backups: {
    list(): Promise<ApiEnvelope<BackupRecordPublic[]>>;
  };
  phase5Profiles: {
    backup(id: string, mode: BackupMode): Promise<ApiEnvelope<BackupRecordPublic | null>>;
    restoreBackup(): Promise<ApiEnvelope<RestoreProfileResult | null>>;
    exportConfig(id: string): Promise<ApiEnvelope<null>>;
    importConfig(requestedName?: string): Promise<ApiEnvelope<ImportProfileResult | null>>;
    listTrash(): Promise<ApiEnvelope<Profile[]>>;
    restoreTrash(id: string): Promise<ApiEnvelope<Profile>>;
    permanentDelete(id: string): Promise<ApiEnvelope<null>>;
  };
}

export type IcrDesktopApiV5 = import('./desktop-api.js').IcrDesktopApi & IcrPhase5DesktopApi;
