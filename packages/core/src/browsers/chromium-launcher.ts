import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { AppError, type Profile } from '@icrlogin/shared';
import { buildProxyServerArg, type ProxyRuntimeConfig } from '../proxies/proxy-args.js';

export interface ChromiumLaunchInput {
  profile: Profile;
  executablePath: string;
  profileUserDataDir: string;
  remoteDebuggingPort: number;
  proxy?: ProxyRuntimeConfig | null;
  extensionPaths?: readonly string[];
  runtimeExtensionPaths?: readonly string[];
}

export interface SpawnOptions {
  shell: boolean;
  stdio: 'ignore';
  windowsHide: boolean;
}

export interface SpawnedProcessLike {
  pid?: number | undefined;
  once(event: 'exit', listener: (code: number | null, signal: string | null) => void): this;
  kill(signal?: number | NodeJS.Signals): boolean;
}

export type SpawnFunction = (
  command: string,
  args: readonly string[],
  options: SpawnOptions
) => SpawnedProcessLike;

export interface ChildProcessHandle {
  readonly pid: number;
  onExit(listener: (code: number | null, signal: string | null) => void): void;
  requestClose(): Promise<void>;
  forceTerminate(): Promise<void>;
}

export function buildChromiumArgs(input: ChromiumLaunchInput): string[] {
  const args = [
    `--user-data-dir=${input.profileUserDataDir}`,
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${input.remoteDebuggingPort}`,
    `--lang=${input.profile.language}`,
    `--window-size=${input.profile.windowWidth},${input.profile.windowHeight}`
  ];

  if (input.profile.userAgent) args.push(`--user-agent=${input.profile.userAgent}`);
  if (input.proxy) args.push(`--proxy-server=${buildProxyServerArg(input.proxy)}`);
  const extensionPaths = [...new Set([...(input.extensionPaths ?? []), ...(input.runtimeExtensionPaths ?? [])])];
  if (extensionPaths.length > 0) args.push(`--load-extension=${extensionPaths.join(',')}`);
  args.push(...input.profile.startupUrls);
  return args;
}

const nodeSpawn: SpawnFunction = (command, args, options) =>
  spawn(command, args, options) as ChildProcess;

export type ForceTerminateFunction = (pid: number, child: SpawnedProcessLike) => Promise<void>;

const defaultForceTerminate: ForceTerminateFunction = async (pid, child) => {
  if (process.platform !== 'win32') {
    child.kill('SIGKILL');
    return;
  }
  await new Promise<void>((resolve, reject) => {
    execFile('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, encoding: 'utf8' }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
};

export class ChromiumLauncher {
  constructor(
    private readonly spawnProcess: SpawnFunction = nodeSpawn,
    private readonly forceTerminateProcess: ForceTerminateFunction = defaultForceTerminate
  ) {}

  spawn(input: ChromiumLaunchInput): ChildProcessHandle {
    const args = buildChromiumArgs(input);
    let child: SpawnedProcessLike;
    try {
      child = this.spawnProcess(input.executablePath, args, {
        shell: false,
        stdio: 'ignore',
        windowsHide: false
      });
    } catch (error) {
      throw new AppError('BROWSER_START_FAILED', 'Unable to spawn Chromium', {
        cause: error instanceof Error ? error.message : String(error)
      });
    }

    if (child.pid === undefined) {
      child.kill();
      throw new AppError('BROWSER_START_FAILED', 'Chromium process did not expose a PID');
    }

    const pid = child.pid;
    const thisForceTerminate = this.forceTerminateProcess;
    return {
      pid,
      onExit(listener) { child.once('exit', listener); },
      async requestClose() { child.kill(); },
      async forceTerminate() { await thisForceTerminate(pid, child); }
    };
  }
}
