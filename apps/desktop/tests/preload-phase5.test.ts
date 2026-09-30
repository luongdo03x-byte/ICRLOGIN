import { describe, expect, it } from 'vitest';
import { PHASE5_DESKTOP_CHANNELS } from '@icrlogin/shared';
import { createPublicBridge } from '../src/preload/bridge.js';

describe('phase 5 preload bridge',()=>{
  it('exposes only explicit backup/profile operations and no generic filesystem primitive',async()=>{
    const calls:Array<{channel:string;payload:unknown}>=[];
    const bridge=createPublicBridge(async(channel,payload)=>{calls.push({channel,payload});return{ok:true,data:null};},()=>()=>{});
    await bridge.phase5Profiles.backup('123e4567-e89b-42d3-a456-426614174000','full');
    await bridge.phase5Profiles.restoreBackup();
    await bridge.phase5Profiles.exportConfig('123e4567-e89b-42d3-a456-426614174000');
    await bridge.phase5Profiles.importConfig('Copy');
    await bridge.phase5Profiles.listTrash();
    expect(calls.map(call=>call.channel)).toEqual([
      PHASE5_DESKTOP_CHANNELS.profilesBackup,
      PHASE5_DESKTOP_CHANNELS.profilesRestoreBackup,
      PHASE5_DESKTOP_CHANNELS.profilesExportConfig,
      PHASE5_DESKTOP_CHANNELS.profilesImportConfig,
      PHASE5_DESKTOP_CHANNELS.profilesListTrash
    ]);
    expect('fs' in (bridge as any)).toBe(false);
    expect('readFile' in (bridge as any)).toBe(false);
    expect('writeFile' in (bridge as any)).toBe(false);
  });
});
