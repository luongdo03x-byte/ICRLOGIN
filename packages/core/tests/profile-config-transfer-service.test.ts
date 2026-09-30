import { join } from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { Profile } from '@icrlogin/shared';
import { createAppPaths, ensureAppPaths } from '../src/app-paths.js';
import { ProfileFiles } from '../src/profiles/profile-files.js';
import { ProfileConfigTransferService } from '../src/backups/profile-config-transfer-service.js';
import { createTempRoot, removeTempRoot } from './helpers/temp-root.js';

const profile: Profile = {
  id:'123e4567-e89b-42d3-a456-426614174000',name:'Export me',description:'safe',groupId:'11111111-1111-4111-8111-111111111111',browserVersion:'144.0.0',proxyId:'22222222-2222-4222-8222-222222222222',userAgent:null,
  language:'en-US',timezone:'UTC',windowWidth:1280,windowHeight:800,screenWidth:1920,screenHeight:1080,webrtcEnabled:true,
  geolocationMode:'ask',startupUrls:['https://example.com'],createdAt:'2026-09-01T00:00:00.000Z',updatedAt:'2026-09-02T00:00:00.000Z',lastUsedAt:'2026-09-03T00:00:00.000Z',deletedAt:null
};
const importedId='33333333-3333-4333-8333-333333333333';
const tagGood='44444444-4444-4444-8444-444444444444';
const tagMissing='55555555-5555-4555-8555-555555555555';
const extGood='66666666-6666-4666-8666-666666666666';
const extMissing='77777777-7777-4777-8777-777777777777';

async function fixture(root:string){
  const paths=createAppPaths(root); await ensureAppPaths(paths);
  const files=new ProfileFiles(paths); await files.create(profile.id);
  const profiles=new Map([[profile.id,profile]]);
  const tags=new Map<string,string[]>([[profile.id,[tagGood,tagMissing]]]);
  const exts=new Map<string,string[]>([[profile.id,[extGood,extMissing]]]);
  let failCreate=false;
  const service=new ProfileConfigTransferService({
    profiles:{
      getById:(id:string)=>profiles.get(id)??null,
      async create(input:any){ if(failCreate) throw new Error('create failed'); const value={...profile,...input,id:importedId,createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z',lastUsedAt:null,deletedAt:null}; profiles.set(importedId,value); await files.create(importedId); return value; },
      async removeCreated(id:string){ profiles.delete(id); await files.remove(id); }
    },
    relations:{
      getTagIds:(id:string)=>tags.get(id)??[], getExtensionIds:(id:string)=>exts.get(id)??[],
      existingTagIds:(ids:string[])=>new Set(ids.filter(id=>id===tagGood)), existingExtensionIds:(ids:string[])=>new Set(ids.filter(id=>id===extGood)),
      setProfileTags:(id:string,ids:string[])=>tags.set(id,ids), setProfileExtensionIds:async(id:string,ids:string[])=>{exts.set(id,ids);}
    },
    references:{ groupExists:()=>false, proxyExists:()=>false },
    options:{ now:()=> '2026-10-01T00:00:00.000Z' }
  });
  return {paths,profiles,tags,exts,service,setFailCreate:(v:boolean)=>{failCreate=v;}};
}

describe('ProfileConfigTransferService',()=>{
  it('exports strict sanitized config without runtime/session/secret fields',async()=>{
    const root=await createTempRoot(); try{
      const f=await fixture(root); const out=join(root,'profile.icrprofile.json'); await f.service.exportProfile(profile.id,out);
      const text=await readFile(out,'utf8'); const value=JSON.parse(text);
      expect(value.formatVersion).toBe(1); expect(value.profile.name).toBe('Export me');
      for(const forbidden of ['createdAt','updatedAt','lastUsedAt','deletedAt','encryptedPassword','proxyPassword','userDataDir','sourcePath','executablePath','cookie']) expect(text).not.toContain(forbidden);
    } finally{await removeTempRoot(root);}
  });

  it('imports clean config with name override and stale-reference warnings',async()=>{
    const root=await createTempRoot(); try{
      const f=await fixture(root); const source=join(root,'source.icrprofile.json'); await f.service.exportProfile(profile.id,source);
      const result=await f.service.importProfile(source,'Imported copy');
      expect(result.profile.name).toBe('Imported copy'); expect(result.profile.groupId).toBeNull(); expect(result.profile.proxyId).toBeNull();
      expect(result.warnings).toEqual(expect.arrayContaining(['GROUP_REFERENCE_MISSING','PROXY_REFERENCE_MISSING','TAG_REFERENCES_SKIPPED','EXTENSION_REFERENCES_SKIPPED']));
      expect(f.tags.get(importedId)).toEqual([tagGood]); expect(f.exts.get(importedId)).toEqual([extGood]);
      expect(await readdir(join(f.paths.profilesDir,importedId,'user-data'))).toEqual([]);
    } finally{await removeTempRoot(root);}
  });

  it('rejects unsupported config versions and rolls back a created profile if relation application fails',async()=>{
    const root=await createTempRoot(); try{
      const f=await fixture(root); const source=join(root,'source.icrprofile.json'); await f.service.exportProfile(profile.id,source);
      const value=JSON.parse(await readFile(source,'utf8')); value.formatVersion=2; await import('node:fs/promises').then(fs=>fs.writeFile(source,JSON.stringify(value),'utf8'));
      await expect(f.service.importProfile(source)).rejects.toMatchObject({code:'INVALID_REQUEST'});
    } finally{await removeTempRoot(root);}
  });
});
