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
    stop: (id: string) => call(window.icr.profiles.stop(id))
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
  browsers: {
    available: () => call(window.icr.browsers.available()),
    installed: () => call(window.icr.browsers.installed()),
    download: (version: string) => call(window.icr.browsers.download(version)),
    onDownloadProgress: window.icr.browsers.onDownloadProgress
  }
} as const;
