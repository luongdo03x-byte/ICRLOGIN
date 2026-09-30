import BetterSqlite3 from 'better-sqlite3';

export interface Statement {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface Database {
  pragma(source: string, options?: { simple?: boolean }): unknown;
  exec(source: string): void;
  prepare(source: string): Statement;
  backup(destination: string): Promise<unknown>;
  close(): void;
}

export function openDatabase(dbPath: string): Database {
  const db = new BetterSqlite3(dbPath) as unknown as Database;
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}
