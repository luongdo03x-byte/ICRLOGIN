import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { SecretStore } from '@icrlogin/core';

export class EncryptedApiTokenStore {
  constructor(
    private readonly tokenFile: string,
    private readonly secretStore: SecretStore
  ) {}

  async save(token: string | null): Promise<void> {
    if (!token) {
      await rm(this.tokenFile, { force: true });
      return;
    }
    await mkdir(dirname(this.tokenFile), { recursive: true });
    const tempFile = `${this.tokenFile}.tmp`;
    await writeFile(tempFile, this.secretStore.encrypt(token), 'utf8');
    await rename(tempFile, this.tokenFile);
  }

  async load(): Promise<string | null> {
    try {
      const encrypted = (await readFile(this.tokenFile, 'utf8')).trim();
      return encrypted ? this.secretStore.decrypt(encrypted) : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
}

export async function resolveApiToken(
  env: NodeJS.ProcessEnv,
  store: EncryptedApiTokenStore
): Promise<string | undefined> {
  const override = env.ICRLOGIN_API_TOKEN?.trim();
  if (override) return override;
  return (await store.load()) ?? undefined;
}
