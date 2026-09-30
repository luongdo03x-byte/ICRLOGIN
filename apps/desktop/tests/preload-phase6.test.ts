import { describe,expect,it } from 'vitest';
import { PHASE6_DESKTOP_CHANNELS } from '@icrlogin/shared';
import { createPublicBridge } from '../src/preload/bridge.js';

describe('phase 6 preload bridge',()=>{
  it('exposes sanitized monitoring operations without generic process primitives',async()=>{
    const calls:string[]=[];
    const bridge=createPublicBridge(async(channel)=>{calls.push(channel);return{ok:true,data:null};},()=>()=>{});
    await bridge.monitoring.snapshot();await bridge.monitoring.recoveryStatus();
    expect(calls).toEqual([PHASE6_DESKTOP_CHANNELS.monitoringSnapshot,PHASE6_DESKTOP_CHANNELS.recoveryStatus]);
    expect('process' in (bridge as any)).toBe(false);expect('exec' in (bridge as any)).toBe(false);expect('spawn' in (bridge as any)).toBe(false);
  });
});
