import { describe, expect, it } from 'vitest';
import type { Profile, ProfileTemplate } from '@icrlogin/shared';
import { ProfileTemplateService } from '../src/profiles/profile-template-service.js';

const profile: Profile = {
  id: 'p1', name: 'Source', description: 'desc', groupId: 'g1', browserVersion: '144', proxyId: 'px1',
  userAgent: null, language: 'en-US', timezone: 'UTC', windowWidth: 1280, windowHeight: 800,
  screenWidth: 1920, screenHeight: 1080, webrtcEnabled: true, geolocationMode: 'ask',
  startupUrls: ['https://example.test'], createdAt: 'x', updatedAt: 'x', lastUsedAt: 'y', deletedAt: null
};

describe('ProfileTemplateService', () => {
  it('stores only configuration references and creates a profile with overrides', async () => {
    const templates = new Map<string, ProfileTemplate>();
    const created: Profile[] = [];
    const repository = {
      create: (value: ProfileTemplate) => { templates.set(value.id, value); return value; },
      list: () => [...templates.values()], getById: (id: string) => templates.get(id) ?? null,
      delete: (id: string) => { templates.delete(id); }
    };
    const profiles = { getById: (id: string) => id === profile.id ? profile : null, create: (value: Profile) => { created.push(value); return value; }, deleteById: () => {} };
    const relations = { getTagIds: () => ['t1'], getExtensionIds: () => ['e1'], setTagIds: () => {}, setExtensionIds: () => {} };
    const files = { create: async () => {}, remove: async () => {} };
    const service = new ProfileTemplateService(repository, profiles, files as any, relations, { validate: () => {} }, {
      idFactory: (() => { let index = 0; return () => `id${++index}`; })(), now: () => '2026'
    });

    const template = service.saveFromProfile(profile.id, ' QA ');
    const serialized = JSON.stringify(template);
    for (const forbidden of ['lastUsedAt', 'deletedAt', 'password', 'apiToken', 'userDataDir', 'Cookies']) expect(serialized).not.toContain(forbidden);
    const result = await service.createProfile(template.id, { name: 'From template', groupId: null, browserVersion: '145' });
    expect(result.name).toBe('From template');
    expect(result.groupId).toBe(null);
    expect(result.browserVersion).toBe('145');
    expect(created).toHaveLength(1);
  });

  it('rejects stale references before any profile is created', async () => {
    let creates = 0;
    const template: ProfileTemplate = { id: 't1', name: 'T', config: { browserVersion: '144', groupId: 'missing' }, tagIds: ['missing'], extensionIds: [], createdAt: 'x', updatedAt: 'x' };
    const service = new ProfileTemplateService(
      { create: (value) => value, list: () => [template], getById: () => template, delete: () => {} },
      { getById: () => profile, create: (value) => { creates += 1; return value; }, deleteById: () => {} },
      { create: async () => {}, remove: async () => {} } as any,
      { getTagIds: () => [], getExtensionIds: () => [], setTagIds: () => {}, setExtensionIds: () => {} },
      { validate: () => { throw Object.assign(new Error('stale'), { code: 'INVALID_REQUEST' }); } }
    );
    await expect(service.createProfile(template.id)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(creates).toBe(0);
  });
});
