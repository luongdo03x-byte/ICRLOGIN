import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { BackupManifest, BackupRecordPublic, Profile } from '@icrlogin/shared';
import { createAppPaths, ensureAppPaths } from '../src/app-paths.js';
import { ProfileOperationLock } from '../src/browsers/operation-lock.js';
import { ProfileFiles } from '../src/profiles/profile-files.js';
import { ProfileBackupService } from '../src/backups/profile-backup-service.js';
import { createTempRoot, removeTempRoot } from './helpers/temp-root.js';

const profile: Profile = {
  id:'123e4567-e89b-42d3-a456-426614174000',name:'QA',description:null,groupId:null,browserVersion:'144.0.0',proxyId:null,userAgent:null,
  language:'en-US',timezone:'UTC',windowWidth:1280,windowHeight:800,screenWidth:1920,screenHeight:1080,webrtcEnabled:true,
  geolocationMode:'ask',startupUrls:[],createdAt:'2026-09-30T00:00:00.000Z',updatedAt:'2026-09-30T00:00:00.000Z',lastUsedAt:null,deletedAt:null
};

function fixture(root: string) {
  const paths = createAppPaths(root);
  const profileFiles = new ProfileFiles(paths);
  const history: BackupRecordPublic[] = [];
  const calls: Array<{ destination:string; entries:any[]; base:any }> = [];
  let state: any = 'stopped';
  let failWriter = false;
  const writer = {
    async write(destination:string, entries:any[], base:any) {
      calls.push({ destination, entries, base });
      if (failWriter) throw new Error('archive failed');
      await writeFile(destination, 'archive');
      const manifest = { ...base, payloadChecksum:'a'.repeat(64), entries:[] } as BackupManifest;
      return { checksum:'a'.repeat(64), manifest };
    }
  };
  const service = new ProfileBackupService({
    profiles:{ getById:(id:string)=>id===profile.id?profile:null },
    profileFiles,
    relations:{ getTagIds:()=>['11111111-1111-4111-8111-111111111111'], getExtensionIds:()=>['22222222-2222-4222-8222-222222222222'] },
    browsers:{ getState:()=>state },
    operationLock:new ProfileOperationLock(),
    writer,
    history:{ create:(record:BackupRecordPublic)=>{ history.push(record); return record; } },
    paths,
    options:{ appVersion:'0.1.0', idFactory:()=> '33333333-3333-4333-8333-333333333333', now:()=> '2026-09-30T01:02:03.000Z' }
  } as any);
  return { paths, profileFiles, history, calls, service, setState:(value:any)=>{state=value;}, setFailWriter:(value:boolean)=>{failWriter=value;} };
}

describe('ProfileBackupService', () => {
  it('writes metadata-only public profile/tag/extension payloads without user-data or secret/internal paths', async () => {
    const root=await createTempRoot();
    try {
      const f=fixture(root); await ensureAppPaths(f.paths); await f.profileFiles.create(profile.id);
      const record=await f.service.backup(profile.id,'metadata');
      expect(record.status).toBe('completed');
      const names=f.calls[0]!.entries.map((entry:any)=>entry.archivePath).sort();
      expect(names).toEqual(['extensions.json','profile.json','tags.json']);
      const serialized=f.calls[0]!.entries.filter((entry:any)=>entry.data).map((entry:any)=>Buffer.from(entry.data).toString('utf8')).join('\n');
      for(const forbidden of ['proxyPassword','apiToken','sourcePath','userDataDir','executablePath']) expect(serialized).not.toContain(forbidden);
      expect(names.some((name:string)=>name.startsWith('user-data/'))).toBe(false);
      expect(await readFile(join(f.paths.backupsDir,record.fileName),'utf8')).toBe('archive');
    } finally { await removeTempRoot(root); }
  });

  it('includes user-data files in full backup and rejects full backup when runtime is not stopped', async () => {
    const root=await createTempRoot();
    try {
      const f=fixture(root); await ensureAppPaths(f.paths); await f.profileFiles.create(profile.id);
      await writeFile(join(f.paths.profilesDir,profile.id,'user-data','sentinel.txt'),'persistent');
      await f.service.backup(profile.id,'full');
      expect(f.calls[0]!.entries.map((entry:any)=>entry.archivePath)).toContain('user-data/sentinel.txt');
      f.setState('running');
      await expect(f.service.backup(profile.id,'full')).rejects.toMatchObject({ code:'INVALID_REQUEST' });
      expect(f.calls).toHaveLength(1);
    } finally { await removeTempRoot(root); }
  });

  it('records a failed history row and removes staging when archive creation fails', async () => {
    const root=await createTempRoot();
    try {
      const f=fixture(root); await ensureAppPaths(f.paths); await f.profileFiles.create(profile.id); f.setFailWriter(true);
      await expect(f.service.backup(profile.id,'metadata')).rejects.toThrow('archive failed');
      expect(f.history.at(-1)).toMatchObject({ profileId:profile.id, mode:'metadata', status:'failed', checksum:null });
    } finally { await removeTempRoot(root); }
  });
});
