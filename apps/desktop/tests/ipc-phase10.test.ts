import { describe, expect, it } from 'vitest';
import { PHASE10_DESKTOP_CHANNELS } from '@icrlogin/shared';
import { registerPhase10IpcHandlers } from '../src/main/ipc-phase10.js';
import type { IpcMainLike } from '../src/main/ipc.js';

describe('phase 10 about IPC', () => {
  it('returns only the public V1 version/readiness matrix', async () => {
    const handlers = new Map<string, (event: any, payload?: unknown) => unknown>();
    const ipcMain: IpcMainLike = { handle(channel, handler) { handlers.set(channel, handler); } };
    const about = {
      appVersion: '0.1.0',
      localApiVersion: 1,
      databaseSchemaVersion: 4,
      backupFormatVersion: 1,
      databaseHealthy: true,
      packaged: true,
      runtimeReadiness: 'operational' as const
    };
    registerPhase10IpcHandlers(ipcMain, about);
    const result = await handlers.get(PHASE10_DESKTOP_CHANNELS.aboutGet)!({ sender: { send() {} } });
    expect(result).toEqual({ ok: true, data: about });
    expect(JSON.stringify(result)).not.toContain('path');
    expect(JSON.stringify(result)).not.toContain('token');
    expect(JSON.stringify(result)).not.toContain('secret');
  });
});
