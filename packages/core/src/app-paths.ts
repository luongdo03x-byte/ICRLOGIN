import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface AppPaths {
  root: string;
  dataDir: string;
  profilesDir: string;
  browsersDir: string;
  extensionsDir: string;
  backupsDir: string;
  downloadsTempDir: string;
  logsDir: string;
  trashDir: string;
  configDir: string;
  geoIpDir: string;
}

export function createAppPaths(root: string): AppPaths {
  const canonicalRoot = resolve(root);
  return {
    root: canonicalRoot,
    dataDir: resolve(canonicalRoot, 'data'),
    profilesDir: resolve(canonicalRoot, 'profiles'),
    browsersDir: resolve(canonicalRoot, 'browsers'),
    extensionsDir: resolve(canonicalRoot, 'extensions'),
    backupsDir: resolve(canonicalRoot, 'backups'),
    downloadsTempDir: resolve(canonicalRoot, 'downloads', 'temp'),
    logsDir: resolve(canonicalRoot, 'logs'),
    trashDir: resolve(canonicalRoot, 'trash'),
    configDir: resolve(canonicalRoot, 'config'),
    geoIpDir: resolve(canonicalRoot, 'geoip')
  };
}

export async function ensureAppPaths(paths: AppPaths): Promise<void> {
  await Promise.all(Object.values(paths).map((path) => mkdir(path, { recursive: true })));
}
