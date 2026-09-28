import { describe, expect, it } from 'vitest';
import { createSecureWindowOptions, maskDataRoot, moduleDirectory, prepareUserDataRoot } from '../src/main/config.js';
import { WindowsProcessInspector } from '../src/main/windows-process-inspector.js';

describe('desktop main security configuration', () => {
  it('resolves an ESM module directory without relying on __dirname', () => {
    const directory = moduleDirectory(import.meta.url);
    expect(directory.includes('file:')).toBe(false);
    expect(directory.length > 0).toBe(true);
  });

  it('creates the managed data root before assigning Electron userData', async () => {
    const events: string[] = [];
    const prepared = await prepareUserDataRoot('C:/Users/Test/AppData/Local', async (paths) => {
      events.push(`ensure:${paths.root}`);
    }, (_name, path) => {
      events.push(`set:${path}`);
    });
    expect(prepared.dataRoot.replaceAll('\\', '/')).toBe('C:/Users/Test/AppData/Local/ICRLogin');
    expect(events[0]?.startsWith('ensure:')).toBe(true);
    expect(events[1]?.startsWith('set:')).toBe(true);
  });

  it('hardens renderer isolation and returns a user-friendly data-root label', () => {
    const options = createSecureWindowOptions('C:/ICRLogin/preload/index.js');
    expect(options.webPreferences.contextIsolation).toBe(true);
    expect(options.webPreferences.nodeIntegration).toBe(false);
    expect(options.webPreferences.sandbox).toBe(true);
    expect(options.webPreferences.preload).toBe('C:/ICRLogin/preload/index.js');
    expect(maskDataRoot('C:/Users/Test/AppData/Local/ICRLogin')).toBe('%LOCALAPPDATA%/ICRLogin');
  });

  it('queries a PID without shell interpolation and parses executable/command line identity', async () => {
    const calls: Array<{ file: string; args: readonly string[] }> = [];
    const inspector = new WindowsProcessInspector(async (file: string, args: readonly string[]) => {
      calls.push({ file, args });
      return JSON.stringify({ ProcessId: 6262, ExecutablePath: 'C:/Browser/chrome.exe', CommandLine: 'chrome.exe --user-data-dir=C:/Profiles/p1/user-data' });
    });
    const snapshot = await inspector.inspect(6262);
    expect(snapshot?.pid).toBe(6262);
    expect(snapshot?.executablePath).toBe('C:/Browser/chrome.exe');
    expect(snapshot?.commandLine.includes('--user-data-dir=')).toBe(true);
    expect(calls[0]?.file).toBe('powershell.exe');
    expect(calls[0]?.args.join(' ').includes('6262')).toBe(true);
  });

  it('returns null when PowerShell reports no matching process', async () => {
    const inspector = new WindowsProcessInspector(async () => '');
    expect(await inspector.inspect(9999)).toBe(null);
  });
});
