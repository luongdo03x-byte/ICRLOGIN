import type { BrowserRuntimeInfo } from '@icrlogin/shared';

export class ProcessRegistry {
  private readonly runtimes = new Map<string, BrowserRuntimeInfo>();

  register(runtime: BrowserRuntimeInfo): void {
    this.runtimes.set(runtime.profileId, runtime);
  }

  get(profileId: string): BrowserRuntimeInfo | undefined {
    return this.runtimes.get(profileId);
  }

  remove(profileId: string): BrowserRuntimeInfo | undefined {
    const runtime = this.runtimes.get(profileId);
    this.runtimes.delete(profileId);
    return runtime;
  }

  list(): BrowserRuntimeInfo[] {
    return [...this.runtimes.values()];
  }
}
