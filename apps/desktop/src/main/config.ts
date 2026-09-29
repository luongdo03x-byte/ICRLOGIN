import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppPaths, type AppPaths } from '@icrlogin/core';
import { AppError, HttpPortSchema } from '@icrlogin/shared';

export interface SecureWindowOptions {
  width: number;
  height: number;
  show: boolean;
  webPreferences: {
    preload: string;
    contextIsolation: true;
    nodeIntegration: false;
    sandbox: true;
  };
}

export interface BrowserManifestSettings {
  manifestUrl: string | null;
  cachePath: string;
}

export interface LocalApiSettings {
  host: '127.0.0.1';
  port: number;
  tokenFile: string;
}

export function createSecureWindowOptions(preload: string): SecureWindowOptions {
  return {
    width: 1100,
    height: 720,
    show: true,
    webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true }
  };
}

export function maskDataRoot(_absolutePath: string): string {
  return '%LOCALAPPDATA%/ICRLogin';
}

export function moduleDirectory(metaUrl: string): string {
  return dirname(fileURLToPath(metaUrl));
}

export function resolveBrowserManifestSettings(paths: AppPaths, configuredUrl?: string): BrowserManifestSettings {
  return { manifestUrl: configuredUrl?.trim() || null, cachePath: join(paths.configDir, 'browser-manifest-win64.json') };
}

export function resolveLocalApiSettings(env: NodeJS.ProcessEnv, paths: AppPaths): LocalApiSettings {
  const rawPort = env.ICRLOGIN_API_PORT;
  const candidate = rawPort === undefined ? 9495 : Number(rawPort);
  let port: number;
  try { port = HttpPortSchema.parse(candidate); }
  catch { throw new AppError('INVALID_REQUEST', 'Invalid local API port'); }
  return { host: '127.0.0.1', port, tokenFile: join(paths.configDir, 'local-api-token.enc') };
}

export async function prepareUserDataRoot(
  localBase: string,
  ensurePaths: (paths: AppPaths) => Promise<void>,
  setPath: (name: 'userData', path: string) => void
): Promise<{ dataRoot: string; paths: AppPaths }> {
  const dataRoot = join(localBase, 'ICRLogin');
  const paths = createAppPaths(dataRoot);
  await ensurePaths(paths);
  setPath('userData', dataRoot);
  return { dataRoot, paths };
}
