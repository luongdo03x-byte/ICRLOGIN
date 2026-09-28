import type { InstalledBrowser } from '../browsers/artifact-provider.js';
import type { Database } from '../db/database.js';

interface BrowserVersionRow {
  version: string;
  executable_path: string;
  sha256: string;
  artifact_size: number;
  installed_at: string;
}

function mapRow(row: BrowserVersionRow): InstalledBrowser {
  return {
    version: row.version,
    executablePath: row.executable_path,
    sha256: row.sha256,
    artifactSize: row.artifact_size,
    installedAt: row.installed_at
  };
}

export class BrowserVersionRepository {
  constructor(private readonly db: Database) {}

  get(version: string): InstalledBrowser | null {
    const row = this.db.prepare('SELECT * FROM browser_versions WHERE version = ?').get(version) as BrowserVersionRow | undefined;
    return row ? mapRow(row) : null;
  }

  list(): InstalledBrowser[] {
    const rows = this.db.prepare('SELECT * FROM browser_versions ORDER BY version DESC').all() as BrowserVersionRow[];
    return rows.map(mapRow);
  }

  markInstalled(browser: InstalledBrowser): InstalledBrowser {
    this.db.prepare(`
      INSERT INTO browser_versions(version, executable_path, sha256, artifact_size, installed_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(version) DO UPDATE SET
        executable_path = excluded.executable_path,
        sha256 = excluded.sha256,
        artifact_size = excluded.artifact_size,
        installed_at = excluded.installed_at
    `).run(
      browser.version,
      browser.executablePath,
      browser.sha256,
      browser.artifactSize,
      browser.installedAt
    );
    return browser;
  }

  remove(version: string): void {
    this.db.prepare('DELETE FROM browser_versions WHERE version = ?').run(version);
  }
}
