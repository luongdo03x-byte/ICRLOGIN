import { describe, expect, it } from 'vitest';
import { PHASE6_DESKTOP_CHANNELS, type StartupRecoveryPublic } from '@icrlogin/shared';
import { registerPhase6IpcHandlers } from '../src/main/ipc-phase6.js';
import type { IpcMainLike } from '../src/main/ipc.js';

function harness(services: any, recoveryStatus: StartupRecoveryPublic) {
  const handlers = new Map<string, (event: any, payload?: unknown) => Promise<any> | any>();
  const ipcMain: IpcMainLike = { handle(channel, handler) { handlers.set(channel, handler); } };
  registerPhase6IpcHandlers(ipcMain, services, recoveryStatus);
  const invoke = (channel: string) => handlers.get(channel)!({ sender: { send() {} } });
  return { invoke };
}

const unhealthy: StartupRecoveryPublic = {
  databaseHealthy: false,
  quickCheck: 'database disk image is malformed',
  recoveredEntries: 0,
  cleanedEntries: 1,
  cleanupErrors: 0
};

describe('phase 6 IPC degraded mode', () => {
  it('always exposes startup recovery status even when operational services are disabled', async () => {
    const { invoke } = harness(null, unhealthy);
    await expect(invoke(PHASE6_DESKTOP_CHANNELS.recoveryStatus)).resolves.toEqual({ ok: true, data: unhealthy });
  });

  it('does not sample processes when services are disabled by an unhealthy database', async () => {
    const { invoke } = harness(null, unhealthy);
    const result = await invoke(PHASE6_DESKTOP_CHANNELS.monitoringSnapshot);
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INTERNAL_ERROR');
  });

  it('samples managed runtimes normally when operational services are available', async () => {
    const snapshot = [{ profileId: 'p1', pid: 7, cpuPercent: 1, workingSetBytes: 2, sampleAt: 'x', status: 'available' }];
    const { invoke } = harness({ monitoring: { sample: async () => snapshot } }, { ...unhealthy, databaseHealthy: true, quickCheck: 'ok' });
    await expect(invoke(PHASE6_DESKTOP_CHANNELS.monitoringSnapshot)).resolves.toEqual({ ok: true, data: snapshot });
  });
});
