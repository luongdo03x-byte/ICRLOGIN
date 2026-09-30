import type { ApiEnvelope } from '@icrlogin/shared';

export class IcrClientError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'IcrClientError';
  }
}

export function unwrapEnvelope<T>(envelope: ApiEnvelope<T>): T {
  if (envelope.ok) return envelope.data;
  throw new IcrClientError(envelope.error.code, envelope.error.message);
}

async function call<T>(promise: Promise<ApiEnvelope<T>>): Promise<T> {
  return unwrapEnvelope(await promise);
}

export const icrClient = {
  health: () => call(window.icr.health()),
  profiles: {
    list: () => call(window.icr.profiles.list()),
    get: (id: string) => call(window.icr.profiles.get(id)),
    create: (input: Parameters<typeof window.icr.profiles.create>[0]) => call(window.icr.profiles.create(input)),
    update: (id: string, input: Parameters<typeof window.icr.profiles.update>[1]) => call(window.icr.profiles.update(id, input)),
    delete: (id: string) => call(window.icr.profiles.delete(id)),
    restore: (id: string) => call(window.icr.profiles.restore(id)),
    start: (id: string) => call(window.icr.profiles.start(id)),
    stop: (id: string) => call(window.icr.profiles.stop(id)),
    clone: (sourceId: string, mode: Parameters<typeof window.icr.profiles.clone>[1], overrides?: Parameters<typeof window.icr.profiles.clone>[2]) => call(window.icr.profiles.clone(sourceId, mode, overrides))
  },
  groups: {
    list: () => call(window.icr.groups.list()),
    create: (input: Parameters<typeof window.icr.groups.create>[0]) => call(window.icr.groups.create(input)),
    update: (id: string, input: Parameters<typeof window.icr.groups.update>[1]) => call(window.icr.groups.update(id, input)),
    delete: (id: string) => call(window.icr.groups.delete(id))
  },
  proxies: {
    list: () => call(window.icr.proxies.list()),
    get: (id: string) => call(window.icr.proxies.get(id)),
    create: (input: Parameters<typeof window.icr.proxies.create>[0]) => call(window.icr.proxies.create(input)),
    update: (id: string, input: Parameters<typeof window.icr.proxies.update>[1]) => call(window.icr.proxies.update(id, input)),
    delete: (id: string) => call(window.icr.proxies.delete(id))
  },
  tags: {
    list: () => call(window.icr.tags.list()),
    create: (input: Parameters<typeof window.icr.tags.create>[0]) => call(window.icr.tags.create(input)),
    update: (id: string, input: Parameters<typeof window.icr.tags.update>[1]) => call(window.icr.tags.update(id, input)),
    delete: (id: string) => call(window.icr.tags.delete(id)),
    setProfile: (profileId: string, tagIds: string[]) => call(window.icr.tags.setProfile(profileId, tagIds))
  },
  templates: {
    list: () => call(window.icr.templates.list()),
    saveFromProfile: (profileId: string, name: string) => call(window.icr.templates.saveFromProfile(profileId, name)),
    delete: (id: string) => call(window.icr.templates.delete(id)),
    createProfile: (templateId: string, overrides?: Parameters<typeof window.icr.templates.createProfile>[1]) => call(window.icr.templates.createProfile(templateId, overrides))
  },
  extensions: {
    list: () => call(window.icr.extensions.list()),
    importUnpacked: (sourcePath: string) => call(window.icr.extensions.importUnpacked(sourcePath)),
    importCrx: (sourcePath: string) => call(window.icr.extensions.importCrx(sourcePath)),
    setEnabled: (id: string, enabled: boolean) => call(window.icr.extensions.setEnabled(id, enabled)),
    delete: (id: string) => call(window.icr.extensions.delete(id)),
    assignToProfile: (extensionId: string, profileId: string) => call(window.icr.extensions.assignToProfile(extensionId, profileId)),
    removeFromProfile: (extensionId: string, profileId: string) => call(window.icr.extensions.removeFromProfile(extensionId, profileId)),
    assignToGroup: (extensionId: string, groupId: string) => call(window.icr.extensions.assignToGroup(extensionId, groupId)),
    removeFromGroup: (extensionId: string, groupId: string) => call(window.icr.extensions.removeFromGroup(extensionId, groupId)),
    listForProfile: (profileId: string) => call(window.icr.extensions.listForProfile(profileId))
  },
  bulk: {
    start: (ids: string[], concurrency?: number) => call(window.icr.bulk.start(ids, concurrency)),
    stop: (ids: string[]) => call(window.icr.bulk.stop(ids)),
    moveGroup: (ids: string[], groupId: string | null) => call(window.icr.bulk.moveGroup(ids, groupId)),
    assignProxy: (ids: string[], proxyId: string | null) => call(window.icr.bulk.assignProxy(ids, proxyId)),
    addTags: (ids: string[], tagIds: string[]) => call(window.icr.bulk.addTags(ids, tagIds)),
    removeTags: (ids: string[], tagIds: string[]) => call(window.icr.bulk.removeTags(ids, tagIds)),
    delete: (ids: string[]) => call(window.icr.bulk.delete(ids))
  },
  browsers: {
    available: () => call(window.icr.browsers.available()),
    installed: () => call(window.icr.browsers.installed()),
    download: (version: string) => call(window.icr.browsers.download(version)),
    onDownloadProgress: window.icr.browsers.onDownloadProgress
  }
} as const;
