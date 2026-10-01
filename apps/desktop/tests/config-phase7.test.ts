import { describe, expect, it } from 'vitest';
import { resolveLocalApiSettings } from '../src/main/config.js';

describe('phase 7 local API settings', () => {
  const paths = { configDir: 'R/config' } as any;

  it('uses persisted port when no environment override is present', () => {
    expect(resolveLocalApiSettings({}, paths, 9555).port).toBe(9555);
  });

  it('keeps the environment variable as an explicit development override', () => {
    expect(resolveLocalApiSettings({ ICRLOGIN_API_PORT: '9666' }, paths, 9555).port).toBe(9666);
  });

  it('rejects an invalid persisted default instead of silently binding elsewhere', () => {
    expect(() => resolveLocalApiSettings({}, paths, 70000)).toThrow('Invalid local API port');
  });
});
