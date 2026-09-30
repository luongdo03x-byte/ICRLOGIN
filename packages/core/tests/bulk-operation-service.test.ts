import { describe, expect, it } from 'vitest';
import { AppError } from '@icrlogin/shared';
import { BulkOperationService } from '../src/bulk/bulk-operation-service.js';

function deferred(ms = 5): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function profileMutations(getState: (id: string) => string = () => 'stopped') {
  return {
    async runWithStoppedProfiles<T>(ids: readonly string[], operation: () => Promise<T> | T): Promise<T> {
      if (ids.some((id) => getState(id) !== 'stopped')) {
        throw new AppError('INVALID_REQUEST', 'Stop the profile before changing this setting');
      }
      return operation();
    }
  };
}

describe('BulkOperationService', () => {
  it('starts with default max concurrency 3, de-duplicates IDs, and preserves first-seen order', async () => {
    let active = 0;
    let maxActive = 0;
    const calls: string[] = [];
    const service = new BulkOperationService({
      browsers: {
        async start(id) {
          calls.push(id);
          active += 1;
          maxActive = Math.max(maxActive, active);
          await deferred();
          active -= 1;
          return { profileId: id } as any;
        },
        async stop() {},
        getState() { return 'stopped'; }
      },
      profiles: { async update() {}, async softDelete() {} },
      tags: { addProfileTags() {}, removeProfileTags() {} },
      profileMutations: profileMutations()
    });

    const results = await service.startProfiles(['a', 'b', 'a', 'c', 'd']);
    expect(maxActive).toBe(3);
    expect(calls).toEqual(['a', 'b', 'c', 'd']);
    expect(results.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(results.every((item) => item.success)).toBe(true);
    await expect(service.startProfiles(['a'], 0)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(service.startProfiles(['a'], 6)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });

  it('captures partial failures without rolling back successes and retry can target only failures', async () => {
    const starts: string[] = [];
    let failB = true;
    const service = new BulkOperationService({
      browsers: {
        async start(id) {
          starts.push(id);
          if (id === 'b' && failB) throw new AppError('BROWSER_START_FAILED', 'failed');
          return { profileId: id } as any;
        },
        async stop() {},
        getState() { return 'stopped'; }
      },
      profiles: { async update() {}, async softDelete() {} },
      tags: { addProfileTags() {}, removeProfileTags() {} },
      profileMutations: profileMutations()
    });

    const first = await service.startProfiles(['a', 'b', 'c']);
    expect(first.map((item) => item.success)).toEqual([true, false, true]);
    const failedIds = first.filter((item) => !item.success).map((item) => item.id);
    failB = false;
    const retry = await service.startProfiles(failedIds);
    expect(retry).toEqual([{ id: 'b', success: true, data: { profileId: 'b' } }]);
    expect(starts).toEqual(['a', 'b', 'c', 'b']);
  });

  it('runs stop, group, proxy, tag, and delete actions as per-profile partial-result operations', async () => {
    const events: string[] = [];
    const service = new BulkOperationService({
      browsers: {
        async start(id) { return { profileId: id } as any; },
        async stop(id) { events.push(`stop:${id}`); if (id === 'bad') throw new AppError('PROFILE_NOT_RUNNING', 'not running'); },
        getState() { return 'stopped'; }
      },
      profiles: {
        async update(id, input) { events.push(`update:${id}:${JSON.stringify(input)}`); },
        async softDelete(id) { events.push(`delete:${id}`); }
      },
      tags: {
        addProfileTags(id, tagIds) { events.push(`add:${id}:${tagIds.join(',')}`); },
        removeProfileTags(id, tagIds) { events.push(`remove:${id}:${tagIds.join(',')}`); }
      },
      profileMutations: profileMutations()
    });

    expect((await service.stopProfiles(['ok', 'bad'])).map((item) => item.success)).toEqual([true, false]);
    await service.moveGroup(['a'], 'g1');
    await service.assignProxy(['a'], null);
    await service.addTags(['a'], ['t1', 't2']);
    await service.removeTags(['a'], ['t1']);
    await service.softDelete(['a']);
    expect(events).toContain('update:a:{"groupId":"g1"}');
    expect(events).toContain('update:a:{"proxyId":null}');
    expect(events).toContain('add:a:t1,t2');
    expect(events).toContain('remove:a:t1');
    expect(events).toContain('delete:a');
  });

  it('rejects moving a running profile to another group because effective extensions can change', async () => {
    const updates: string[] = [];
    const getState = (id: string) => id === 'running' ? 'running' : 'stopped';
    const service = new BulkOperationService({
      browsers: {
        async start(id) { return { profileId: id } as any; },
        async stop() {},
        getState
      },
      profiles: {
        async update(id) { updates.push(id); },
        async softDelete() {}
      },
      tags: { addProfileTags() {}, removeProfileTags() {} },
      profileMutations: profileMutations(getState)
    });

    const result = await service.moveGroup(['running', 'stopped'], 'g1');
    expect(result.map((item) => item.success)).toEqual([false, true]);
    expect(updates).toEqual(['stopped']);
  });
});
