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
