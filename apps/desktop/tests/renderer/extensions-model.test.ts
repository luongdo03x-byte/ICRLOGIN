import { describe, expect, it } from 'vitest';
import { extensionAssignmentSummary, extensionMutationDisabled, toExtensionRow } from '../../src/renderer/src/pages/extensions/extensions-model.js';

describe('extensions model', () => {
  it('sanitizes extension rows and exposes assignment counts', () => {
    const row = toExtensionRow({
      id:'e1',name:'Ext',version:'1.0',sourceType:'crx',enabled:true,profileCount:1,groupCount:2,createdAt:'x',updatedAt:'x',sourcePath:'C:/secret'
    } as any);
    expect(JSON.stringify(row)).not.toContain('sourcePath');
    expect(JSON.stringify(row)).not.toContain('C:/secret');
    expect(row.assignmentCount).toBe(3);
    expect(extensionAssignmentSummary(row)).toBe('1 profiles · 2 groups');
  });

  it('conservatively disables mutation while a used extension may affect a running profile', () => {
    const row = toExtensionRow({id:'e1',name:'Ext',version:'1',sourceType:'unpacked',enabled:true,profileCount:1,groupCount:0,createdAt:'x',updatedAt:'x'} as any);
    expect(extensionMutationDisabled(row,true)).toBe(true);
    expect(extensionMutationDisabled({...row,assignmentCount:0,profileCount:0,groupCount:0},true)).toBe(false);
    expect(extensionMutationDisabled(row,false)).toBe(false);
  });
});
