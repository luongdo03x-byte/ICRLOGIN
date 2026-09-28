import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppPaths, type AppPaths } from '@icrlogin/core';

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

export function createSecureWindowOptions(preload: string): SecureWindowOptions {
  return {
    width: 1100,
    height: 720,
    show: true,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  };
}

export function maskDataRoot(_absolutePath: string): string {
  return '%LOCALAPPDATA%/ICRLogin';
}

export function moduleDirectory(metaUrl: string): string {
  return dirname(fileURLToPath(metaUrl));
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
