import { describe,expect,it,vi } from 'vitest';
import { WindowsProcessMetricsReader } from '../src/main/windows-process-metrics.js';

describe('WindowsProcessMetricsReader',()=>{
  it('queries a validated pid with execFile and parses cumulative cpu plus working set',async()=>{
    const exec=vi.fn(async()=>JSON.stringify({ProcessId:321,KernelModeTime:'20000',UserModeTime:'30000',WorkingSetSize:'4096'}));
    const reader=new WindowsProcessMetricsReader(exec);
    await expect(reader.read(321)).resolves.toEqual({cpuTimeMs:5,workingSetBytes:4096});
    expect(exec).toHaveBeenCalledWith('powershell.exe',expect.arrayContaining(['-NoProfile','-NonInteractive','-Command']));
  });
  it('returns null for invalid pid, failed command or malformed identity',async()=>{
    const exec=vi.fn(async()=>{throw new Error('denied');});const reader=new WindowsProcessMetricsReader(exec);
    await expect(reader.read(0)).resolves.toBeNull();await expect(reader.read(12)).resolves.toBeNull();expect(exec).toHaveBeenCalledTimes(1);
    const mismatch=new WindowsProcessMetricsReader(async()=>JSON.stringify({ProcessId:99,KernelModeTime:'1',UserModeTime:'1',WorkingSetSize:'1'}));await expect(mismatch.read(12)).resolves.toBeNull();
  });
});
