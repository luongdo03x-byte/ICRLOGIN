import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { createAppPaths, ensureAppPaths } from '../src/app-paths.js';
import { ProxyRuntimeExtensionBuilder } from '../src/proxies/proxy-runtime-extension.js';
import { createTempRoot, removeTempRoot } from './helpers/temp-root.js';

describe('ProxyRuntimeExtensionBuilder', () => {
  it('keeps proxy credentials out of generated extension files', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root);
      await ensureAppPaths(paths);
      const builder = new ProxyRuntimeExtensionBuilder(paths);
      const runtime = await builder.prepare('p1', {
        id: 'proxy-1', type: 'http', host: '127.0.0.1', port: 8080,
        username: 'runtime-user', password: 'runtime-pass'
      }, { protectWebRtc: true });
      expect(runtime.extensionPath).not.toBeNull();
      const worker = await readFile(join(runtime.extensionPath!, 'service-worker.js'), 'utf8');
      const manifest = await readFile(join(runtime.extensionPath!, 'manifest.json'), 'utf8');
      expect(worker.includes('runtime-user')).toBe(false);
      expect(worker.includes('runtime-pass')).toBe(false);
      expect(manifest.includes('runtime-user')).toBe(false);
      expect(worker).toContain('disable_non_proxied_udp');
      await runtime.cleanup();
    } finally { await removeTempRoot(root); }
  });

  it('does not create an extension when neither auth nor WebRTC protection is needed', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root);
      await ensureAppPaths(paths);
      const builder = new ProxyRuntimeExtensionBuilder(paths);
      const runtime = await builder.prepare('p1', {
        id: 'proxy-1', type: 'http', host: '127.0.0.1', port: 8080,
        username: null, password: null
      }, { protectWebRtc: false });
      expect(runtime.extensionPath).toBeNull();
      await runtime.cleanup();
    } finally { await removeTempRoot(root); }
  });
});
