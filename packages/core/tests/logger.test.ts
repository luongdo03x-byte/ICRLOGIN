import { describe, expect, it } from 'vitest';
import { redactForLog } from '../src/logging/redaction.js';
import { StructuredLogger } from '../src/logging/logger.js';

describe('structured logging',()=>{
  it('recursively redacts credentials, tokens, cookies and internal paths without mutating input',()=>{
    const input={profileId:'p1',password:'secret',proxyPassword:'p',Authorization:'Bearer abc',nested:{cookie:'sid=1',apiToken:'token',userDataDir:'C:/Users/x/profile',executablePath:'C:/chrome.exe',ok:'value'},list:[{encryptedPassword:'cipher'}]};
    const output=redactForLog(input) as any;
    expect(output.profileId).toBe('p1');expect(output.nested.ok).toBe('value');
    expect(JSON.stringify(output)).not.toContain('secret');expect(JSON.stringify(output)).not.toContain('Bearer abc');expect(JSON.stringify(output)).not.toContain('sid=1');expect(JSON.stringify(output)).not.toContain('C:/Users/x/profile');expect(JSON.stringify(output)).not.toContain('C:/chrome.exe');
    expect(input.password).toBe('secret');
  });

  it('writes bounded json lines with timestamp level and event',()=>{
    const lines:string[]=[];
    const logger=new StructuredLogger({write:(line)=>lines.push(line),now:()=> '2026-10-01T00:00:00.000Z',maxFieldLength:32});
    logger.info('profile.started',{profileId:'p1',message:'x'.repeat(200),password:'do-not-log'});
    expect(lines).toHaveLength(1);const parsed=JSON.parse(lines[0]!);
    expect(parsed).toMatchObject({timestamp:'2026-10-01T00:00:00.000Z',level:'info',event:'profile.started',fields:{profileId:'p1',password:'[REDACTED]'}});
    expect(parsed.fields.message.length).toBeLessThanOrEqual(32);
  });
});
