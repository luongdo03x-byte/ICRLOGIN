import { describe, expect, it } from 'vitest';
import { DESKTOP_CHANNELS } from '@icrlogin/shared';
import { createPublicBridge } from '../src/preload/bridge.js';

describe('phase 4 preload allowlist', () => {
  it('exposes typed methods without generic invoke, file, shell, or path primitives', async () => {
    const calls: Array<{ channel: string; payload: unknown }> = [];
    const bridge = createPublicBridge(async (channel, payload) => {
      calls.push({ channel, payload });
      return { ok: true, data: null } as any;
    }, () => () => {});

    await bridge.tags.list();
    await bridge.profiles.clone('123e4567-e89b-42d3-a456-426614174000', 'config');
    await bridge.templates.list();
    await bridge.extensions.importCrx('C:/Users/Test/ext.crx');
    await bridge.bulk.start(['a', 'b'], 3);

    expect(calls.map((call) => call.channel)).toEqual([
      DESKTOP_CHANNELS.tagsList,
      DESKTOP_CHANNELS.profilesClone,
      DESKTOP_CHANNELS.templatesList,
      DESKTOP_CHANNELS.extensionsImportCrx,
      DESKTOP_CHANNELS.bulkStart
    ]);
    for (const key of ['invoke', 'readFile', 'shell', 'openPath', 'exec']) {
      expect((bridge as any)[key]).toBeUndefined();
    }
  });
});
