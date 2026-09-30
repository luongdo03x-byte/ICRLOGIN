import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { Profile } from '@icrlogin/shared';
import { createAppPaths, ensureAppPaths } from '../src/app-paths.js';
import { BackupArchiveReader } from '../src/backups/archive-reader.js';
import { BackupArchiveWriter } from '../src/backups/archive-writer.js';
import { ProfileBackupService } from '../src/backups/profile-backup-service.js';
import { ProfileRestoreService } from '../src/backups/profile-restore-service.js';
import { ProfileOperationLock } from '../src/browsers/operation-lock.js';
import { openDatabase } from '../src/db/database.js';
import { runMigrations } from '../src/db/migrate.js';
import { ProfileFiles } from '../src/profiles/profile-files.js';
import { ProfileService } from '../src/profiles/profile-service.js';
import { BackupHistoryRepository } from '../src/repositories/backup-history-repository.js';
import { ExtensionRepository } from '../src/repositories/extension-repository.js';
import { ProfileRepository } from '../src/repositories/profile-repository.js';
import { TagRepository } from '../src/repositories/tag-repository.js';
import { createTempRoot, removeTempRoot } from './helpers/temp-root.js';

const profileId = '123e4567-e89b-42d3-a456-426614174000';
const collisionId = '33333333-3333-4333-8333-333333333333';
const tagId = '44444444-4444-4444-8444-444444444444';
const extensionId = '55555555-5555-4555-8555-555555555555';
const profile: Profile = {
  id: profileId, name: 'Round trip', description: 'integration', groupId: null, browserVersion: '144.0.0', proxyId: null, userAgent: null,
  language: 'en-US', timezone: 'UTC', windowWidth: 1280, windowHeight: 800, screenWidth: 1920, screenHeight: 1080,
  webrtcEnabled: true, geolocationMode: 'ask', startupUrls: ['https://example.com'], createdAt: '2026-09-30T00:00:00.000Z',
  updatedAt: '2026-09-30T00:00:00.000Z', lastUsedAt: null, deletedAt: null
};

describe('backup/restore integration', () => {
  it('round-trips metadata, relations and user-data, then resolves a second restore collision safely', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root); await ensureAppPaths(paths);
      const db = openDatabase(join(paths.dataDir, 'icrlogin.db'));
      try {
        await runMigrations(db);
        const profiles = new ProfileRepository(db); const tags = new TagRepository(db); const extensions = new ExtensionRepository(db);
        const history = new BackupHistoryRepository(db); const files = new ProfileFiles(paths); const lock = new ProfileOperationLock();
        profiles.create(profile); await files.create(profileId);
        tags.create({ id: tagId, name: 'Social', createdAt: profile.createdAt, updatedAt: profile.updatedAt });
        extensions.create({ id: extensionId, name: 'Fixture', version: '1.0.0', sourceType: 'unpacked', sourcePath: 'internal/fixture', enabled: true, profileCount: 0, groupCount: 0, createdAt: profile.createdAt, updatedAt: profile.updatedAt });
        tags.setProfileTags(profileId, [tagId]); extensions.setDirectIds(profileId, [extensionId]);
        await writeFile(join(paths.profilesDir, profileId, 'user-data', 'sentinel.txt'), 'persistent-session', 'utf8');

        const backup = new ProfileBackupService({
          profiles, profileFiles: files,
          relations: { getTagIds: (id) => profiles.listTagIds(id), getExtensionIds: (id) => extensions.directIds(id) },
          browsers: { getState: () => 'stopped' }, operationLock: lock, writer: new BackupArchiveWriter(), history, paths,
          options: { appVersion: '0.1.0', idFactory: () => '22222222-2222-4222-8222-222222222222', now: () => '2026-09-30T01:00:00.000Z' }
        });
        const record = await backup.backup(profileId, 'full');
        const archivePath = join(paths.backupsDir, record.fileName);

        const profileService = new ProfileService(profiles, files, { operationLock: lock });
        await profileService.softDelete(profileId); await profileService.permanentDelete(profileId);
        expect(profiles.getById(profileId, { includeDeleted: true })).toBeNull();

        const restore = new ProfileRestoreService({
          archive: new BackupArchiveReader(), profiles,
          references: { groupExists: () => false, proxyExists: () => false, existingTagIds: (ids) => tags.existingIds(ids), existingExtensionIds: (ids) => extensions.existingIds(ids) },
          relations: { setProfileTags: (id, ids) => tags.setProfileTags(id, ids), setProfileExtensionIds: (id, ids) => extensions.setDirectIds(id, ids) },
          profileFiles: files, operationLock: lock, options: { idFactory: () => collisionId, now: () => '2026-09-30T02:00:00.000Z' }
        });
        const first = await restore.restore(archivePath);
        expect(first.createdProfileId).toBe(profileId); expect(first.idCollision).toBe(false);
        expect(profiles.listTagIds(profileId)).toEqual([tagId]); expect(extensions.directIds(profileId)).toEqual([extensionId]);
        expect(await readFile(join(paths.profilesDir, profileId, 'user-data', 'sentinel.txt'), 'utf8')).toBe('persistent-session');

        const second = await restore.restore(archivePath);
        expect(second.createdProfileId).toBe(collisionId); expect(second.idCollision).toBe(true);
        expect(profiles.listTagIds(collisionId)).toEqual([tagId]); expect(extensions.directIds(collisionId)).toEqual([extensionId]);
        expect(await readFile(join(paths.profilesDir, collisionId, 'user-data', 'sentinel.txt'), 'utf8')).toBe('persistent-session');
      } finally { db.close(); }
    } finally { await removeTempRoot(root); }
  });

  it('rejects a tampered archive without mutating profiles', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root); await ensureAppPaths(paths);
      const db = openDatabase(join(paths.dataDir, 'icrlogin.db'));
      try {
        await runMigrations(db);
        const profiles = new ProfileRepository(db); const files = new ProfileFiles(paths); const lock = new ProfileOperationLock();
        const tampered = join(root, 'tampered.icrbackup'); await writeFile(tampered, 'not-a-zip', 'utf8');
        const restore = new ProfileRestoreService({
          archive: new BackupArchiveReader(), profiles,
          references: { groupExists: () => false, proxyExists: () => false, existingTagIds: () => new Set(), existingExtensionIds: () => new Set() },
          relations: { setProfileTags: () => undefined, setProfileExtensionIds: () => undefined },
          profileFiles: files, operationLock: lock
        });
        await expect(restore.restore(tampered)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
        expect(profiles.list({ includeDeleted: true })).toEqual([]);
      } finally { db.close(); }
    } finally { await removeTempRoot(root); }
  });
});
