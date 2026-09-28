import type { SecretStore } from '../../src/security/secret-store.js';

export class FakeSecretStore implements SecretStore {
  encrypt(value: string): string {
    return `enc:${[...value].reverse().join('')}`;
  }

  decrypt(value: string): string {
    if (!value.startsWith('enc:')) throw new Error('Invalid encrypted fixture');
    return [...value.slice(4)].reverse().join('');
  }
}
