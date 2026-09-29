import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { EncryptedApiTokenStore, resolveApiToken } from '../src/main/api-token-store.js';
import { resolveLocalApiSettings } from '../src/main/config.js';

describe('local API token/config', () => {
  it('fixes host to localhost and validates configurable port', () => {
    const paths = { configDir: '/tmp/icr-config' } as any;
    expect(resolveLocalApiSettings({ ICRLOGIN_API_HOST: '0.0.0.0' }, paths).host).toBe('127.0.0.1');
    expect(resolveLocalApiSettings({}, paths).port).toBe(9495);
    expect(resolveLocalApiSettings({ ICRLOGIN_API_PORT: '9500' }, paths).port).toBe(9500);
    expect(() => resolveLocalApiSettings({ ICRLOGIN_API_PORT: '0' }, paths)).toThrow();
    expect(() => resolveLocalApiSettings({ ICRLOGIN_API_PORT: '65536' }, paths)).toThrow();
  });

  it('stores only encrypted token text and prefers in-memory env override', async () => {
    const root = await mkdtemp(join(tmpdir(), 'icrlogin-token-'));
    try {
      const path = join(root, 'token.enc');
      const secretStore = {
        encrypt(value: string) { return `ENC:${Buffer.from(value).toString('base64')}`; },
        decrypt(value: string) { return Buffer.from(value.slice(4), 'base64').toString('utf8'); }
      };
      const store = new EncryptedApiTokenStore(path, secretStore);
      await store.save('persistent-secret');
      const raw = await readFile(path, 'utf8');
      expect(raw).not.toContain('persistent-secret');
      expect(await store.load()).toBe('persistent-secret');
      expect(await resolveApiToken({ ICRLOGIN_API_TOKEN: 'dev-only' }, store)).toBe('dev-only');
      expect(await readFile(path, 'utf8')).toBe(raw);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
