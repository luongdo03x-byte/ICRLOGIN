import type { BrowserRuntimeInfo, BrowserRuntimeState } from '@icrlogin/shared';
import type { Database } from '../db/database.js';

interface RuntimeSessionRow {
  profile_id: string;
  pid: number;
  browser_version: string;
  executable_path: string;
  user_data_dir: string;
  debugging_port: number;
  state: BrowserRuntimeState;
  websocket_debugger_url: string;
  started_at: string;
}

function mapRow(row: RuntimeSessionRow): BrowserRuntimeInfo {
  return {
    profileId: row.profile_id,
    pid: row.pid,
    browserVersion: row.browser_version,
    executablePath: row.executable_path,
    userDataDir: row.user_data_dir,
    remoteDebuggingPort: row.debugging_port,
    cdpHttpUrl: `http://127.0.0.1:${row.debugging_port}`,
    webSocketDebuggerUrl: row.websocket_debugger_url,
    state: row.state,
    startedAt: row.started_at
  };
}

export class RuntimeSessionRepository {
  constructor(private readonly db: Database) {}

  upsert(runtime: BrowserRuntimeInfo): BrowserRuntimeInfo {
    this.db.prepare(`
      INSERT INTO runtime_sessions(
        profile_id, pid, browser_version, executable_path, user_data_dir,
        debugging_port, state, websocket_debugger_url, started_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(profile_id) DO UPDATE SET
        pid = excluded.pid,
        browser_version = excluded.browser_version,
        executable_path = excluded.executable_path,
        user_data_dir = excluded.user_data_dir,
        debugging_port = excluded.debugging_port,
        state = excluded.state,
        websocket_debugger_url = excluded.websocket_debugger_url,
        started_at = excluded.started_at
    `).run(
      runtime.profileId,
      runtime.pid,
      runtime.browserVersion,
      runtime.executablePath,
      runtime.userDataDir,
      runtime.remoteDebuggingPort,
      runtime.state,
      runtime.webSocketDebuggerUrl,
      runtime.startedAt
    );
    return runtime;
  }

  get(profileId: string): BrowserRuntimeInfo | null {
    const row = this.db.prepare('SELECT * FROM runtime_sessions WHERE profile_id = ?').get(profileId) as RuntimeSessionRow | undefined;
    return row ? mapRow(row) : null;
  }

  list(): BrowserRuntimeInfo[] {
    return (this.db.prepare('SELECT * FROM runtime_sessions ORDER BY started_at').all() as RuntimeSessionRow[]).map(mapRow);
  }

  delete(profileId: string): void {
    this.db.prepare('DELETE FROM runtime_sessions WHERE profile_id = ?').run(profileId);
  }
}
