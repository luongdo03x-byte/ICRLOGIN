import { describe, expect, it } from 'vitest';
import { checkExecutableAvailable } from '../src/main/browser-dto.js';

describe('browser desktop dto helpers', () => {
  it('reports executable availability from a real path probe result', async () => {
    expect(await checkExecutableAvailable('C:/ICRLogin/chrome.exe', async () => undefined)).toBe(true);
    expect(await checkExecutableAvailable('C:/missing/chrome.exe', async () => { throw new Error('ENOENT'); })).toBe(false);
  });
});
