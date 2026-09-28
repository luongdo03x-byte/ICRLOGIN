import { execFile } from 'node:child_process';
import type { ProcessInspector, ProcessSnapshot } from '@icrlogin/core';

export type ExecFileText = (file: string, args: readonly string[]) => Promise<string>;

const defaultExecFile: ExecFileText = (file, args) => new Promise((resolve, reject) => {
  execFile(file, args, { windowsHide: true, encoding: 'utf8' }, (error, stdout) => {
    if (error) reject(error);
    else resolve(stdout);
  });
});

interface WindowsProcessJson {
  ProcessId?: number;
  ExecutablePath?: string | null;
  CommandLine?: string | null;
}

export class WindowsProcessInspector implements ProcessInspector {
  constructor(private readonly exec: ExecFileText = defaultExecFile) {}

  async inspect(pid: number): Promise<ProcessSnapshot | null> {
    if (!Number.isInteger(pid) || pid <= 0) return null;
    const command = `$p = Get-CimInstance Win32_Process -Filter \"ProcessId = ${pid}\"; if ($null -ne $p) { $p | Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress }`;
    let output: string;
    try {
      output = (await this.exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command])).trim();
    } catch {
      return null;
    }
    if (!output) return null;
    try {
      const parsed = JSON.parse(output) as WindowsProcessJson;
      if (parsed.ProcessId !== pid || !parsed.ExecutablePath || !parsed.CommandLine) return null;
      return { pid, executablePath: parsed.ExecutablePath, commandLine: parsed.CommandLine };
    } catch {
      return null;
    }
  }
}
