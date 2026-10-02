import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { SecretStore } from '@icrlogin/core';

export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Uint8Array;
  decryptString(value: Uint8Array): string;
}

export class ElectronSafeStorageSecretStore implements SecretStore {
  constructor(private readonly safeStorage: SafeStorageLike) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Electron safeStorage encryption is unavailable');
  }

  encrypt(value: string): string {
    return Buffer.from(this.safeStorage.encryptString(value)).toString('base64');
  }

  decrypt(value: string): string {
    return this.safeStorage.decryptString(Buffer.from(value, 'base64'));
  }
}

export interface MaxMindCredentials {
  licenseKey: string;
}

export class EncryptedMaxMindCredentialStore {
  private readonly crypto: ElectronSafeStorageSecretStore;

  constructor(private readonly filePath: string, safeStorage: SafeStorageLike) {
    this.crypto = new ElectronSafeStorageSecretStore(safeStorage);
  }

  async read(): Promise<MaxMindCredentials | null> {
    try {
      const encrypted = (await readFile(this.filePath, 'utf8')).trim();
      if (!encrypted) return null;
      const parsed = JSON.parse(this.crypto.decrypt(encrypted)) as Partial<MaxMindCredentials>;
      return typeof parsed.licenseKey === 'string' && parsed.licenseKey.length > 0
        ? { licenseKey: parsed.licenseKey }
        : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async write(credentials: MaxMindCredentials): Promise<void> {
    if (!credentials.licenseKey.trim()) throw new Error('MaxMind license key is required');
    await mkdir(dirname(this.filePath), { recursive: true });
    const encrypted = this.crypto.encrypt(JSON.stringify({ licenseKey: credentials.licenseKey.trim() }));
    await writeFile(this.filePath, encrypted, { encoding: 'utf8', mode: 0o600 });
  }
}
