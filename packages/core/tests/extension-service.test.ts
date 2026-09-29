import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/database.js';
import { runMigrations } from '../src/db/migrate.js';
import { ExtensionService } from '../src/extensions/extension-service.js';
import { ExtensionRepository } from '../src/repositories/extension-repository.js';
import { createTempRoot, removeTempRoot } from './helpers/temp-root.js';

async function withDb(run: (db: ReturnType<typeof openDatabase>) => Promise<void> | void) {
  const root = await createTempRoot();
  const db = openDatabase(join(root, 'test.db'));
  try {
    runMigrations(db);
    db.prepare(`INSERT INTO profiles(
      id,name,browser_version,language,timezone,window_width,window_height,screen_width,screen_height,
      webrtc_enabled,geolocation_mode,startup_urls_json,created_at,updated_at
    ) VALUES ('p1','P1','144','en-US','UTC',1280,800,1920,1080,1,'ask','[]','x','x')`).run();
    db.prepare("INSERT INTO groups(id,name,sort_order,created_at,updated_at) VALUES ('g1','G1',0,'x','x')").run();
    db.prepare("UPDATE profiles SET group_id='g1' WHERE id='p1'").run();
    await run(db);
  } finally {
    db.close();
    await removeTempRoot(root);
  }
}

describe('ExtensionService', () => {
  it('imports public DTOs without source path and toggles global enabled state', async () => withDb(async (db) => {
    let index = 0;
    const importer = {
      importUnpacked: async () => ({ id: `e${++index}`, name: 'Ext', version: '1.0', sourceType: 'unpacked' as const, sourcePath: `/internal/e${index}` }),
      importCrx: async () => ({ id: `e${++index}`, name: 'CRX', version: '2.0', sourceType: 'crx' as const, sourcePath: `/internal/e${index}` }),
      removeInternal: async () => {}
    };
    const service = new ExtensionService(new ExtensionRepository(db), importer as any, { now: () => '2026' });
    const extension = await service.importUnpacked('/user/source');
    expect((extension as any).sourcePath).toBeUndefined();
    expect(extension.enabled).toBe(true);
    expect(service.setEnabled(extension.id, false).enabled).toBe(false);
    expect(JSON.stringify(service.list())).not.toContain('/internal');
  }));

  it('deduplicates profile/group assignments and excludes disabled paths from launch resolution', async () => withDb(async (db) => {
    const importer = {
      importUnpacked: async () => ({ id: 'e1', name: 'Ext', version: '1.0', sourceType: 'unpacked' as const, sourcePath: '/internal/e1' }),
      importCrx: async () => { throw new Error('unused'); }, removeInternal: async () => {}
    };
    const service = new ExtensionService(new ExtensionRepository(db), importer as any, { now: () => '2026' });
    const extension = await service.importUnpacked('/source');
    service.assignToProfile(extension.id, 'p1');
    service.assignToProfile(extension.id, 'p1');
    service.assignToGroup(extension.id, 'g1');
    expect(service.listForProfile('p1')).toHaveLength(1);
    expect(service.getDirectExtensionIds('p1')).toEqual([extension.id]);
    expect(service.resolvePaths('p1')).toEqual(['/internal/e1']);
    service.setEnabled(extension.id, false);
    expect(service.listForProfile('p1')).toHaveLength(1);
    expect(service.resolvePaths('p1')).toEqual([]);
  }));

  it('validates assignment references and deletion cascades metadata rows', async () => withDb(async (db) => {
    const importer = {
      importUnpacked: async () => ({ id: 'e1', name: 'Ext', version: '1.0', sourceType: 'unpacked' as const, sourcePath: '/internal/e1' }),
      importCrx: async () => { throw new Error('unused'); }, removeInternal: async () => {}
    };
    const service = new ExtensionService(new ExtensionRepository(db), importer as any, { now: () => '2026' });
    const extension = await service.importUnpacked('/source');
    expect(() => service.assignToProfile(extension.id, 'missing')).toThrowError(expect.objectContaining({ code: 'INVALID_REQUEST' }));
    expect(() => service.assignToGroup('missing', 'g1')).toThrowError(expect.objectContaining({ code: 'INVALID_REQUEST' }));
    service.assignToProfile(extension.id, 'p1');
    service.assignToGroup(extension.id, 'g1');
    await service.delete(extension.id);
    expect(service.list()).toHaveLength(0);
    expect((db.prepare('SELECT COUNT(*) AS count FROM profile_extensions').get() as { count: number }).count).toBe(0);
    expect((db.prepare('SELECT COUNT(*) AS count FROM group_extensions').get() as { count: number }).count).toBe(0);
  }));
});
