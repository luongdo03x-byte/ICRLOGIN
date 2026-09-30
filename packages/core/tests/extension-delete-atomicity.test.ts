import { describe, expect, it } from 'vitest';
import { ExtensionService } from '../src/extensions/extension-service.js';

function noopMutations() {
  return { runWithStoppedProfiles: async <T>(_ids: readonly string[], operation: () => Promise<T> | T) => operation() } as any;
}

describe('ExtensionService delete atomicity', () => {
  it('rolls staged filesystem removal back when metadata delete fails', async () => {
    const events: string[] = [];
    const repository = {
      getById: () => ({
        id:'e1',name:'Ext',version:'1.0',sourceType:'unpacked',sourcePath:'C:/managed/e1',enabled:true,
        profileCount:0,groupCount:0,createdAt:'x',updatedAt:'x'
      }),
      affectedProfileIds: () => [],
      delete: () => { events.push('db-delete'); throw new Error('db failed'); }
    } as any;
    const importer = {
      stageInternalRemoval: async () => ({
        commit: async () => { events.push('fs-commit'); },
        rollback: async () => { events.push('fs-rollback'); }
      })
    } as any;
    const service = new ExtensionService(repository, importer, noopMutations());

    await expect(service.delete('e1')).rejects.toThrow('db failed');
    expect(events).toEqual(['db-delete','fs-rollback']);
  });

  it('commits staged filesystem removal only after metadata delete succeeds', async () => {
    const events: string[] = [];
    const repository = {
      getById: () => ({
        id:'e1',name:'Ext',version:'1.0',sourceType:'unpacked',sourcePath:'C:/managed/e1',enabled:true,
        profileCount:0,groupCount:0,createdAt:'x',updatedAt:'x'
      }),
      affectedProfileIds: () => [],
      delete: () => { events.push('db-delete'); }
    } as any;
    const importer = {
      stageInternalRemoval: async () => ({
        commit: async () => { events.push('fs-commit'); },
        rollback: async () => { events.push('fs-rollback'); }
      })
    } as any;
    const service = new ExtensionService(repository, importer, noopMutations());

    await service.delete('e1');
    expect(events).toEqual(['db-delete','fs-commit']);
  });
});
