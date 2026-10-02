import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { EncryptedMaxMindCredentialStore } from '../src/main/secret-store.js';
import { createTempRoot, removeTempRoot } from '../../core/tests/helpers/temp-root.js';

describe('EncryptedMaxMindCredentialStore', () => {
  it('persists only encrypted credential payload', async () => {
    const root = await createTempRoot();
    try {
      const file = join(root, 'maxmind.enc');
      const safeStorage = {
        isEncryptionAvailable: () => true,
        encryptString: (_value: string) => Uint8Array.from([5, 6, 7, 8]),
        decryptString: (_value: Uint8Array) => JSON.stringify({ licenseKey: 'restored-key' })
      };
      const store = new EncryptedMaxMindCredentialStore(file, safeStorage);
      await store.write({ licenseKey: 'plain-key' });
      const persisted = await readFile(file, 'utf8');
      expect(persisted).toBe('BQYHCA==');
      expect(persisted.includes('plain-key')).toBe(false);
      await expect(store.read()).resolves.toEqual({ licenseKey: 'restored-key' });
    } finally { await removeTempRoot(root); }
  });
});
