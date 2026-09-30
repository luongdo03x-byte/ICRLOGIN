import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppPaths } from '../app-paths.js';
import type { Database } from '../db/database.js';

export interface StartupRecoveryReport {
  databaseHealthy: boolean;
  quickCheck: string;
  cleanedEntries: number;
  cleanupErrors: number;
}

interface CleanupTarget {
  root: string;
  matches(name: string): boolean;
}

export class StartupRecoveryService {
  constructor(private readonly deps: { db: Pick<Database, 'pragma'>; paths: AppPaths }) {}

  async run(): Promise<StartupRecoveryReport> {
    const quickCheck = this.readQuickCheck();
    const cleanup = await this.cleanupManagedStaging();
    return {
      databaseHealthy: quickCheck.toLowerCase() === 'ok',
      quickCheck,
      cleanedEntries: cleanup.cleanedEntries,
      cleanupErrors: cleanup.cleanupErrors
    };
  }

  private readQuickCheck(): string {
    try {
      const raw = this.deps.db.pragma('quick_check', { simple: true });
      if (typeof raw === 'string') return raw;
      if (Array.isArray(raw)) {
        const first = raw[0] as unknown;
        if (typeof first === 'string') return first;
        if (first && typeof first === 'object') {
          const value = Object.values(first as Record<string, unknown>)[0];
          if (typeof value === 'string') return value;
        }
      }
      if (raw && typeof raw === 'object') {
        const value = Object.values(raw as Record<string, unknown>)[0];
        if (typeof value === 'string') return value;
      }
      return 'unavailable';
    } catch {
      return 'unavailable';
    }
  }

  private async cleanupManagedStaging(): Promise<{ cleanedEntries: number; cleanupErrors: number }> {
    const targets: CleanupTarget[] = [
      { root: this.deps.paths.profilesDir, matches: (name) => name.startsWith('.staging-') || name.startsWith('.restore-') },
      { root: this.deps.paths.trashDir, matches: (name) => name.startsWith('.purging-') },
      { root: this.deps.paths.browsersDir, matches: (name) => name.startsWith('.staging-') },
      { root: this.deps.paths.downloadsTempDir, matches: (name) => name.startsWith('browser-') && name.endsWith('.zip.part') }
    ];

    let cleanedEntries = 0;
    let cleanupErrors = 0;
    for (const target of targets) {
      let names: string[];
      try {
        names = await readdir(target.root);
      } catch {
        cleanupErrors += 1;
        continue;
      }
      for (const name of names) {
        if (!target.matches(name)) continue;
        try {
          await rm(join(target.root, name), { recursive: true, force: true });
          cleanedEntries += 1;
        } catch {
          cleanupErrors += 1;
        }
      }
    }
    return { cleanedEntries, cleanupErrors };
  }
}
