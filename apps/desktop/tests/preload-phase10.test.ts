import { describe, expect, it } from 'vitest';
import { PHASE10_DESKTOP_CHANNELS } from '@icrlogin/shared';
import { createPublicBridge } from '../src/preload/bridge.js';

describe('phase 10 preload bridge', () => {
  it('exposes only the typed about getter for phase 10', async () => {
    const channels: string[] = [];
    const bridge = createPublicBridge(async (channel) => {
      channels.push(channel);
      return { ok: true, data: {} } as any;
    }, () => () => {});

    await bridge.about.get();
    expect(channels).toEqual([PHASE10_DESKTOP_CHANNELS.aboutGet]);
    expect(Object.keys(bridge.about)).toEqual(['get']);
    expect((bridge.about as any).readFile).toBeUndefined();
    expect((bridge.about as any).env).toBeUndefined();
    expect((bridge.about as any).shell).toBeUndefined();
  });
});
