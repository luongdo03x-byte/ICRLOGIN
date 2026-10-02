import { describe, expect, it } from 'vitest';
import type { Profile } from '../../shared/src/profile.js';
import type { ProxyRuntimeConfig } from '../src/proxies/proxy-args.js';
import {
  ChromiumLauncher,
  buildChromiumArgs,
  type SpawnFunction
} from '../src/browsers/chromium-launcher.js';
import { FakeSpawnedProcess } from './helpers/fake-process.js';

const profile: Profile = {
  id: 'p1',
  name: 'QA',
  description: null,
  groupId: null,
  browserVersion: '143.0.0',
  proxyId: 'proxy-1',
  userAgent: 'ICRLogin-Test-UA',
  language: 'en-US',
  timezone: 'UTC',
  environmentMode: 'auto',
  latitude: null,
  longitude: null,
  accuracy: null,
  windowWidth: 1280,
  windowHeight: 800,
  screenWidth: 1920,
  screenHeight: 1080,
  webrtcEnabled: true,
  geolocationMode: 'ask',
  startupUrls: ['https://one.example/', 'https://two.example/'],
  createdAt: '2026-09-28T00:00:00.000Z',
  updatedAt: '2026-09-28T00:00:00.000Z',
  lastUsedAt: null,
  deletedAt: null
};

const proxy: ProxyRuntimeConfig = {
  id: 'proxy-1', type: 'http', host: '127.0.0.1', port: 8080, username: 'u', password: 'secret'
};

describe('chromium launcher', () => {
  it('builds isolated localhost-only launch args without proxy secrets', () => {
    const args = buildChromiumArgs({
      profile,
      executablePath: 'C:/ICRLogin/browsers/143/chrome.exe',
      profileUserDataDir: 'C:/ICRLogin/profiles/p1/user-data',
      remoteDebuggingPort: 43127,
      proxy
    });

    expect(args).toContain('--user-data-dir=C:/ICRLogin/profiles/p1/user-data');
    expect(args).toContain('--remote-debugging-address=127.0.0.1');
    expect(args).toContain('--remote-debugging-port=43127');
    expect(args).toContain('--proxy-server=http://127.0.0.1:8080');
    expect(args).toContain('--user-agent=ICRLogin-Test-UA');
    expect(args).toContain('--lang=en-US');
    expect(args).toContain('--window-size=1280,800');
    expect(args.join(' ').includes('secret')).toBe(false);
    expect(args.join(' ').includes('0.0.0.0')).toBe(false);
    expect(args.slice(-2)[0]).toBe('https://one.example/');
    expect(args.slice(-2)[1]).toBe('https://two.example/');
  });

  it('loads user and runtime extensions while keeping startup URLs deferred when requested', () => {
    const args = buildChromiumArgs({
      profile,
      executablePath: 'C:/ICRLogin/browsers/143/chrome.exe',
      profileUserDataDir: 'C:/ICRLogin/profiles/p1/user-data',
      remoteDebuggingPort: 43127,
      proxy,
      extensionPaths: ['C:/user-ext'],
      runtimeExtensionPaths: ['C:/runtime-ext'],
      deferStartupUrls: true
    });
    expect(args).toContain('--load-extension=C:/user-ext,C:/runtime-ext');
    expect(args).not.toContain('https://one.example/');
    expect(args).not.toContain('https://two.example/');
  });

  it('spawns with an argument array and shell disabled, then exposes close hooks', async () => {
    const fake = new FakeSpawnedProcess();
    let command = '';
    let seenArgs: string[] = [];
    let shell: boolean | undefined;
    const spawnFn: SpawnFunction = ((cmd: string, args: readonly string[], options: { shell: boolean }) => {
      command = cmd;
      seenArgs = [...args];
      shell = options.shell;
      return fake as any;
    }) as SpawnFunction;
    let forcedPid: number | undefined;
    const launcher = new (ChromiumLauncher as any)(spawnFn, async (pid: number) => { forcedPid = pid; fake.emitExit(null, 'SIGKILL'); });
    const handle = launcher.spawn({
      profile,
      executablePath: 'C:/ICRLogin/browsers/143/chrome.exe',
      profileUserDataDir: 'C:/ICRLogin/profiles/p1/user-data',
      remoteDebuggingPort: 43127,
      proxy
    });

    expect(command).toBe('C:/ICRLogin/browsers/143/chrome.exe');
    expect(seenArgs.join(' ').includes('secret')).toBe(false);
    expect(shell).toBe(false);
    expect(handle.pid).toBe(4242);
    await handle.requestClose();
    await handle.forceTerminate();
    expect(fake.killSignals[0]).toBe(undefined);
    expect(forcedPid).toBe(4242);
    expect(fake.killSignals.includes('SIGKILL')).toBe(false);
  });
});
