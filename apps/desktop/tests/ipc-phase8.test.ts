import { describe, expect, it } from 'vitest';
import { PHASE8_DESKTOP_CHANNELS } from '@icrlogin/shared';
import { registerPhase8IpcHandlers } from '../src/main/ipc-phase8.js';
import type { IpcMainLike } from '../src/main/ipc.js';

function harness(service: any) {
  const handlers = new Map<string, (event: any, payload?: unknown) => Promise<any> | any>();
  const ipcMain: IpcMainLike = { handle(channel, handler) { handlers.set(channel, handler); } };
  registerPhase8IpcHandlers(ipcMain, service);
  const invoke = (channel: string) => handlers.get(channel)!({ sender: { send() {} } });
  return { invoke };
}

describe('phase 8 IPC', () => {
  it('exposes sanitized updater status/check/download results', async () => {
    const snapshot = { state: 'idle', currentVersion: '1.0.0', availableVersion: null, progressPercent: null, transferredBytes: null, totalBytes: null, installOnNextQuit: false, messageCode: null };
    const service = {
      snapshot: () => snapshot,
      check: async () => ({ ...snapshot, state: 'available', availableVersion: '1.1.0' }),
      download: async () => ({ ...snapshot, state: 'downloaded', availableVersion: '1.1.0', installOnNextQuit: true })
    };
    const { invoke } = harness(service);
    await expect(invoke(PHASE8_DESKTOP_CHANNELS.updateStatus)).resolves.toEqual({ ok: true, data: snapshot });
    await expect(invoke(PHASE8_DESKTOP_CHANNELS.updateCheck)).resolves.toMatchObject({ ok: true, data: { state: 'available', availableVersion: '1.1.0' } });
    await expect(invoke(PHASE8_DESKTOP_CHANNELS.updateDownload)).resolves.toMatchObject({ ok: true, data: { state: 'downloaded', installOnNextQuit: true } });
    expect(JSON.stringify(await invoke(PHASE8_DESKTOP_CHANNELS.updateDownload))).not.toContain('filePath');
    expect(JSON.stringify(await invoke(PHASE8_DESKTOP_CHANNELS.updateDownload))).not.toContain('feedUrl');
  });

  it('returns disabled status without throwing when updater is unavailable', async () => {
    const disabled = { state: 'disabled', currentVersion: '0.1.0', availableVersion: null, progressPercent: null, transferredBytes: null, totalBytes: null, installOnNextQuit: false, messageCode: 'UPDATE_DISABLED' };
    const { invoke } = harness({ snapshot: () => disabled, check: async () => disabled, download: async () => disabled });
    await expect(invoke(PHASE8_DESKTOP_CHANNELS.updateCheck)).resolves.toEqual({ ok: true, data: disabled });
  });
});
