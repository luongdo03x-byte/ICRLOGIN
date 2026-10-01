import { z } from 'zod';
import type { AppErrorCode } from './errors.js';
import {
  CreateProfileInputSchema,
  UpdateProfileInputSchema,
  type BrowserRuntimeState,
  type Profile
} from './profile.js';
import { CreateGroupInputSchema, UpdateGroupInputSchema } from './group.js';
import { CreateProxyInputSchema, UpdateProxyInputSchema } from './proxy.js';

export const LOCAL_API_VERSION = 1 as const;

export interface HttpApiError {
  code: AppErrorCode;
  message: string;
}

export interface HttpApiSuccess<T> {
  success: true;
  data: T;
  error: null;
}

export interface HttpApiFailure {
  success: false;
  data: null;
  error: HttpApiError;
}

export type HttpApiEnvelope<T> = HttpApiSuccess<T> | HttpApiFailure;

export function httpOk<T>(data: T): HttpApiSuccess<T> {
  return { success: true, data, error: null };
}

export function httpFail(code: AppErrorCode, message: string): HttpApiFailure {
  return { success: false, data: null, error: { code, message } };
}

const id = z.string().trim().uuid();
const version = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

export const HttpIdParamsSchema = z.object({ id });
export const HttpVersionParamsSchema = z.object({ version });
export const HttpPortSchema = z.number().int().min(1).max(65535);
export const HttpProfileCreateBodySchema = CreateProfileInputSchema;
export const HttpProfileUpdateBodySchema = UpdateProfileInputSchema;
export const HttpGroupCreateBodySchema = CreateGroupInputSchema;
export const HttpGroupUpdateBodySchema = UpdateGroupInputSchema;
export const HttpProxyCreateBodySchema = CreateProxyInputSchema;
export const HttpProxyUpdateBodySchema = UpdateProxyInputSchema;
export const HttpBrowserDownloadParamsSchema = HttpVersionParamsSchema;

export type HttpRuntimeState = 'stopped' | BrowserRuntimeState;

export interface HttpProfileRuntime extends Profile {
  runtimeState: HttpRuntimeState;
  runtimeStartedAt: string | null;
}

export interface HttpProcessRecord {
  profileId: string;
  state: BrowserRuntimeState;
  pid: number;
  browserVersion: string;
  remoteDebuggingPort: number;
  cdpHttpUrl: string;
  webSocketDebuggerUrl: string;
  startedAt: string;
}

export interface HttpBrowserStartResult {
  profileId: string;
  status: 'running';
  pid: number;
  browserVersion: string;
  remoteDebuggingPort: number;
  cdpHttpUrl: string;
  webSocketDebuggerUrl: string;
}

export interface HttpInstalledBrowser {
  version: string;
  sha256: string;
  artifactSize: number;
  installedAt: string;
  executableAvailable: boolean;
  profilesUsing: number;
}

export interface HttpProxyTestResult {
  reachable: true;
  latencyMs: number;
}
