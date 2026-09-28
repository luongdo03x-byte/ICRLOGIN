import type { Proxy, ProxyType } from '@icrlogin/shared';
import type { Database } from '../db/database.js';

interface ProxyRow {
  id: string;
  name: string;
  type: ProxyType;
  host: string;
  port: number;
  username: string | null;
  encrypted_password: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProxyRepositoryUpdate {
  name?: string;
  type?: ProxyType;
  host?: string;
  port?: number;
  username?: string | null;
  encryptedPassword?: string | null;
}

function mapRow(row: ProxyRow): Proxy {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    host: row.host,
    port: row.port,
    username: row.username,
    encryptedPassword: row.encrypted_password,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const UPDATE_COLUMNS: Record<keyof ProxyRepositoryUpdate, string> = {
  name: 'name',
  type: 'type',
  host: 'host',
  port: 'port',
  username: 'username',
  encryptedPassword: 'encrypted_password'
};

export class ProxyRepository {
  constructor(private readonly db: Database) {}

  create(proxy: Proxy): Proxy {
    this.db.prepare(`
      INSERT INTO proxies (
        id, name, type, host, port, username, encrypted_password, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      proxy.id,
      proxy.name,
      proxy.type,
      proxy.host,
      proxy.port,
      proxy.username,
      proxy.encryptedPassword,
      proxy.createdAt,
      proxy.updatedAt
    );
    return proxy;
  }

  getInternalById(id: string): Proxy | null {
    const row = this.db.prepare('SELECT * FROM proxies WHERE id = ?').get(id) as ProxyRow | undefined;
    return row ? mapRow(row) : null;
  }

  update(id: string, input: ProxyRepositoryUpdate, updatedAt: string): Proxy | null {
    const entries = Object.entries(input).filter(([, value]) => value !== undefined) as Array<[
      keyof ProxyRepositoryUpdate,
      unknown
    ]>;
    if (entries.length === 0) return this.getInternalById(id);
    const assignments = entries.map(([key]) => `${UPDATE_COLUMNS[key]} = ?`);
    const values = entries.map(([, value]) => value);
    assignments.push('updated_at = ?');
    values.push(updatedAt, id);
    this.db.prepare(`UPDATE proxies SET ${assignments.join(', ')} WHERE id = ?`).run(...values);
    return this.getInternalById(id);
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM proxies WHERE id = ?').run(id);
  }
}
