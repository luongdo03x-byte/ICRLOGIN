import { describe, expect, it } from 'vitest';
import { AppError, PHASE7_DESKTOP_CHANNELS, type AppSettings } from '@icrlogin/shared';
import { registerPhase7IpcHandlers } from '../src/main/ipc-phase7.js';
import type { IpcMainLike } from '../src/main/ipc.js';

const defaults: AppSettings = { schemaVersion: 1, launchAtLogin: false, closeBehavior: 'ask', localApiPort: 9495 };

function harness(options: {
  current?: AppSettings;
  setLaunchAtLogin?: (enabled: boolean) => void | Promise<void>;
  removeBrowser?: (version: string) => void | Promise<void>;
  browserServicesAvailable?: boolean;
} = {}) {
  let current = options.current ?? defaults;
  const handlers = new Map<string, (event: any, payload?: unknown) => Promise<any> | any>();
  const updates: any[] = [];
  const startupCalls: boolean[] = [];
  const removals: string[] = [];
  const ipcMain: IpcMainLike = { handle(channel, handler) { handlers.set(channel, handler); } };
  registerPhase7IpcHandlers(ipcMain, {
    settings: {
      read: async () => ({ ...current }),
      update: async (patch) => {
        updates.push(patch);
        current = {
          ...current,
          launchAtLogin: patch.launchAtLogin ?? current.launchAtLogin,
          closeBehavior: patch.closeBehavior ?? current.closeBehavior,
          localApiPort: patch.localApiPort ?? current.localApiPort
        };
        return { ...current };
      }
    },
    setLaunchAtLogin: async (enabled) => { startupCalls.push(enabled); await options.setLaunchAtLogin?.(enabled); },
    browserVersions: options.browserServicesAvailable === false ? null : {
      remove: async (version) => { removals.push(version); await options.removeBrowser?.(version); }
    }
  });
  const invoke = (channel: string, payload?: unknown) => handlers.get(channel)!({ sender: { send() {} } }, payload);
  return { invoke, updates, startupCalls, removals };
}

describe('phase 7 IPC', () => {
  it('returns public settings and reports restart requirement when API port changes', async () => {
    const f = harness();
    await expect(f.invoke(PHASE7_DESKTOP_CHANNELS.settingsGet)).resolves.toEqual({ ok: true, data: defaults });
    const result = await f.invoke(PHASE7_DESKTOP_CHANNELS.settingsUpdate, { localApiPort: 9555 });
    expect(result).toEqual({ ok: true, data: { settings: { ...defaults, localApiPort: 9555 }, restartRequired: true } });
    expect(f.startupCalls).toEqual([]);
  });

  it('applies launch-at-login before persistence and does not persist if the OS adapter fails', async () => {
    const f = harness({ setLaunchAtLogin: async () => { throw new Error('denied'); } });
    const result = await f.invoke(PHASE7_DESKTOP_CHANNELS.settingsUpdate, { launchAtLogin: true });
    expect(result.ok).toBe(false);
    expect(f.startupCalls).toEqual([true]);
    expect(f.updates).toEqual([]);
  });

  it('rolls launch-at-login back when persistence fails', async () => {
    const handlers = new Map<string, (event: any, payload?: unknown) => Promise<any> | any>();
    const startupCalls: boolean[] = [];
    const ipcMain: IpcMainLike = { handle(channel, handler) { handlers.set(channel, handler); } };
    registerPhase7IpcHandlers(ipcMain, {
      settings: { read: async () => defaults, update: async () => { throw new Error('disk full'); } },
      setLaunchAtLogin: async (enabled) => { startupCalls.push(enabled); },
      browserVersions: null
    });
    const result = await handlers.get(PHASE7_DESKTOP_CHANNELS.settingsUpdate)!({ sender: { send() {} } }, { launchAtLogin: true });
    expect(result.ok).toBe(false);
    expect(startupCalls).toEqual([true, false]);
  });

  it('removes an unused managed browser and preserves stable in-use errors', async () => {
    const success = harness();
    await expect(success.invoke(PHASE7_DESKTOP_CHANNELS.browserRemove, { version: '144.0.0' })).resolves.toEqual({ ok: true, data: null });
    expect(success.removals).toEqual(['144.0.0']);

    const blocked = harness({ removeBrowser: async () => { throw new AppError('BROWSER_IN_USE', 'in use'); } });
    const result = await blocked.invoke(PHASE7_DESKTOP_CHANNELS.browserRemove, { version: '144.0.0' });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('BROWSER_IN_USE');
  });

  it('keeps settings available but disables browser mutation in degraded mode', async () => {
    const f = harness({ browserServicesAvailable: false });
    await expect(f.invoke(PHASE7_DESKTOP_CHANNELS.settingsGet)).resolves.toMatchObject({ ok: true });
    const result = await f.invoke(PHASE7_DESKTOP_CHANNELS.browserRemove, { version: '144' });
    expect(result.ok).toBe(false);
  });
});
