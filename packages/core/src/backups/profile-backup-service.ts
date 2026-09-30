import { randomUUID } from 'node:crypto';
import { rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  AppError,
  BACKUP_FORMAT_VERSION,
  type BackupMode,
  type BackupRecordPublic,
  type Profile
} from '@icrlogin/shared';
import type { AppPaths } from '../app-paths.js';
import type { ProfileOperationLock } from '../browsers/operation-lock.js';
import type { BrowserLifecycleState } from '../browsers/browser-service.js';
import type { ProfileFiles } from '../profiles/profile-files.js';
import type { BackupArchiveInputEntry, BackupArchiveWriter } from './archive-writer.js';

interface ProfileReader { getById(id: string): Profile | null; }
interface RelationReader { getTagIds(profileId: string): string[]; getExtensionIds(profileId: string): string[]; }
interface BrowserStateReader { getState(profileId: string): BrowserLifecycleState; }
interface BackupHistoryWriter { create(record: BackupRecordPublic): BackupRecordPublic; }

export interface ProfileBackupServiceOptions {
  appVersion: string;
  idFactory?: () => string;
  now?: () => string;
}

export interface ProfileBackupServiceDependencies {
  profiles: ProfileReader;
  profileFiles: ProfileFiles;
  relations: RelationReader;
  browsers: BrowserStateReader;
  operationLock: ProfileOperationLock;
  writer: BackupArchiveWriter;
  history: BackupHistoryWriter;
  paths: AppPaths;
  options: ProfileBackupServiceOptions;
}

function jsonEntry(archivePath: string, value: unknown): BackupArchiveInputEntry {
  return { archivePath, data: Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8') };
}

export class ProfileBackupService {
  private readonly idFactory: () => string;
  private readonly now: () => string;

  constructor(private readonly deps: ProfileBackupServiceDependencies) {
    this.idFactory = deps.options.idFactory ?? randomUUID;
    this.now = deps.options.now ?? (() => new Date().toISOString());
  }

  async backup(profileId: string, mode: BackupMode): Promise<BackupRecordPublic> {
    if (mode !== 'metadata' && mode !== 'full') throw new AppError('INVALID_REQUEST', 'Invalid backup mode');
    return this.deps.operationLock.runExclusive(profileId, async () => {
      const profile = this.deps.profiles.getById(profileId);
      if (!profile) throw new AppError('PROFILE_NOT_FOUND', 'Profile not found');
      if (mode === 'full' && this.deps.browsers.getState(profileId) !== 'stopped') {
        throw new AppError('INVALID_REQUEST', 'Full profile backup requires a stopped profile');
      }

      const operationId = this.idFactory();
      const createdAt = this.now();
      const fileName = `${profile.id}-${operationId}-${mode}.icrbackup`;
      const stagingPath = join(this.deps.paths.backupsDir, `.tmp-${operationId}.icrbackup`);
      const finalPath = join(this.deps.paths.backupsDir, fileName);
      const entries: BackupArchiveInputEntry[] = [
        jsonEntry('profile.json', profile),
        jsonEntry('tags.json', { tagIds: this.deps.relations.getTagIds(profileId) }),
        jsonEntry('extensions.json', { extensionIds: this.deps.relations.getExtensionIds(profileId) })
      ];

      if (mode === 'full') {
        for (const file of await this.deps.profileFiles.listUserDataFiles(profileId)) {
          entries.push({ archivePath: `user-data/${file.relativePath}`, sourcePath: file.absolutePath });
        }
      }

      try {
        const written = await this.deps.writer.write(stagingPath, entries, {
          formatVersion: BACKUP_FORMAT_VERSION,
          mode,
          createdAt,
          appVersion: this.deps.options.appVersion,
          profileId: profile.id,
          browserVersion: profile.browserVersion
        });
        await rename(stagingPath, finalPath);
        const completed: BackupRecordPublic = {
          id: operationId,
          profileId: profile.id,
          mode,
          fileName,
          checksum: written.checksum,
          status: 'completed',
          createdAt
        };
        try {
          return this.deps.history.create(completed);
        } catch (error) {
          await rm(finalPath, { force: true });
          throw error;
        }
      } catch (error) {
        await rm(stagingPath, { force: true });
        const failed: BackupRecordPublic = {
          id: operationId,
          profileId: profile.id,
          mode,
          fileName,
          checksum: null,
          status: 'failed',
          createdAt
        };
        try { this.deps.history.create(failed); } catch { /* preserve original backup failure */ }
        throw error;
      }
    });
  }
}
