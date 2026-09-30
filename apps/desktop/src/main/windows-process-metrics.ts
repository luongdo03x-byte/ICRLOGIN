import { execFile } from 'node:child_process';
import type { ProcessMetricsRaw, ProcessMetricsReader } from '@icrlogin/core';

export type ExecFileText=(file:string,args:readonly string[])=>Promise<string>;
const defaultExec:ExecFileText=(file,args)=>new Promise((resolve,reject)=>{execFile(file,[...args],{windowsHide:true,encoding:'utf8'},(error,stdout)=>error?reject(error):resolve(stdout));});
interface RawJson{ProcessId?:number;KernelModeTime?:string|number;UserModeTime?:string|number;WorkingSetSize?:string|number;}
export class WindowsProcessMetricsReader implements ProcessMetricsReader{
  constructor(private readonly exec:ExecFileText=defaultExec){}
  async read(pid:number):Promise<ProcessMetricsRaw|null>{
    if(!Number.isInteger(pid)||pid<=0)return null;
    const command=`$p = Get-CimInstance Win32_Process -Filter \"ProcessId = ${pid}\"; if ($null -ne $p) { $p | Select-Object ProcessId,KernelModeTime,UserModeTime,WorkingSetSize | ConvertTo-Json -Compress }`;
    let output:string;try{output=(await this.exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',command])).trim();}catch{return null;}
    if(!output)return null;
    try{const parsed=JSON.parse(output) as RawJson;if(parsed.ProcessId!==pid)return null;const kernel=Number(parsed.KernelModeTime);const user=Number(parsed.UserModeTime);const working=Number(parsed.WorkingSetSize);if(!Number.isFinite(kernel)||!Number.isFinite(user)||!Number.isFinite(working)||kernel<0||user<0||working<0)return null;return{cpuTimeMs:(kernel+user)/10000,workingSetBytes:working};}catch{return null;}
  }
}
