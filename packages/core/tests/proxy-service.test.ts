import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAppPaths, ensureAppPaths } from '../src/app-paths.js';
import { openDatabase } from '../src/db/database.js';
import { runMigrations } from '../src/db/migrate.js';
import { buildProxyServerArg } from '../src/proxies/proxy-args.js';
import { ProxyService } from '../src/proxies/proxy-service.js';
import { ProxyRepository } from '../src/repositories/proxy-repository.js';
import { FakeSecretStore } from './helpers/fake-secret-store.js';
import { createTempRoot, removeTempRoot } from './helpers/temp-root.js';

async function withService(run: (service: ProxyService, repository: ProxyRepository) => Promise<void>) {
  const root = await createTempRoot();
  try {
    const paths = createAppPaths(root);
    await ensureAppPaths(paths);
    const db = openDatabase(join(paths.dataDir, 'icrlogin.db'));
    try {
      runMigrations(db);
      const repository = new ProxyRepository(db);
      const service = new ProxyService(repository, new FakeSecretStore(), {
        idFactory: () => '77777777-7777-4777-8777-777777777777',
        now: () => '2026-09-28T05:00:00.000Z'
      });
      await run(service, repository);
    } finally {
      db.close();
    }
  } finally {
    await removeTempRoot(root);
  }
}

describe('proxy service', () => {
  it('encrypts password at rest and never exposes it in the public DTO or proxy-server arg', async () => {
    await withService(async (service, repository) => {
      const created = await service.create({
        name: 'local',
        type: 'http',
        host: '127.0.0.1',
        port: 8080,
        username: 'u',
        password: 'secret'
      });

      expect(created.username).toBe('u');
      expect(created.hasPassword).toBe(true);
      expect(JSON.stringify(created).includes('secret')).toBe(false);

      const raw = repository.getInternalById(created.id);
      expect(raw?.encryptedPassword === 'secret').toBe(false);
      expect(raw?.encryptedPassword?.includes('secret') ?? false).toBe(false);

      const runtime = await service.getRuntimeConfig(created.id);
      expect(runtime.password).toBe('secret');
      expect(buildProxyServerArg(runtime)).toBe('http://127.0.0.1:8080');
      expect(buildProxyServerArg(runtime).includes('secret')).toBe(false);
    });
  });

  it('rejects unsupported schemes, blank hosts, and ports outside 1..65535', async () => {
    await withService(async (service) => {
      for (const input of [
        { name: 'p', type: 'ftp', host: '127.0.0.1', port: 21 },
        { name: 'p', type: 'http', host: '', port: 8080 },
        { name: 'p', type: 'http', host: '127.0.0.1', port: 0 },
        { name: 'p', type: 'socks5', host: '127.0.0.1', port: 65536 }
      ]) {
        let code: string | undefined;
        try {
          await service.create(input as any);
        } catch (error: any) {
          code = error.code;
        }
        expect(code).toBe('PROXY_INVALID');
      }
    });
  });

  it('updates public fields and secrets, then deletes the proxy', async () => {
    await withService(async (service) => {
      const created = await service.create({
        name: 'local', type: 'socks5', host: '127.0.0.1', port: 1080, password: 'first'
      });
      const updated = await service.update(created.id, { name: 'updated', password: 'second' });
      expect(updated.name).toBe('updated');
      expect(updated.hasPassword).toBe(true);
      expect((await service.getRuntimeConfig(created.id)).password).toBe('second');

      await service.delete(created.id);
      expect(await service.get(created.id)).toBe(null);
    });
  });
});
