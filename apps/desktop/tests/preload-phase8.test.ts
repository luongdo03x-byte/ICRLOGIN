import { describe, expect, it } from 'vitest';
import { PHASE8_DESKTOP_CHANNELS } from '@icrlogin/shared';
import { createPublicBridge } from '../src/preload/bridge.js';

describe('phase 8 preload bridge', () => {
  it('exposes status/check/download only and no installer primitives', async () => {
    const calls: string[] = [];
    const bridge = createPublicBridge(async (channel) => { calls.push(channel); return { ok: true, data: null } as any; }, () => () => {});
    await bridge.updates.status();
    await bridge.updates.check();
    await bridge.updates.download();
    expect(calls).toEqual([
      PHASE8_DESKTOP_CHANNELS.updateStatus,
      PHASE8_DESKTOP_CHANNELS.updateCheck,
      PHASE8_DESKTOP_CHANNELS.updateDownload
    ]);
    expect((bridge.updates as any).quitAndInstall).toBeUndefined();
    expect((bridge.updates as any).feedUrl).toBeUndefined();
    expect((bridge.updates as any).filePath).toBeUndefined();
  });
});
