import type { Database } from '../database.js';

export const migration001 = {
  version: 1,
  up(db: Database): void {
    db.exec(`
      CREATE TABLE proxies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('http', 'https', 'socks5')),
        host TEXT NOT NULL,
        port INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
        username TEXT,
        encrypted_password TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        group_id TEXT,
        browser_version TEXT NOT NULL,
        proxy_id TEXT REFERENCES proxies(id) ON DELETE SET NULL,
        user_agent TEXT,
        language TEXT NOT NULL,
        timezone TEXT NOT NULL,
        window_width INTEGER NOT NULL CHECK (window_width > 0),
        window_height INTEGER NOT NULL CHECK (window_height > 0),
        screen_width INTEGER NOT NULL CHECK (screen_width > 0),
        screen_height INTEGER NOT NULL CHECK (screen_height > 0),
        webrtc_enabled INTEGER NOT NULL CHECK (webrtc_enabled IN (0, 1)),
        geolocation_mode TEXT NOT NULL CHECK (geolocation_mode IN ('allow', 'ask', 'block')),
        startup_urls_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_used_at TEXT,
        deleted_at TEXT
      );

      CREATE TABLE browser_versions (
        version TEXT PRIMARY KEY,
        executable_path TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        artifact_size INTEGER NOT NULL CHECK (artifact_size >= 0),
        installed_at TEXT NOT NULL
      );

      CREATE TABLE runtime_sessions (
        profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
        pid INTEGER NOT NULL,
        browser_version TEXT NOT NULL,
        executable_path TEXT NOT NULL,
        user_data_dir TEXT NOT NULL,
        debugging_port INTEGER NOT NULL CHECK (debugging_port BETWEEN 1 AND 65535),
        state TEXT NOT NULL,
        websocket_debugger_url TEXT NOT NULL,
        started_at TEXT NOT NULL
      );

      CREATE INDEX idx_profiles_deleted_at ON profiles(deleted_at);
      CREATE INDEX idx_profiles_proxy_id ON profiles(proxy_id);
      CREATE INDEX idx_profiles_browser_version ON profiles(browser_version);
      CREATE INDEX idx_runtime_sessions_pid ON runtime_sessions(pid);
    `);
  }
} as const;
