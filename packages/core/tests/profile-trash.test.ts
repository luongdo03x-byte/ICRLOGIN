import { describe, expect, it } from 'vitest';
import type { Profile } from '@icrlogin/shared';
import { ProfileService } from '../src/profiles/profile-service.js';

const deleted: Profile = {
  id:'123e4567-e89b-42d3-a456-426614174000',name:'Trash me',description:null,groupId:null,browserVersion:'144.0.0',proxyId:null,userAgent:null,
  language:'en-US',timezone:'UTC',windowWidth:1280,windowHeight:800,screenWidth:1920,screenHeight:1080,webrtcEnabled:true,
  geolocationMode:'ask',startupUrls:[],createdAt:'2026-09-01T00:00:00.000Z',updatedAt:'2026-09-02T00:00:00.000Z',lastUsedAt:null,deletedAt:'2026-09-30T00:00:00.000Z'
};

function fixture(options:{active?:boolean;running?:boolean;deleteFails?:boolean}={}){
  let profile:Profile|null=options.active?{...deleted,deletedAt:null}:deleted;
  const events:string[]=[];
  const repository:any={
    listTrash:()=>profile?.deletedAt?[profile]:[],
    getById:()=>profile,
    deleteById:()=>{events.push('db-delete');if(options.deleteFails)throw new Error('db failed');profile=null;},
    list:()=>[],create:(v:any)=>v,update:()=>profile,softDelete:()=>undefined,restore:()=>profile
  };
  const files:any={
    stageTrashPurge:async()=>{events.push('stage');return '/trash/.purging-id-x';},
    rollbackTrashPurge:async()=>{events.push('rollback');},
    commitTrashPurge:async()=>{events.push('commit');},
    create:async()=>undefined,moveToTrash:async()=>undefined,restoreFromTrash:async()=>undefined
  };
  const lock={runExclusive:async(_id:string,fn:()=>Promise<any>)=>{events.push('lock');return fn();}};
  const browsers={getState:()=>options.running?'running':'stopped'};
  const service=new ProfileService(repository,files,{browsers,operationLock:lock as any});
  return{service,events,getProfile:()=>profile};
}

describe('Profile trash',()=>{
  it('lists only soft-deleted profiles',async()=>{
    const f=fixture();expect(await f.service.listTrash()).toEqual([deleted]);
  });

  it('rejects permanent delete for active or running profiles',async()=>{
    await expect(fixture({active:true}).service.permanentDelete(deleted.id)).rejects.toMatchObject({code:'INVALID_REQUEST'});
    await expect(fixture({running:true}).service.permanentDelete(deleted.id)).rejects.toMatchObject({code:'INVALID_REQUEST'});
  });

  it('rolls staged filesystem rename back when DB hard delete fails',async()=>{
    const f=fixture({deleteFails:true});
    await expect(f.service.permanentDelete(deleted.id)).rejects.toThrow('db failed');
    expect(f.events).toEqual(['lock','stage','db-delete','rollback']);
    expect(f.getProfile()).not.toBeNull();
  });

  it('hard deletes DB before committing staged filesystem removal',async()=>{
    const f=fixture();await f.service.permanentDelete(deleted.id);
    expect(f.events).toEqual(['lock','stage','db-delete','commit']);
    expect(f.getProfile()).toBeNull();
  });
});
