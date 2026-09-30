import { describe, expect, it } from 'vitest';
import { ProfileOperationLock } from '../src/browsers/operation-lock.js';
import { ProcessRegistry } from '../src/browsers/process-registry.js';
import { ProfileMutationCoordinator } from '../src/extensions/profile-mutation-coordinator.js';

const runtime = (profileId: string) => ({
  profileId,
  pid: 42,
  browserVersion: '144',
  executablePath: 'chrome.exe',
  userDataDir: `profiles/${profileId}/user-data`,
  remoteDebuggingPort: 43127,
  cdpHttpUrl: 'http://127.0.0.1:43127',
  webSocketDebuggerUrl: 'ws://127.0.0.1:43127/devtools/browser/x',
  state: 'running' as const,
  startedAt: '2026-09-30T00:00:00.000Z'
});

describe('ProfileMutationCoordinator', () => {
  it('serializes with browser lifecycle and rechecks runtime after acquiring the shared lock', async () => {
    const lock = new ProfileOperationLock();
    const registry = new ProcessRegistry();
    const coordinator = new ProfileMutationCoordinator(lock, registry);
    let releaseStart!: () => void;
    const startGate = new Promise<void>((resolve) => { releaseStart = resolve; });
    let startHasLock = false;
    const start = lock.runExclusive('p1', async () => {
      startHasLock = true;
      await startGate;
      registry.register(runtime('p1'));
    });
    while (!startHasLock) await new Promise((resolve) => setTimeout(resolve, 0));

    let mutated = false;
    const mutation = coordinator.runWithStoppedProfiles(['p1'], async () => { mutated = true; });
    releaseStart();
    await start;

    await expect(mutation).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(mutated).toBe(false);
  });

  it('de-duplicates and sorts profile ids before running one mutation', async () => {
    const coordinator = new ProfileMutationCoordinator(new ProfileOperationLock(), new ProcessRegistry());
    let calls = 0;
    await coordinator.runWithStoppedProfiles(['b', 'a', 'b'], async () => { calls += 1; });
    expect(calls).toBe(1);
  });
});
