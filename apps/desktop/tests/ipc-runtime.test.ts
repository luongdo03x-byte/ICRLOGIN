import { describe, expect, it } from 'vitest';
import { RUNTIME_DESKTOP_CHANNELS } from '@icrlogin/shared';
import { registerRuntimeIpcHandlers } from '../src/main/ipc-runtime.js';

function createIpcHarness() {
  const handlers = new Map<string, (event: any, payload?: unknown) => unknown>();
  return {
    ipcMain: { handle(channel: string, handler: (event: any, payload?: unknown) => unknown) { handlers.set(channel, handler); } },
    invoke(channel: string, event: any, payload?: unknown) {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`Missing handler ${channel}`);
      return handler(event, payload);
    }
  };
}

describe('runtime IPC', () => {
  it('forwards only profile-scoped launch progress while start is active', async () => {
    const { ipcMain, invoke } = createIpcHarness();
    const listeners = new Set<(event: any) => void>();
    let resolveStart!: (value: any) => void;
    const startPromise = new Promise<any>((resolve) => { resolveStart = resolve; });
    const services: any = {
      launchProgress: {
        subscribe(listener: (event: any) => void) { listeners.add(listener); return () => listeners.delete(listener); },
        get() { return null; }
      },
      browsers: { start: () => startPromise },
      launchCoordinator: { getEffectiveEnvironment: () => null },
      geoIp: { invalidate() {} }
    };
    const geoIpRuntime: any = { status: async () => ({ installed: false, credentialConfigured: false, lastModifiedAt: null, updateState: 'unknown' }), setLicenseKey: async () => ({}), update: async () => ({}) };
    registerRuntimeIpcHandlers(ipcMain as any, services, geoIpRuntime);
    const sent: any[] = [];
    const event = { sender: { send(channel: string, payload: unknown) { sent.push([channel, payload]); } } };
    const pending = invoke(RUNTIME_DESKTOP_CHANNELS.profileStart, event, { id: 'p1' }) as Promise<any>;
    for (const listener of listeners) {
      listener({ profileId: 'p2', stage: 'launching', percent: null, receivedBytes: null, totalBytes: null, staleNetworkIdentity: false, message: null });
      listener({ profileId: 'p1', stage: 'launching', percent: null, receivedBytes: null, totalBytes: null, staleNetworkIdentity: false, message: null });
    }
    expect(sent).toHaveLength(1);
    expect(sent[0][0]).toBe(RUNTIME_DESKTOP_CHANNELS.profileLaunchProgress);
    expect(sent[0][1].profileId).toBe('p1');
    resolveStart({ state: 'running', startedAt: '2026-10-02T00:00:00.000Z' });
    await pending;
    expect(listeners.size).toBe(0);
  });

  it('returns safe diagnostics without proxy or credential fields', async () => {
    const { ipcMain, invoke } = createIpcHarness();
    const diagnostics = {
      publicIp: '203.0.113.8', networkIdentityStale: false, timezone: 'Asia/Bangkok',
      latitude: 21, longitude: 105, accuracy: 20, language: 'vi-VN', userAgent: 'UA',
      windowWidth: 1280, windowHeight: 800, screenWidth: 1920, screenHeight: 1080,
      geolocationMode: 'allow', protectWebRtc: true
    };
    const services: any = {
      launchProgress: { subscribe: () => () => {}, get: () => null },
      browsers: { start: async () => ({ state: 'running', startedAt: '' }) },
      launchCoordinator: { getEffectiveEnvironment: () => diagnostics },
      geoIp: { invalidate() {} }
    };
    const geoIpRuntime: any = { status: async () => ({ installed: false, credentialConfigured: false, lastModifiedAt: null, updateState: 'unknown' }), setLicenseKey: async () => ({}), update: async () => ({}) };
    registerRuntimeIpcHandlers(ipcMain as any, services, geoIpRuntime);
    const response: any = await invoke(RUNTIME_DESKTOP_CHANNELS.profileRuntimeDiagnostics, { sender: { send() {} } }, { id: 'p1' });
    expect(response.ok).toBe(true);
    const serialized = JSON.stringify(response.data);
    expect(serialized.includes('password')).toBe(false);
    expect(serialized.includes('licenseKey')).toBe(false);
    expect(serialized.includes('extensionPath')).toBe(false);
  });
});
