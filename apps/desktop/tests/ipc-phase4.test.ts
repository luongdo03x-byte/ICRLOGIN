import { describe, expect, it } from 'vitest';
import { DESKTOP_CHANNELS } from '@icrlogin/shared';
import { registerIpcHandlers, type IpcMainLike } from '../src/main/ipc.js';

const A = '123e4567-e89b-42d3-a456-426614174000';
const B = '223e4567-e89b-42d3-a456-426614174000';

function harness(services: any) {
  const handlers = new Map<string, (event: any, payload?: unknown) => Promise<any> | any>();
  const ipcMain: IpcMainLike = { handle(channel, handler) { handlers.set(channel, handler); } };
  registerIpcHandlers(ipcMain, services, { dataRootLabel: '%LOCALAPPDATA%/ICRLogin' });
  const invoke = (channel: string, payload?: unknown) => handlers.get(channel)!({ sender: { send() {} } }, payload);
  return { invoke };
}

function baseServices() {
  return {
    profiles: { list: async () => [], get: async () => null, create: async () => ({}), update: async () => ({}), softDelete: async () => {}, restore: async () => ({}) },
    groups: { list: () => [], create: () => ({}), update: () => ({}), delete: () => {} },
    proxies: { list: async () => [], get: async () => null, create: async () => ({}), update: async () => ({}), delete: async () => {} },
    browserVersions: { listAvailable: async () => [], listInstalled: () => [], getStable: async () => ({ version: '144' }), download: async () => ({}) },
    browsers: { getRuntime: () => null, getState: () => 'stopped', start: async () => ({ state: 'running', startedAt: 'x' }), stop: async () => {} },
    registry: { list: () => [] },
    tags: { list: () => [], create: () => ({}), rename: () => ({}), delete: () => {}, setProfileTags: () => {}, listTagIdsByProfileIds: () => ({}), listProfileTagIds: () => [] },
    profileClones: { cloneConfig: async () => ({ id: 'clone' }), cloneFull: async () => ({ id: 'clone' }) },
    templates: { list: () => [], saveFromProfile: () => ({ id: 'template' }), createProfile: async () => ({ id: 'profile' }), delete: () => {} },
    extensions: { list: () => [], importUnpacked: async () => ({}), importCrx: async () => ({}), setEnabled: () => ({}), delete: async () => {}, assignToProfile: () => {}, removeFromProfile: () => {}, assignToGroup: () => {}, removeFromGroup: () => {}, listForProfile: () => [] },
    bulk: { startProfiles: async () => [], stopProfiles: async () => [], moveGroup: async () => [], assignProxy: async () => [], addTags: async () => [], removeTags: async () => [], softDelete: async () => [] },
    runtimeSessions: {}
  };
}

describe('phase 4 IPC', () => {
  it('validates tag payloads before service execution', async () => {
    let calls = 0;
    const services = baseServices();
    services.tags.create = () => { calls += 1; return {}; };
    const { invoke } = harness(services);
    const result = await invoke(DESKTOP_CHANNELS.tagsCreate, { input: { name: '   ' } });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_REQUEST');
    expect(calls).toBe(0);
  });

  it('blocks full clone unless the source profile is stopped', async () => {
    let fullCalls = 0;
    const services = baseServices();
    services.browsers.getState = () => 'running';
    services.profileClones.cloneFull = async () => { fullCalls += 1; return { id: 'clone' }; };
    const { invoke } = harness(services);
    const result = await invoke(DESKTOP_CHANNELS.profilesClone, { sourceId: A, mode: 'full' });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_REQUEST');
    expect(fullCalls).toBe(0);
  });

  it('blocks group changes while the profile is running because effective extensions can change', async () => {
    let updateCalls = 0;
    const services = baseServices();
    services.browsers.getState = () => 'running';
    services.profiles.update = async () => { updateCalls += 1; return {}; };
    const { invoke } = harness(services);
    const result = await invoke(DESKTOP_CHANNELS.profilesUpdate, { id: A, input: { groupId: B } });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_REQUEST');
    expect(updateCalls).toBe(0);
  });

  it('redacts internal extension paths even if a service returns one', async () => {
    const services = baseServices();
    services.extensions.list = () => [{ id: A, name: 'Ext', version: '1.0', sourceType: 'unpacked', enabled: true, profileCount: 0, groupCount: 0, createdAt: 'x', updatedAt: 'x', sourcePath: 'C:/secret/internal' }];
    const { invoke } = harness(services);
    const result = await invoke(DESKTOP_CHANNELS.extensionsList);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result.data)).not.toContain('sourcePath');
    expect(JSON.stringify(result.data)).not.toContain('C:/secret');
  });

  it('passes selected import source only inward and returns sanitized extension DTO', async () => {
    let seenPath = '';
    const services = baseServices();
    services.extensions.importCrx = async (sourcePath: string) => { seenPath = sourcePath; return { id: A, name: 'Ext', version: '1', sourceType: 'crx', enabled: true, profileCount: 0, groupCount: 0, createdAt: 'x', updatedAt: 'x', sourcePath: 'C:/managed/e1' }; };
    const { invoke } = harness(services);
    const result = await invoke(DESKTOP_CHANNELS.extensionsImportCrx, { sourcePath: 'C:/Users/Test/ext.crx' });
    expect(seenPath).toBe('C:/Users/Test/ext.crx');
    expect(JSON.stringify(result.data)).not.toContain('C:/managed');
  });

  it('passes through ordered bulk partial results without runtime paths', async () => {
    const services = baseServices();
    services.bulk.startProfiles = async () => [
      { id: A, success: true, data: { profileId: A, state: 'running', startedAt: 'x', executablePath: 'C:/secret/chrome.exe' } },
      { id: B, success: false, error: { code: 'BROWSER_START_FAILED', message: 'failed' } }
    ];
    const { invoke } = harness(services);
    const result = await invoke(DESKTOP_CHANNELS.bulkStart, { ids: [A, B], concurrency: 3 });
    expect(result.ok).toBe(true);
    expect(result.data.map((item: any) => item.success)).toEqual([true, false]);
    expect(JSON.stringify(result.data)).not.toContain('executablePath');
  });
});
