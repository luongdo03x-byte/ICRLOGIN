import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Profile } from '@icrlogin/shared';
import { createAppPaths, ensureAppPaths } from '../src/app-paths.js';
import { ProfileCloneService } from '../src/profiles/profile-clone-service.js';
import { ProfileFiles } from '../src/profiles/profile-files.js';
import { createTempRoot, removeTempRoot } from './helpers/temp-root.js';

const source: Profile = {
  id: 'source', name: 'Source', description: null, groupId: null, browserVersion: '144', proxyId: null,
  userAgent: null, language: 'en-US', timezone: 'UTC', windowWidth: 1280, windowHeight: 800,
  screenWidth: 1920, screenHeight: 1080, webrtcEnabled: true, geolocationMode: 'ask', startupUrls: [],
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', lastUsedAt: null, deletedAt: null
};

async function setup(hooks: ConstructorParameters<typeof ProfileFiles>[1] = {}, extraOptions: Record<string, unknown> = {}) {
  const root = await createTempRoot();
  const paths = createAppPaths(root);
  await ensureAppPaths(paths);
  await mkdir(join(paths.profilesDir, source.id, 'user-data'), { recursive: true });
  await mkdir(join(paths.profilesDir, source.id, 'runtime'), { recursive: true });
  await writeFile(join(paths.profilesDir, source.id, 'user-data', 'Cookies'), 'session', 'utf8');
  const rows = new Map<string, Profile>([[source.id, source]]);
  const repository = {
    getById: (id: string) => rows.get(id) ?? null,
    create: (profile: Profile) => { rows.set(profile.id, profile); return profile; },
    deleteById: (id: string) => { rows.delete(id); }
  };
  const relationState: { tags: Record<string, string[]>; extensions: Record<string, string[]> } = {
    tags: { source: ['t1'] }, extensions: { source: ['e1'] }
  };
  const relations = {
    getTagIds: (id: string) => relationState.tags[id] ?? [],
    getExtensionIds: (id: string) => relationState.extensions[id] ?? [],
    setTagIds: (id: string, value: string[]) => { relationState.tags[id] = value; },
    setExtensionIds: (id: string, value: string[]) => { relationState.extensions[id] = value; }
  };
  const states = { getState: (_id: string) => 'stopped' };
  let sequence = 0;
  const service = new ProfileCloneService(repository, new ProfileFiles(paths, hooks), relations, states, {
    idFactory: () => `clone${++sequence}`,
    now: () => '2026-02-01T00:00:00.000Z',
    ...extraOptions
  });
  return { root, paths, rows, relationState, states, service };
}

describe('ProfileCloneService', () => {
  it('config clone copies metadata relations but starts with empty user-data', async () => {
    const fixture = await setup();
    try {
      const profile = await fixture.service.cloneConfig(source.id, { name: 'Clean clone' });
      expect(profile.name).toBe('Clean clone');
      expect(await readdir(join(fixture.paths.profilesDir, profile.id, 'user-data'))).toEqual([]);
      expect(fixture.relationState.tags[profile.id]).toEqual(['t1']);
      expect(fixture.relationState.extensions[profile.id]).toEqual(['e1']);
    } finally { await removeTempRoot(fixture.root); }
  });

  it('full clone copies user-data to a distinct directory and requires stopped source', async () => {
    const fixture = await setup();
    try {
      const profile = await fixture.service.cloneFull(source.id);
      expect(await readFile(join(fixture.paths.profilesDir, profile.id, 'user-data', 'Cookies'), 'utf8')).toBe('session');
      fixture.states.getState = () => 'running';
      await expect(fixture.service.cloneFull(source.id)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    } finally { await removeTempRoot(fixture.root); }
  });

  it('checks stopped state while holding the same profile operation lock', async () => {
    let state = 'stopped';
    let lockCalls = 0;
    const fixture = await setup({}, {
      operationLock: {
        async runExclusive<T>(_profileId: string, operation: () => Promise<T>): Promise<T> {
          lockCalls += 1;
          state = 'running';
          return operation();
        }
      }
    });
    fixture.states.getState = () => state;
    try {
      await expect(fixture.service.cloneFull(source.id)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
      expect(lockCalls).toBe(1);
      expect(fixture.rows.has('clone1')).toBe(false);
    } finally { await removeTempRoot(fixture.root); }
  });

  it('rolls back metadata and filesystem when staging fails', async () => {
    const fixture = await setup({ afterStagingCreated: async () => { throw new Error('copy failed'); } });
    try {
      await expect(fixture.service.cloneFull(source.id)).rejects.toThrow('copy failed');
      expect(fixture.rows.has('clone1')).toBe(false);
      expect((await readdir(fixture.paths.profilesDir)).some((name) => name.includes('clone1'))).toBe(false);
    } finally { await removeTempRoot(fixture.root); }
  });
});
