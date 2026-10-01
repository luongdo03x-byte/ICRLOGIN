import { describe, expect, it } from 'vitest';
import { PHASE7_DESKTOP_CHANNELS } from '@icrlogin/shared';
import { createPublicBridge } from '../src/preload/bridge.js';

describe('phase 7 preload bridge', () => {
  it('exposes only typed settings and browser removal operations', async () => {
    const calls: Array<{ channel: string; payload?: unknown }> = [];
    const bridge = createPublicBridge(async (channel, payload) => {
      calls.push({ channel, payload });
      return { ok: true, data: null } as any;
    }, () => () => {});

    await bridge.settings.get();
    await bridge.settings.update({ launchAtLogin: true, localApiPort: 9555 });
    await bridge.browsers.remove('144.0.0');

    expect(calls).toEqual([
      { channel: PHASE7_DESKTOP_CHANNELS.settingsGet, payload: undefined },
      { channel: PHASE7_DESKTOP_CHANNELS.settingsUpdate, payload: { launchAtLogin: true, localApiPort: 9555 } },
      { channel: PHASE7_DESKTOP_CHANNELS.browserRemove, payload: { version: '144.0.0' } }
    ]);
    expect((bridge as any).filesystem).toBeUndefined();
    expect((bridge as any).shell).toBeUndefined();
    expect((bridge as any).process).toBeUndefined();
  });
});
