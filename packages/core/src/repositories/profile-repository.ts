import type { Profile, UpdateProfileInput } from '@icrlogin/shared';
import type { Database } from '../db/database.js';

type ProfileRow = {
  id: string;
  name: string;
  description: string | null;
  group_id: string | null;
  browser_version: string;
  proxy_id: string | null;
  user_agent: string | null;
  language: string;
  timezone: string;
  window_width: number;
  window_height: number;
  screen_width: number;
  screen_height: number;
  webrtc_enabled: number;
  geolocation_mode: 'allow' | 'ask' | 'block';
  startup_urls_json: string;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  deleted_at: string | null;
};

function mapRow(row: ProfileRow): Profile {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    groupId: row.group_id,
    browserVersion: row.browser_version,
    proxyId: row.proxy_id,
    userAgent: row.user_agent,
    language: row.language,
    timezone: row.timezone,
    windowWidth: row.window_width,
    windowHeight: row.window_height,
    screenWidth: row.screen_width,
    screenHeight: row.screen_height,
    webrtcEnabled: row.webrtc_enabled === 1,
    geolocationMode: row.geolocation_mode,
    startupUrls: JSON.parse(row.startup_urls_json) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at,
    deletedAt: row.deleted_at
  };
}

const UPDATE_COLUMNS: Record<keyof UpdateProfileInput, string> = {
  name: 'name',
  browserVersion: 'browser_version',
  groupId: 'group_id',
  proxyId: 'proxy_id',
  userAgent: 'user_agent',
  language: 'language',
  timezone: 'timezone',
  windowWidth: 'window_width',
  windowHeight: 'window_height',
  screenWidth: 'screen_width',
  screenHeight: 'screen_height',
  webrtcEnabled: 'webrtc_enabled',
  geolocationMode: 'geolocation_mode',
  startupUrls: 'startup_urls_json',
  description: 'description'
};

function toDbValue(key: keyof UpdateProfileInput, value: unknown): unknown {
  if (key === 'startupUrls') return JSON.stringify(value);
  if (key === 'webrtcEnabled') return value ? 1 : 0;
  return value;
}

export class ProfileRepository {
  constructor(private readonly db: Database) {}

  create(profile: Profile): Profile {
    this.db.prepare(`
      INSERT INTO profiles (
        id, name, description, group_id, browser_version, proxy_id, user_agent,
        language, timezone, window_width, window_height, screen_width, screen_height,
        webrtc_enabled, geolocation_mode, startup_urls_json, created_at, updated_at,
        last_used_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      profile.id, profile.name, profile.description ?? null, profile.groupId ?? null,
      profile.browserVersion, profile.proxyId ?? null, profile.userAgent ?? null,
      profile.language ?? 'en-US', profile.timezone ?? 'UTC', profile.windowWidth ?? 1280,
      profile.windowHeight ?? 800, profile.screenWidth ?? 1920, profile.screenHeight ?? 1080,
      profile.webrtcEnabled === false ? 0 : 1, profile.geolocationMode ?? 'ask',
      JSON.stringify(profile.startupUrls ?? []), profile.createdAt, profile.updatedAt,
      profile.lastUsedAt, profile.deletedAt
    );
    return profile;
  }

  list(options: { includeDeleted?: boolean } = {}): Profile[] {
    const sql = options.includeDeleted
      ? 'SELECT * FROM profiles ORDER BY COALESCE(last_used_at, created_at) DESC, name COLLATE NOCASE'
      : 'SELECT * FROM profiles WHERE deleted_at IS NULL ORDER BY COALESCE(last_used_at, created_at) DESC, name COLLATE NOCASE';
    return (this.db.prepare(sql).all() as ProfileRow[]).map(mapRow);
  }

  getById(id: string, options: { includeDeleted?: boolean } = {}): Profile | null {
    const sql = options.includeDeleted
      ? 'SELECT * FROM profiles WHERE id = ?'
      : 'SELECT * FROM profiles WHERE id = ? AND deleted_at IS NULL';
    const row = this.db.prepare(sql).get(id) as ProfileRow | undefined;
    return row ? mapRow(row) : null;
  }

  update(id: string, input: UpdateProfileInput, updatedAt = new Date().toISOString()): Profile | null {
    const entries = Object.entries(input).filter(([, value]) => value !== undefined) as Array<[keyof UpdateProfileInput, unknown]>;
    if (entries.length === 0) return this.getById(id, { includeDeleted: true });
    const assignments = entries.map(([key]) => `${UPDATE_COLUMNS[key]} = ?`);
    const values = entries.map(([key, value]) => toDbValue(key, value));
    assignments.push('updated_at = ?');
    values.push(updatedAt, id);
    this.db.prepare(`UPDATE profiles SET ${assignments.join(', ')} WHERE id = ?`).run(...values);
    return this.getById(id, { includeDeleted: true });
  }

  markLastUsed(id: string, usedAt = new Date().toISOString()): void {
    this.db.prepare('UPDATE profiles SET last_used_at = ? WHERE id = ?').run(usedAt, id);
  }

  softDelete(id: string, deletedAt = new Date().toISOString()): void {
    this.db.prepare('UPDATE profiles SET deleted_at = ?, updated_at = ? WHERE id = ?').run(deletedAt, deletedAt, id);
  }

  restore(id: string, restoredAt = new Date().toISOString()): Profile | null {
    this.db.prepare('UPDATE profiles SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(restoredAt, id);
    return this.getById(id, { includeDeleted: true });
  }

  deleteById(id: string): void {
    this.db.prepare('DELETE FROM profiles WHERE id = ?').run(id);
  }
}
