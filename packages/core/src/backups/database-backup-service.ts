import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppPaths } from '../app-paths.js';
import type { Database } from '../db/database.js';

export type DatabaseBackupReason = 'migration' | 'restore';

export interface DatabaseBackupServiceOptions {
  now?: () => string;
  idFactory?: () => string;
  retention?: number;
}

export class DatabaseBackupService {
  private readonly now: () => string;
  private readonly idFactory: () => string;
  private readonly retention: number;

  constructor(
    private readonly db: Pick<Database, 'backup'>,
    private readonly paths: AppPaths,
    options: DatabaseBackupServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? randomUUID;
    this.retention = options.retention ?? 10;
  }

  async create(reason: DatabaseBackupReason): Promise<string> {
    const directory = join(this.paths.backupsDir, 'database');
    await mkdir(directory, { recursive: true });
    const timestamp = this.now();
    const safeTimestamp = timestamp.replace(/[:.]/g, '-');
    const fileName = `icrlogin-${safeTimestamp}-${reason}-${this.idFactory()}.sqlite3`;
    const destination = join(directory, fileName);
    try {
      await this.db.backup(destination);
    } catch (error) {
      await rm(destination, { force: true }).catch(() => undefined);
      throw error;
    }
    await this.enforceRetention(directory);
    return fileName;
  }

  private async enforceRetention(directory: string): Promise<void> {
    const names = (await readdir(directory)).filter((name) => /^icrlogin-.*-(?:migration|restore)-.*\.sqlite3$/.test(name));
    const entries = await Promise.all(names.map(async (name) => ({ name, mtimeMs: (await stat(join(directory, name))).mtimeMs })));
    entries.sort((a, b) => b.mtimeMs - a.mtimeMs || b.name.localeCompare(a.name));
    for (const entry of entries.slice(this.retention)) await rm(join(directory, entry.name), { force: true });
  }
}
