import { join } from 'node:path';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { Profile } from '@icrlogin/shared';
import { createAppPaths, ensureAppPaths } from '../src/app-paths.js';
import { openDatabase } from '../src/db/database.js';
import { runMigrations } from '../src/db/migrate.js';
import { StartupRecoveryService } from '../src/recovery/startup-recovery.js';
import { ProfileRepository } from '../src/repositories/profile-repository.js';
import { createTempRoot, removeTempRoot } from './helpers/temp-root.js';

const profileId='123e4567-e89b-42d3-a456-426614174000';
const suffix='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const profile:Profile={id:profileId,name:'Recovered',description:null,groupId:null,browserVersion:'144',proxyId:null,userAgent:null,language:'en-US',timezone:'UTC',windowWidth:1280,windowHeight:800,screenWidth:1920,screenHeight:1080,webrtcEnabled:true,geolocationMode:'ask',startupUrls:[],createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z',lastUsedAt:null,deletedAt:null};

describe('startup recovery integration',()=>{
  it('promotes an interrupted profile staging directory when the active sqlite row already exists',async()=>{
    const root=await createTempRoot();try{
      const paths=createAppPaths(root);await ensureAppPaths(paths);
      const db=openDatabase(join(paths.dataDir,'icrlogin.db'));
      try{
        await runMigrations(db);
        new ProfileRepository(db).create(profile);
        const staging=join(paths.profilesDir,`.staging-${profileId}-${suffix}`);await mkdir(staging);await writeFile(join(staging,'sentinel.txt'),'preserved','utf8');
        const report=await new StartupRecoveryService({db,paths}).run();
        expect(report).toMatchObject({databaseHealthy:true,recoveredEntries:1,cleanupErrors:0});
        expect(await readdir(join(paths.profilesDir,profileId))).toEqual(['sentinel.txt']);
      }finally{db.close();}
    }finally{await removeTempRoot(root);}
  });
});
