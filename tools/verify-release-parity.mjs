import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}

const manifests = [
  ['root', 'package.json'],
  ['desktop', 'apps/desktop/package.json'],
  ['core', 'packages/core/package.json'],
  ['shared', 'packages/shared/package.json']
];

const versions = new Map();
for (const [name, path] of manifests) {
  const manifest = await readJson(path);
  if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifest.version)) {
    throw new Error(`${name} package has an invalid semantic version`);
  }
  versions.set(name, manifest.version);
}

const rootVersion = versions.get('root');
for (const [name, version] of versions) {
  if (version !== rootVersion) throw new Error(`Release version mismatch: root=${rootVersion}, ${name}=${version}`);
}

const constants = [
  ['Local API', 'packages/shared/src/http-api.ts', /export const LOCAL_API_VERSION = (\d+) as const;/, 1],
  ['Database schema', 'packages/core/src/db/migrate.ts', /export const CURRENT_DB_SCHEMA_VERSION = (\d+) as const;/, 4],
  ['Backup format', 'packages/shared/src/backup.ts', /export const BACKUP_FORMAT_VERSION = (\d+) as const;/, 1]
];

for (const [label, path, pattern, expected] of constants) {
  const source = await readFile(resolve(path), 'utf8');
  const match = source.match(pattern);
  if (!match) throw new Error(`${label} version constant is missing`);
  const value = Number(match[1]);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} version must be a positive integer`);
  if (value !== expected) throw new Error(`${label} version changed from V1 baseline ${expected} to ${value}; update the V1 compatibility/release plan explicitly`);
}

console.log(`ICRLogin release parity OK: app ${rootVersion}, API v1, DB v4, backup v1`);
