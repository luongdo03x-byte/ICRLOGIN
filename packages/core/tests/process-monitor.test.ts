import { describe,expect,it } from 'vitest';
import { ProcessMonitor } from '../src/monitoring/process-monitor.js';

const runtimes=[{profileId:'p1',pid:101},{profileId:'p2',pid:202}] as any[];
describe('ProcessMonitor',()=>{
  it('samples only registry runtimes and computes bounded cpu from cumulative cpu time',async()=>{
    let now=1000;const values=new Map<number,any>([[101,{cpuTimeMs:100,workingSetBytes:1000}],[202,{cpuTimeMs:50,workingSetBytes:2000}]]);
    const monitor=new ProcessMonitor({registry:{list:()=>runtimes} as any,reader:{read:async(pid:number)=>values.get(pid)??null},options:{now:()=>now,cpuCount:2,intervalMs:5000}});
    const first=await monitor.sample();expect(first.map(x=>x.cpuPercent)).toEqual([0,0]);
    now=2000;values.set(101,{cpuTimeMs:1100,workingSetBytes:1500});values.set(202,{cpuTimeMs:550,workingSetBytes:2200});
    const second=await monitor.sample();expect(second[0]).toMatchObject({profileId:'p1',pid:101,cpuPercent:50,workingSetBytes:1500,status:'available'});expect(second[1]!.cpuPercent).toBe(25);
  });
  it('returns unavailable metric when reader fails or pid disappears and does not throw',async()=>{
    const monitor=new ProcessMonitor({registry:{list:()=>runtimes} as any,reader:{read:async(pid:number)=>{if(pid===101)throw new Error('denied');return null;}},options:{now:()=>1000,cpuCount:4}});
    const result=await monitor.sample();expect(result).toHaveLength(2);expect(result.every(x=>x.status==='unavailable')).toBe(true);expect(result.every(x=>x.cpuPercent===null&&x.workingSetBytes===null)).toBe(true);
  });
});
