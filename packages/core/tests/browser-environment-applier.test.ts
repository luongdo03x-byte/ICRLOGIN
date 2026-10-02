import { describe, expect, it } from 'vitest';
import { BrowserEnvironmentApplier, type CdpConnectionLike } from '../src/browsers/browser-environment-applier.js';

class FakeCdp implements CdpConnectionLike {
  readonly calls: Array<{ method: string; params?: unknown; sessionId?: string }> = [];
  private listeners = new Map<string, Array<(params: any) => void>>();
  async connect(): Promise<void> {}
  async send<T = unknown>(method: string, params?: unknown, sessionId?: string): Promise<T> {
    this.calls.push({ method, params, sessionId });
    if (method === 'Browser.getVersion') return { userAgent: 'Default-UA' } as T;
    if (method === 'Target.getTargets') return { targetInfos: [{ targetId: 't1', type: 'page' }] } as T;
    if (method === 'Target.attachToTarget') return { sessionId: 's1' } as T;
    return {} as T;
  }
  on(method: string, listener: (params: any) => void): () => void {
    const list = this.listeners.get(method) ?? [];
    list.push(listener);
    this.listeners.set(method, list);
    return () => this.listeners.set(method, (this.listeners.get(method) ?? []).filter((item) => item !== listener));
  }
  close(): void {}
}

const environment = {
  publicIp: '203.0.113.10', networkIdentityStale: false, timezone: 'Asia/Bangkok',
  latitude: 21, longitude: 105, accuracy: 20, language: 'vi-VN', userAgent: 'UA',
  windowWidth: 1280, windowHeight: 800, screenWidth: 1920, screenHeight: 1080,
  geolocationMode: 'allow' as const, protectWebRtc: true
};

describe('BrowserEnvironmentApplier', () => {
  it('applies permission and page emulation before returning a live handle', async () => {
    const cdp = new FakeCdp();
    const applier = new BrowserEnvironmentApplier(() => cdp);
    const handle = await applier.apply('ws://127.0.0.1:9222/devtools/browser/test', environment);
    expect(cdp.calls).toContainEqual({
      method: 'Browser.setPermission',
      params: { permission: { name: 'geolocation' }, setting: 'granted' },
      sessionId: undefined
    });
    expect(cdp.calls.some((call) => call.method === 'Emulation.setTimezoneOverride' && call.sessionId === 's1')).toBe(true);
    expect(cdp.calls.some((call) => call.method === 'Emulation.setDeviceMetricsOverride' && call.sessionId === 's1')).toBe(true);
    expect(cdp.calls.some((call) => call.method === 'Emulation.setGeolocationOverride' && call.sessionId === 's1')).toBe(true);
    expect(cdp.calls.some((call) => call.method === 'Emulation.setUserAgentOverride' && call.sessionId === 's1')).toBe(true);
    handle.close();
  });

  it('maps block mode to denied geolocation permission', async () => {
    const cdp = new FakeCdp();
    const applier = new BrowserEnvironmentApplier(() => cdp);
    await applier.apply('ws://127.0.0.1:9222/devtools/browser/test', { ...environment, geolocationMode: 'block' });
    expect(cdp.calls.some((call) => call.method === 'Browser.setPermission' && (call.params as any).setting === 'denied')).toBe(true);
  });
});
