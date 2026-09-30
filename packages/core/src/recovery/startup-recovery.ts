import { access, readdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppPaths } from '../app-paths.js';
import type { Database } from '../db/database.js';

export interface StartupRecoveryReport {
  databaseHealthy: boolean;
  quickCheck: string;
  recoveredEntries: number;
  cleanedEntries: number;
  cleanupErrors: number;
}

type ProfileStateRow = { deleted_at: string | null };
const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';
const PROFILE_STAGE = new RegExp(`^\\.(?:staging|restore)-(${UUID})-`);
const TRASH_PURGE = new RegExp(`^\\.purging-(${UUID})-`);

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

export class StartupRecoveryService {
  constructor(private readonly deps: { db: Pick<Database, 'pragma' | 'prepare'>; paths: AppPaths }) {}

  async run(): Promise<StartupRecoveryReport> {
    const quickCheck = this.readQuickCheck();
    const databaseHealthy = quickCheck.toLowerCase() === 'ok';
    const counters = { recoveredEntries: 0, cleanedEntries: 0, cleanupErrors: 0 };

    if (databaseHealthy) await this.reconcileDatabaseBackedStaging(counters);
    await this.cleanupSafeTemporaryArtifacts(counters);

    return { databaseHealthy, quickCheck, ...counters };
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

  private getProfileState(profileId: string): ProfileStateRow | null {
    const row = this.deps.db.prepare('SELECT deleted_at FROM profiles WHERE id = ?').get(profileId) as ProfileStateRow | undefined;
    return row ?? null;
  }

  private async reconcileDatabaseBackedStaging(counters: { recoveredEntries: number; cleanedEntries: number; cleanupErrors: number }): Promise<void> {
    await this.reconcileProfileDirectory(counters);
    await this.reconcileTrashDirectory(counters);
  }

  private async reconcileProfileDirectory(counters: { recoveredEntries: number; cleanedEntries: number; cleanupErrors: number }): Promise<void> {
    let names: string[];
    try { names = await readdir(this.deps.paths.profilesDir); }
    catch { counters.cleanupErrors += 1; return; }

    for (const name of names) {
      const match = PROFILE_STAGE.exec(name);
      if (!match) continue;
      const profileId = match[1]!;
      const staged = join(this.deps.paths.profilesDir, name);
      try {
        const state = this.getProfileState(profileId);
        const finalDir = join(this.deps.paths.profilesDir, profileId);
        if (state && state.deleted_at === null && !(await exists(finalDir))) {
          await rename(staged, finalDir);
          counters.recoveredEntries += 1;
        } else if (!state || await exists(finalDir)) {
          await rm(staged, { recursive: true, force: true });
          counters.cleanedEntries += 1;
        } else {
          counters.cleanupErrors += 1;
        }
      } catch {
        counters.cleanupErrors += 1;
      }
    }
  }

  private async reconcileTrashDirectory(counters: { recoveredEntries: number; cleanedEntries: number; cleanupErrors: number }): Promise<void> {
    let names: string[];
    try { names = await readdir(this.deps.paths.trashDir); }
    catch { counters.cleanupErrors += 1; return; }

    for (const name of names) {
      const match = TRASH_PURGE.exec(name);
      if (!match) continue;
      const profileId = match[1]!;
      const staged = join(this.deps.paths.trashDir, name);
      try {
        const state = this.getProfileState(profileId);
        const finalDir = join(this.deps.paths.trashDir, profileId);
        if (state?.deleted_at && !(await exists(finalDir))) {
          await rename(staged, finalDir);
          counters.recoveredEntries += 1;
        } else if (!state || await exists(finalDir)) {
          await rm(staged, { recursive: true, force: true });
          counters.cleanedEntries += 1;
        } else {
          counters.cleanupErrors += 1;
        }
      } catch {
        counters.cleanupErrors += 1;
      }
    }
  }

  private async cleanupSafeTemporaryArtifacts(counters: { cleanedEntries: number; cleanupErrors: number }): Promise<void> {
    const targets = [
      { root: this.deps.paths.browsersDir, matches: (name: string) => name.startsWith('.staging-') },
      { root: this.deps.paths.downloadsTempDir, matches: (name: string) => name.startsWith('browser-') && name.endsWith('.zip.part') }
    ];
    for (const target of targets) {
      let names: string[];
      try { names = await readdir(target.root); }
      catch { counters.cleanupErrors += 1; continue; }
      for (const name of names) {
        if (!target.matches(name)) continue;
        try {
          await rm(join(target.root, name), { recursive: true, force: true });
          counters.cleanedEntries += 1;
        } catch {
          counters.cleanupErrors += 1;
        }
      }
    }
  }
}
