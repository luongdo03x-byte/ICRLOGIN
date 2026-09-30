import { redactForLog } from './redaction.js';

export type LogLevel='info'|'warn'|'error';
export interface StructuredLoggerOptions{write(line:string):void;now?:()=>string;maxFieldLength?:number;}
export class StructuredLogger{
  private readonly now:()=>string;private readonly maxFieldLength:number;
  constructor(private readonly options:StructuredLoggerOptions){this.now=options.now??(()=>new Date().toISOString());this.maxFieldLength=options.maxFieldLength??4096;}
  info(event:string,fields?:unknown):void{this.write('info',event,fields);}
  warn(event:string,fields?:unknown):void{this.write('warn',event,fields);}
  error(event:string,fields?:unknown):void{this.write('error',event,fields);}
  private write(level:LogLevel,event:string,fields?:unknown):void{
    const record={timestamp:this.now(),level,event:String(event).slice(0,160),...(fields===undefined?{}:{fields:redactForLog(fields,this.maxFieldLength)})};
    this.options.write(`${JSON.stringify(record)}\n`);
  }
}
