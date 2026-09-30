import { describe, expect, it } from 'vitest';
import { availableBulkActions, failedBulkIds, filterAndSortProfiles, profileCloneLabels } from '../../src/renderer/src/pages/profiles/profiles-model.js';

describe('phase 4 profiles model', () => {
  it('filters and searches by tags', () => {
    const rows = [
      { id:'a', name:'Alpha', browserVersion:'143', groupId:null, proxyId:null, userAgent:null, runtimeState:'stopped', lastUsedAt:null, tagIds:['t1'], tagNames:['US'] },
      { id:'b', name:'Beta', browserVersion:'143', groupId:null, proxyId:null, userAgent:null, runtimeState:'stopped', lastUsedAt:null, tagIds:['t2'], tagNames:['EU'] }
    ];
    const rowsOut = filterAndSortProfiles(rows, {
      search:'US', status:'all', groupId:'all', proxyPresence:'all', sort:'name', tagIds:['t1']
    });
    expect(rowsOut.map((row) => row.id)).toEqual(['a']);
  });

  it('exposes only safe bulk actions for mixed runtime states', () => {
    expect(availableBulkActions(['stopped','running']).sort()).toEqual(['addTags','assignProxy','moveGroup','removeTags'].sort());
    expect(availableBulkActions(['stopped'])).toContain('delete');
    expect(availableBulkActions(['running'])).toContain('stop');
  });

  it('keeps only failed ids for Retry failed', () => {
    expect(failedBulkIds([{id:'a',success:true},{id:'b',success:false},{id:'c',success:false}])).toEqual(['b','c']);
  });

  it('keeps clone and template labels stable', () => {
    expect(profileCloneLabels()).toEqual({
      config:'Clone configuration',
      full:'Clone full profile',
      template:'Save as template'
    });
  });
});
