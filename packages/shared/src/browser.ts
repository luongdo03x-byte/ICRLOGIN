import { z } from 'zod';

export const BrowserManifestEntrySchema = z.object({
  version: z.string().trim().min(1),
  url: z.string().url(),
  sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
  size: z.number().int().positive(),
  executableRelativePath: z.string().trim().min(1)
});

export const BrowserManifestSchema = z.object({
  schemaVersion: z.literal(1),
  platform: z.literal('win64'),
  stable: z.string().trim().min(1),
  versions: z.array(BrowserManifestEntrySchema).min(1)
});

export interface BrowserManifestEntry {
  version: string;
  url: string;
  sha256: string;
  size: number;
  executableRelativePath: string;
}

export interface BrowserManifest {
  schemaVersion: 1;
  platform: 'win64';
  stable: string;
  versions: BrowserManifestEntry[];
}

export type BrowserRuntimeState = 'starting' | 'running' | 'stopping' | 'crashed';

export interface BrowserRuntimeInfo {
  profileId: string;
  pid: number;
  browserVersion: string;
  executablePath: string;
  userDataDir: string;
  remoteDebuggingPort: number;
  cdpHttpUrl: string;
  webSocketDebuggerUrl: string;
  state: BrowserRuntimeState;
  startedAt: string;
}
