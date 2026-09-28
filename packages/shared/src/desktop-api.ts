import { z } from 'zod';
import type { AppErrorCode } from './errors.js';
import {
  CreateProfileInputSchema,
  UpdateProfileInputSchema,
  type BrowserRuntimeState,
  type CreateProfileInput,
  type Profile,
  type UpdateProfileInput
} from './profile.js';
import {
  CreateGroupInputSchema,
  UpdateGroupInputSchema,
  type CreateGroupInput,
  type Group,
  type UpdateGroupInput
} from './group.js';
import {
  CreateProxyInputSchema,
  UpdateProxyInputSchema,
  type CreateProxyInput,
  type ProxyPublic,
  type UpdateProxyInput
} from './proxy.js';

export const DESKTOP_CHANNELS = {
  health: 'icr:health',
  profilesList: 'icr:profiles:list',
  profilesGet: 'icr:profiles:get',
  profilesCreate: 'icr:profiles:create',
  profilesUpdate: 'icr:profiles:update',
  profilesDelete: 'icr:profiles:delete',
  profilesRestore: 'icr:profiles:restore',
  profilesStart: 'icr:profiles:start',
  profilesStop: 'icr:profiles:stop',
  groupsList: 'icr:groups:list',
  groupsCreate: 'icr:groups:create',
  groupsUpdate: 'icr:groups:update',
  groupsDelete: 'icr:groups:delete',
  proxiesList: 'icr:proxies:list',
  proxiesGet: 'icr:proxies:get',
  proxiesCreate: 'icr:proxies:create',
  proxiesUpdate: 'icr:proxies:update',
  proxiesDelete: 'icr:proxies:delete',
  browsersAvailable: 'icr:browsers:available',
  browsersInstalled: 'icr:browsers:installed',
  browsersDownload: 'icr:browsers:download',
  browserDownloadProgress: 'icr:browsers:download-progress'
} as const;

const id = z.string().trim().min(1).max(128);
export const DesktopPayloadSchemas = {
  id: z.object({ id }),
  profileCreate: z.object({ input: CreateProfileInputSchema }),
  profileUpdate: z.object({ id, input: UpdateProfileInputSchema }),
  groupCreate: z.object({ input: CreateGroupInputSchema }),
  groupUpdate: z.object({ id, input: UpdateGroupInputSchema }),
  proxyCreate: z.object({ input: CreateProxyInputSchema }),
  proxyUpdate: z.object({ id, input: UpdateProxyInputSchema }),
  browserDownload: z.object({ version: z.string().trim().min(1).max(128) })
} as const;

export interface DesktopApiError {
  code: AppErrorCode;
  message: string;
}

export type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: DesktopApiError };

export interface DesktopHealth {
  status: 'ok';
  dataRoot: string;
  runningRuntimeCount: number;
}

export type DesktopRuntimeState = 'stopped' | BrowserRuntimeState;

export interface DesktopProfileListItem extends Profile {
  runtimeState: DesktopRuntimeState;
  runtimeStartedAt: string | null;
}

export interface DesktopRuntimeSummary {
  state: BrowserRuntimeState;
  startedAt: string;
}

export interface DesktopBrowserAvailable {
  version: string;
  size: number;
  isStable: boolean;
  isInstalled: boolean;
}

export interface DesktopBrowserInstalled {
  version: string;
  sha256: string;
  artifactSize: number;
  installedAt: string;
  executableAvailable: boolean;
  profilesUsing: number;
}

export interface BrowserDownloadProgressEvent {
  version: string;
  receivedBytes: number;
  totalBytes: number | null;
  percent: number | null;
}

export interface IcrDesktopApi {
  health(): Promise<ApiEnvelope<DesktopHealth>>;
  profiles: {
    list(): Promise<ApiEnvelope<DesktopProfileListItem[]>>;
    get(id: string): Promise<ApiEnvelope<DesktopProfileListItem>>;
    create(input: CreateProfileInput): Promise<ApiEnvelope<Profile>>;
    update(id: string, input: UpdateProfileInput): Promise<ApiEnvelope<Profile>>;
    delete(id: string): Promise<ApiEnvelope<null>>;
    restore(id: string): Promise<ApiEnvelope<Profile>>;
    start(id: string): Promise<ApiEnvelope<DesktopRuntimeSummary>>;
    stop(id: string): Promise<ApiEnvelope<null>>;
  };
  groups: {
    list(): Promise<ApiEnvelope<Group[]>>;
    create(input: CreateGroupInput): Promise<ApiEnvelope<Group>>;
    update(id: string, input: UpdateGroupInput): Promise<ApiEnvelope<Group>>;
    delete(id: string): Promise<ApiEnvelope<null>>;
  };
  proxies: {
    list(): Promise<ApiEnvelope<ProxyPublic[]>>;
    get(id: string): Promise<ApiEnvelope<ProxyPublic>>;
    create(input: CreateProxyInput): Promise<ApiEnvelope<ProxyPublic>>;
    update(id: string, input: UpdateProxyInput): Promise<ApiEnvelope<ProxyPublic>>;
    delete(id: string): Promise<ApiEnvelope<null>>;
  };
  browsers: {
    available(): Promise<ApiEnvelope<DesktopBrowserAvailable[]>>;
    installed(): Promise<ApiEnvelope<DesktopBrowserInstalled[]>>;
    download(version: string): Promise<ApiEnvelope<DesktopBrowserInstalled>>;
    onDownloadProgress(listener: (progress: BrowserDownloadProgressEvent) => void): () => void;
  };
}
