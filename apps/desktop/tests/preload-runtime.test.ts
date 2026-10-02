import { describe, expect, it } from 'vitest';
import { RUNTIME_DESKTOP_CHANNELS } from '@icrlogin/shared';
import { createPublicBridge } from '../src/preload/bridge.js';

describe('runtime preload bridge', () => {
  it('uses allowlisted runtime channels and exposes no generic IPC or secret primitive', async () => {
    const calls: Array<[string, unknown]> = [];
    const subscriptions: string[] = [];
    const bridge: any = createPublicBridge(
      async (channel, payload) => {
        calls.push([channel, payload]);
        return { ok: true, data: null } as any;
      },
      (channel) => { subscriptions.push(channel); return () => undefined; }
    );

    await bridge.runtime.diagnostics('p1');
    const unsubscribe = bridge.runtime.onLaunchProgress(() => undefined);
    await bridge.geoIp.status();

    expect(calls[0]).toEqual([RUNTIME_DESKTOP_CHANNELS.profileRuntimeDiagnostics, { id: 'p1' }]);
    expect(calls[1][0]).toBe(RUNTIME_DESKTOP_CHANNELS.geoIpStatus);
    expect(subscriptions).toEqual([RUNTIME_DESKTOP_CHANNELS.profileLaunchProgress]);
    expect(typeof unsubscribe).toBe('function');
    expect('invoke' in bridge).toBe(false);
    expect('decrypt' in bridge).toBe(false);
    expect('safeStorage' in bridge).toBe(false);
  });
});
