import { join } from 'node:path';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { BackupManifest, Profile } from '@icrlogin/shared';
import { createAppPaths, ensureAppPaths } from '../src/app-paths.js';
import { ProfileOperationLock } from '../src/browsers/operation-lock.js';
import { ProfileFiles } from '../src/profiles/profile-files.js';
import { ProfileRestoreService } from '../src/backups/profile-restore-service.js';
import { createTempRoot, removeTempRoot } from './helpers/temp-root.js';

const sourceId = '123e4567-e89b-42d3-a456-426614174000';
const restoredId = '33333333-3333-4333-8333-333333333333';
const groupId = '11111111-1111-4111-8111-111111111111';
const proxyId = '22222222-2222-4222-8222-222222222222';
const tagExisting = '44444444-4444-4444-8444-444444444444';
const tagMissing = '55555555-5555-4555-8555-555555555555';
const extExisting = '66666666-6666-4666-8666-666666666666';
const extMissing = '77777777-7777-4777-8777-777777777777';

const archivedProfile: Profile = {
  id: sourceId,
  name: 'Archived QA',
  description: 'restore fixture',
  groupId,
  browserVersion: '144.0.7339.12',
  proxyId,
  userAgent: null,
  language: 'en-US',
  timezone: 'Asia/Bangkok',
  windowWidth: 1280,
  windowHeight: 800,
  screenWidth: 1920,
  screenHeight: 1080,
  webrtcEnabled: true,
  geolocationMode: 'ask',
  startupUrls: ['https://example.com'],
  createdAt: '2026-09-29T00:00:00.000Z',
  updatedAt: '2026-09-29T00:00:00.000Z',
  lastUsedAt: '2026-09-29T01:00:00.000Z',
  deletedAt: null
};

function manifest(mode: 'metadata' | 'full'): BackupManifest {
  return {
    formatVersion: 1,
    mode,
    createdAt: '2026-09-30T00:00:00.000Z',
    appVersion: '0.1.0',
    profileId: sourceId,
    browserVersion: archivedProfile.browserVersion,
    payloadChecksum: 'a'.repeat(64),
    entries: []
  };
}

async function fixture(root: string, mode: 'metadata' | 'full', options: { collision?: boolean; failInspect?: boolean; failCreate?: boolean; failPromotion?: boolean } = {}) {
  const paths = createAppPaths(root);
  await ensureAppPaths(paths);
  let failPromotion = options.failPromotion === true;
  const profileFiles = new ProfileFiles(paths, {
    beforeRestorePromotion: async () => {
      if (failPromotion) throw new Error('promotion failed');
    }
  });
  const profiles = new Map<string, Profile>();
  if (options.collision) profiles.set(sourceId, archivedProfile);
  const created: string[] = [];
  const deleted: string[] = [];
  const assignedTags = new Map<string, string[]>();
  const assignedExtensions = new Map<string, string[]>();
  let extractionCount = 0;

  const archive = {
    async inspect() {
      if (options.failInspect) throw new Error('checksum mismatch');
      return { manifest: manifest(mode), entries: [] };
    },
    async extract(_archivePath: string, destination: string) {
      extractionCount += 1;
      await writeFile(join(destination, 'profile.json'), `${JSON.stringify(archivedProfile)}\n`, 'utf8');
      await writeFile(join(destination, 'tags.json'), `${JSON.stringify({ tagIds: [tagExisting, tagMissing] })}\n`, 'utf8');
      await writeFile(join(destination, 'extensions.json'), `${JSON.stringify({ extensionIds: [extExisting, extMissing] })}\n`, 'utf8');
      if (mode === 'full') await writeFile(join(destination, 'user-data', 'sentinel.txt'), 'persistent', 'utf8');
    }
  };

  const service = new ProfileRestoreService({
    archive,
    profiles: {
      getById: (id: string) => profiles.get(id) ?? null,
      create: (profile: Profile) => {
        if (options.failCreate) throw new Error('db failed');
        profiles.set(profile.id, profile);
        created.push(profile.id);
        return profile;
      },
      deleteById: (id: string) => { profiles.delete(id); deleted.push(id); }
    },
    references: {
      groupExists: () => false,
      proxyExists: () => false,
      existingTagIds: (ids: string[]) => new Set(ids.filter((id) => id === tagExisting)),
      existingExtensionIds: (ids: string[]) => new Set(ids.filter((id) => id === extExisting))
    },
    relations: {
      setProfileTags: (profileId: string, ids: string[]) => { assignedTags.set(profileId, ids); },
      setProfileExtensionIds: (profileId: string, ids: string[]) => { assignedExtensions.set(profileId, ids); }
    },
    profileFiles,
    operationLock: new ProfileOperationLock(),
    options: {
      idFactory: () => restoredId,
      now: () => '2026-09-30T02:00:00.000Z'
    }
  });

  return {
    paths, profiles, created, deleted, assignedTags, assignedExtensions, service,
    extractionCount: () => extractionCount,
    setFailPromotion: (value: boolean) => { failPromotion = value; }
  };
}

describe('ProfileRestoreService', () => {
  it('rejects an invalid archive before extraction or profile mutation', async () => {
    const root = await createTempRoot();
    try {
      const f = await fixture(root, 'full', { failInspect: true });
      await expect(f.service.restore(join(root, 'broken.icrbackup'))).rejects.toThrow('checksum mismatch');
      expect(f.extractionCount()).toBe(0);
      expect(f.created).toEqual([]);
    } finally { await removeTempRoot(root); }
  });

  it('restores full user-data, assigns a collision-safe UUID, preserves browser version and drops stale references with warnings', async () => {
    const root = await createTempRoot();
    try {
      const f = await fixture(root, 'full', { collision: true });
      const result = await f.service.restore(join(root, 'profile.icrbackup'));
      expect(result.sourceProfileId).toBe(sourceId);
      expect(result.createdProfileId).toBe(restoredId);
      expect(result.idCollision).toBe(true);
      expect(result.profile.browserVersion).toBe(archivedProfile.browserVersion);
      expect(result.profile.groupId).toBeNull();
      expect(result.profile.proxyId).toBeNull();
      expect(result.profile.lastUsedAt).toBeNull();
      expect(result.profile.deletedAt).toBeNull();
      expect(result.warnings).toEqual(expect.arrayContaining([
        'GROUP_REFERENCE_MISSING',
        'PROXY_REFERENCE_MISSING',
        'TAG_REFERENCES_SKIPPED',
        'EXTENSION_REFERENCES_SKIPPED'
      ]));
      expect(f.assignedTags.get(restoredId)).toEqual([tagExisting]);
      expect(f.assignedExtensions.get(restoredId)).toEqual([extExisting]);
      expect(await readFile(join(f.paths.profilesDir, restoredId, 'user-data', 'sentinel.txt'), 'utf8')).toBe('persistent');
      expect(await readdir(join(f.paths.profilesDir, restoredId, 'runtime'))).toEqual([]);
    } finally { await removeTempRoot(root); }
  });

  it('creates clean user-data for metadata-only restore', async () => {
    const root = await createTempRoot();
    try {
      const f = await fixture(root, 'metadata');
      const result = await f.service.restore(join(root, 'metadata.icrbackup'));
      expect(result.createdProfileId).toBe(sourceId);
      expect(result.idCollision).toBe(false);
      expect(await readdir(join(f.paths.profilesDir, sourceId, 'user-data'))).toEqual([]);
    } finally { await removeTempRoot(root); }
  });

  it('rolls back staging and database mutation on database or filesystem promotion failure', async () => {
    const root = await createTempRoot();
    try {
      const dbFailure = await fixture(root, 'full', { failCreate: true });
      await expect(dbFailure.service.restore(join(root, 'db-fail.icrbackup'))).rejects.toThrow('db failed');
      expect(dbFailure.created).toEqual([]);
      expect((await readdir(dbFailure.paths.profilesDir)).filter((name) => name.startsWith('.restore-'))).toEqual([]);

      const fsFailure = await fixture(root, 'full', { failPromotion: true });
      await expect(fsFailure.service.restore(join(root, 'fs-fail.icrbackup'))).rejects.toThrow('promotion failed');
      expect(fsFailure.created).toEqual([sourceId]);
      expect(fsFailure.deleted).toEqual([sourceId]);
      expect(fsFailure.profiles.has(sourceId)).toBe(false);
      expect((await readdir(fsFailure.paths.profilesDir)).filter((name) => name.startsWith('.restore-'))).toEqual([]);
    } finally { await removeTempRoot(root); }
  });
});
