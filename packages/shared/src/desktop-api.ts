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
import { CreateTagInputSchema, UpdateTagInputSchema, type CreateTagInput, type Tag, type UpdateTagInput } from './tag.js';
import { type ExtensionRecord } from './extension.js';
import {
  CloneProfileInputSchema,
  CreateProfileFromTemplateInputSchema,
  ProfileCloneOverridesSchema,
  SaveProfileTemplateInputSchema,
  type ProfileCloneMode,
  type ProfileTemplate
} from './profile-template.js';
import {
  BulkAssignProxyInputSchema,
  BulkIdsInputSchema,
  BulkMoveGroupInputSchema,
  BulkStartInputSchema,
  BulkTagsInputSchema,
  type BulkItemResult
} from './bulk.js';

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
  profilesClone: 'icr:profiles:clone',
  groupsList: 'icr:groups:list',
  groupsCreate: 'icr:groups:create',
  groupsUpdate: 'icr:groups:update',
  groupsDelete: 'icr:groups:delete',
  proxiesList: 'icr:proxies:list',
  proxiesGet: 'icr:proxies:get',
  proxiesCreate: 'icr:proxies:create',
  proxiesUpdate: 'icr:proxies:update',
  proxiesDelete: 'icr:proxies:delete',
  tagsList: 'icr:tags:list',
  tagsCreate: 'icr:tags:create',
  tagsUpdate: 'icr:tags:update',
  tagsDelete: 'icr:tags:delete',
  tagsSetProfile: 'icr:tags:set-profile',
  templatesList: 'icr:templates:list',
  templatesSave: 'icr:templates:save',
  templatesDelete: 'icr:templates:delete',
  templatesCreateProfile: 'icr:templates:create-profile',
  extensionsList: 'icr:extensions:list',
  extensionsImportUnpacked: 'icr:extensions:import-unpacked',
  extensionsImportCrx: 'icr:extensions:import-crx',
  extensionsSetEnabled: 'icr:extensions:set-enabled',
  extensionsDelete: 'icr:extensions:delete',
  extensionsAssignProfile: 'icr:extensions:assign-profile',
  extensionsRemoveProfile: 'icr:extensions:remove-profile',
  extensionsAssignGroup: 'icr:extensions:assign-group',
  extensionsRemoveGroup: 'icr:extensions:remove-group',
  extensionsListForProfile: 'icr:extensions:list-for-profile',
  bulkStart: 'icr:bulk:start',
  bulkStop: 'icr:bulk:stop',
  bulkMoveGroup: 'icr:bulk:move-group',
  bulkAssignProxy: 'icr:bulk:assign-proxy',
  bulkAddTags: 'icr:bulk:add-tags',
  bulkRemoveTags: 'icr:bulk:remove-tags',
  bulkDelete: 'icr:bulk:delete',
  browsersAvailable: 'icr:browsers:available',
  browsersInstalled: 'icr:browsers:installed',
  browsersDownload: 'icr:browsers:download',
  browserDownloadProgress: 'icr:browsers:download-progress'
} as const;

const id = z.string().trim().min(1).max(128);
const uuid = z.string().trim().uuid();
const tagIds = z.array(uuid).max(100);
const sourcePath = z.string().trim().min(1).max(4096);

export const DesktopPayloadSchemas = {
  id: z.object({ id }),
  profileCreate: z.object({ input: CreateProfileInputSchema }),
  profileUpdate: z.object({ id, input: UpdateProfileInputSchema }),
  profileClone: CloneProfileInputSchema,
  groupCreate: z.object({ input: CreateGroupInputSchema }),
  groupUpdate: z.object({ id, input: UpdateGroupInputSchema }),
  proxyCreate: z.object({ input: CreateProxyInputSchema }),
  proxyUpdate: z.object({ id, input: UpdateProxyInputSchema }),
  tagCreate: z.object({ input: CreateTagInputSchema }),
  tagUpdate: z.object({ id: uuid, input: UpdateTagInputSchema }),
  profileTags: z.object({ id: uuid, tagIds }),
  templateSave: SaveProfileTemplateInputSchema,
  templateCreateProfile: CreateProfileFromTemplateInputSchema,
  extensionImport: z.object({ sourcePath }).strict(),
  extensionEnabled: z.object({ id: uuid, enabled: z.boolean() }).strict(),
  extensionAssignment: z.object({ extensionId: uuid, targetId: uuid }).strict(),
  bulkStart: BulkStartInputSchema,
  bulkIds: BulkIdsInputSchema,
  bulkMoveGroup: BulkMoveGroupInputSchema,
  bulkAssignProxy: BulkAssignProxyInputSchema,
  bulkTags: BulkTagsInputSchema,
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
  tagIds: string[];
}

export interface DesktopRuntimeSummary {
  state: BrowserRuntimeState;
  startedAt: string;
}

export interface DesktopBulkRuntimeSummary extends DesktopRuntimeSummary {
  profileId: string;
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
    clone(sourceId: string, mode: ProfileCloneMode, overrides?: z.infer<typeof ProfileCloneOverridesSchema>): Promise<ApiEnvelope<Profile>>;
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
  tags: {
    list(): Promise<ApiEnvelope<Tag[]>>;
    create(input: CreateTagInput): Promise<ApiEnvelope<Tag>>;
    update(id: string, input: UpdateTagInput): Promise<ApiEnvelope<Tag>>;
    delete(id: string): Promise<ApiEnvelope<null>>;
    setProfile(profileId: string, tagIds: string[]): Promise<ApiEnvelope<null>>;
  };
  templates: {
    list(): Promise<ApiEnvelope<ProfileTemplate[]>>;
    saveFromProfile(profileId: string, name: string): Promise<ApiEnvelope<ProfileTemplate>>;
    delete(id: string): Promise<ApiEnvelope<null>>;
    createProfile(templateId: string, overrides?: z.infer<typeof ProfileCloneOverridesSchema>): Promise<ApiEnvelope<Profile>>;
  };
  extensions: {
    list(): Promise<ApiEnvelope<ExtensionRecord[]>>;
    importUnpacked(sourcePath: string): Promise<ApiEnvelope<ExtensionRecord>>;
    importCrx(sourcePath: string): Promise<ApiEnvelope<ExtensionRecord>>;
    setEnabled(id: string, enabled: boolean): Promise<ApiEnvelope<ExtensionRecord>>;
    delete(id: string): Promise<ApiEnvelope<null>>;
    assignToProfile(extensionId: string, profileId: string): Promise<ApiEnvelope<null>>;
    removeFromProfile(extensionId: string, profileId: string): Promise<ApiEnvelope<null>>;
    assignToGroup(extensionId: string, groupId: string): Promise<ApiEnvelope<null>>;
    removeFromGroup(extensionId: string, groupId: string): Promise<ApiEnvelope<null>>;
    listForProfile(profileId: string): Promise<ApiEnvelope<ExtensionRecord[]>>;
  };
  bulk: {
    start(ids: string[], concurrency?: number): Promise<ApiEnvelope<BulkItemResult<DesktopBulkRuntimeSummary>[]>>;
    stop(ids: string[]): Promise<ApiEnvelope<BulkItemResult<null>[]>>;
    moveGroup(ids: string[], groupId: string | null): Promise<ApiEnvelope<BulkItemResult<null>[]>>;
    assignProxy(ids: string[], proxyId: string | null): Promise<ApiEnvelope<BulkItemResult<null>[]>>;
    addTags(ids: string[], tagIds: string[]): Promise<ApiEnvelope<BulkItemResult<null>[]>>;
    removeTags(ids: string[], tagIds: string[]): Promise<ApiEnvelope<BulkItemResult<null>[]>>;
    delete(ids: string[]): Promise<ApiEnvelope<BulkItemResult<null>[]>>;
  };
  browsers: {
    available(): Promise<ApiEnvelope<DesktopBrowserAvailable[]>>;
    installed(): Promise<ApiEnvelope<DesktopBrowserInstalled[]>>;
    download(version: string): Promise<ApiEnvelope<DesktopBrowserInstalled>>;
    onDownloadProgress(listener: (progress: BrowserDownloadProgressEvent) => void): () => void;
  };
}
