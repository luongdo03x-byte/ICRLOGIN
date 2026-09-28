export class FakeSpawnedProcess {
  readonly pid = 4242;
  readonly killSignals: Array<string | undefined> = [];
  private exitListener?: (code: number | null, signal: string | null) => void;

  once(event: 'exit', listener: (code: number | null, signal: string | null) => void): this {
    if (event === 'exit') this.exitListener = listener;
    return this;
  }

  kill(signal?: string): boolean {
    this.killSignals.push(signal);
    return true;
  }

  emitExit(code: number | null = 0, signal: string | null = null): void {
    this.exitListener?.(code, signal);
  }
}

export class FakeChildProcessHandle {
  readonly pid: number;
  closeCalls = 0;
  forceCalls = 0;
  closeExits = false;
  forceExits = true;
  private exitListeners: Array<(code: number | null, signal: string | null) => void> = [];

  constructor(pid = 5151) { this.pid = pid; }

  onExit(listener: (code: number | null, signal: string | null) => void): void {
    this.exitListeners.push(listener);
  }

  async requestClose(): Promise<void> {
    this.closeCalls += 1;
    if (this.closeExits) this.emitExit(0, null);
  }

  async forceTerminate(): Promise<void> {
    this.forceCalls += 1;
    if (this.forceExits) this.emitExit(null, 'SIGKILL');
  }

  emitExit(code: number | null = 0, signal: string | null = null): void {
    for (const listener of this.exitListeners.splice(0)) listener(code, signal);
  }
}
