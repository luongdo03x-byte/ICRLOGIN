import { describe, expect, it } from 'vitest';
import { ExtensionService } from '../src/extensions/extension-service.js';

const extension = {
  id:'e1',name:'Ext',version:'1.0',sourceType:'unpacked' as const,sourcePath:'C:/managed/e1',enabled:true,
  profileCount:0,groupCount:0,createdAt:'x',updatedAt:'x'
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('ExtensionService mutation serialization', () => {
  it('does not allow a new assignment to race a global enable/disable mutation', async () => {
    const releaseEnable = deferred();
    const enteredEnable = deferred();
    const events: string[] = [];
    let mutationCall = 0;
    const mutations = {
      async runWithStoppedProfiles<T>(_ids: readonly string[], operation: () => Promise<T> | T): Promise<T> {
        mutationCall += 1;
        if (mutationCall === 1) {
          enteredEnable.resolve();
          await releaseEnable.promise;
        }
        return operation();
      }
    } as any;
    const repository = {
      getById: () => extension,
      affectedProfileIds: () => [],
      profileExists: () => true,
      setEnabled: () => { events.push('enable'); return { ...extension, enabled:false }; },
      assignProfile: () => { events.push('assign'); }
    } as any;
    const service = new ExtensionService(repository, {} as any, mutations);

    const enabling = service.setEnabled('e1', false);
    await enteredEnable.promise;
    const assigning = service.assignToProfile('e1', 'p1');
    await Promise.resolve();
    expect(events).toEqual([]);

    releaseEnable.resolve();
    await Promise.all([enabling, assigning]);
    expect(events).toEqual(['enable', 'assign']);
  });
});
