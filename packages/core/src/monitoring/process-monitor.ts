import { cpus } from 'node:os';
import type { ProcessRegistry } from '../browsers/process-registry.js';

export interface ProcessMetricsRaw { cpuTimeMs:number; workingSetBytes:number; }
export interface ProcessMetricsReader { read(pid:number):Promise<ProcessMetricsRaw|null>; }
export interface ProcessMetricSnapshot { profileId:string;pid:number;cpuPercent:number|null;workingSetBytes:number|null;sampleAt:string;status:'available'|'unavailable'; }
export interface ProcessMonitorOptions { now?:()=>number;cpuCount?:number;intervalMs?:number;onSample?:(snapshot:ProcessMetricSnapshot[])=>void; }
interface Previous {cpuTimeMs:number;sampleMs:number;}
export class ProcessMonitor{
  private readonly now:()=>number;private readonly cpuCount:number;private readonly intervalMs:number;private readonly previous=new Map<number,Previous>();private timer:NodeJS.Timeout|null=null;
  constructor(private readonly deps:{registry:Pick<ProcessRegistry,'list'>;reader:ProcessMetricsReader;options?:ProcessMonitorOptions}){this.now=deps.options?.now??Date.now;this.cpuCount=Math.max(1,deps.options?.cpuCount??cpus().length);this.intervalMs=Math.max(1000,deps.options?.intervalMs??5000);}
  async sample():Promise<ProcessMetricSnapshot[]>{
    const now=this.now();const sampleAt=new Date(now).toISOString();const runtimes=this.deps.registry.list();const livePids=new Set(runtimes.map(r=>r.pid));
    for(const pid of this.previous.keys())if(!livePids.has(pid))this.previous.delete(pid);
    return Promise.all(runtimes.map(async runtime=>{
      try{
        const raw=await this.deps.reader.read(runtime.pid);if(!raw){this.previous.delete(runtime.pid);return{profileId:runtime.profileId,pid:runtime.pid,cpuPercent:null,workingSetBytes:null,sampleAt,status:'unavailable' as const};}
        const prior=this.previous.get(runtime.pid);let cpuPercent=0;
        if(prior){const wall=now-prior.sampleMs;const cpu=raw.cpuTimeMs-prior.cpuTimeMs;if(wall>0&&cpu>=0)cpuPercent=Math.max(0,Math.min(100,(cpu/wall)*100/this.cpuCount));}
        this.previous.set(runtime.pid,{cpuTimeMs:raw.cpuTimeMs,sampleMs:now});
        return{profileId:runtime.profileId,pid:runtime.pid,cpuPercent:Number(cpuPercent.toFixed(2)),workingSetBytes:raw.workingSetBytes,sampleAt,status:'available' as const};
      }catch{return{profileId:runtime.profileId,pid:runtime.pid,cpuPercent:null,workingSetBytes:null,sampleAt,status:'unavailable' as const};}
    }));
  }
  start():void{if(this.timer)return;const tick=()=>{void this.sample().then(value=>this.deps.options?.onSample?.(value));};this.timer=setInterval(tick,this.intervalMs);this.timer.unref?.();tick();}
  stop():void{if(this.timer){clearInterval(this.timer);this.timer=null;}}
}
