import { join } from 'node:path';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { describe,expect,it } from 'vitest';
import { createAppPaths,ensureAppPaths } from '../src/app-paths.js';
import { StartupRecoveryService } from '../src/recovery/startup-recovery.js';
import { createTempRoot,removeTempRoot } from './helpers/temp-root.js';

const activeId='123e4567-e89b-42d3-a456-426614174000';
const deletedId='223e4567-e89b-42d3-a456-426614174000';
const orphanId='323e4567-e89b-42d3-a456-426614174000';
const suffix='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function db(quickCheck:string,rows:Record<string,{deleted_at:string|null}|undefined>={}){
  return {
    pragma:()=>quickCheck,
    prepare:()=>({get:(id:string)=>rows[id]})
  } as any;
}

describe('StartupRecoveryService',()=>{
  it('preserves profile/trash staging when database integrity is unhealthy and only removes safe browser/download temp',async()=>{
    const root=await createTempRoot();try{
      const paths=createAppPaths(root);await ensureAppPaths(paths);
      await mkdir(join(paths.profilesDir,`.staging-${activeId}-${suffix}`));
      await mkdir(join(paths.profilesDir,`.restore-${activeId}-${suffix}`));
      await mkdir(join(paths.profilesDir,'keep-profile'));
      await mkdir(join(paths.trashDir,`.purging-${deletedId}-${suffix}`));
      await mkdir(join(paths.trashDir,'keep-trash'));
      await mkdir(join(paths.browsersDir,'.staging-144'));await mkdir(join(paths.browsersDir,'144'));
      await writeFile(join(paths.downloadsTempDir,'browser-144-x.zip.part'),'x');await writeFile(join(paths.downloadsTempDir,'keep.txt'),'x');
      const report=await new StartupRecoveryService({db:db('database disk image is malformed'),paths}).run();
      expect(report).toMatchObject({databaseHealthy:false,cleanedEntries:2,recoveredEntries:0});
      expect((await readdir(paths.profilesDir)).sort()).toEqual([`.restore-${activeId}-${suffix}`,`.staging-${activeId}-${suffix}`,'keep-profile'].sort());
      expect((await readdir(paths.trashDir)).sort()).toEqual([`.purging-${deletedId}-${suffix}`,'keep-trash'].sort());
      expect(await readdir(paths.browsersDir)).toEqual(['144']);expect(await readdir(paths.downloadsTempDir)).toEqual(['keep.txt']);
    }finally{await removeTempRoot(root);}
  });

  it('promotes active profile staging, rolls deleted purge back to trash, and removes orphan staging when database is healthy',async()=>{
    const root=await createTempRoot();try{
      const paths=createAppPaths(root);await ensureAppPaths(paths);
      await mkdir(join(paths.profilesDir,`.restore-${activeId}-${suffix}`));
      await writeFile(join(paths.profilesDir,`.restore-${activeId}-${suffix}`,'sentinel.txt'),'restore');
      await mkdir(join(paths.profilesDir,`.staging-${orphanId}-${suffix}`));
      await mkdir(join(paths.trashDir,`.purging-${deletedId}-${suffix}`));
      await writeFile(join(paths.trashDir,`.purging-${deletedId}-${suffix}`,'sentinel.txt'),'trash');
      const service=new StartupRecoveryService({db:db('ok',{[activeId]:{deleted_at:null},[deletedId]:{deleted_at:'2026-09-30T00:00:00.000Z'}}),paths});
      const report=await service.run();
      expect(report).toMatchObject({databaseHealthy:true,quickCheck:'ok',recoveredEntries:2,cleanedEntries:1,cleanupErrors:0});
      expect(await readdir(join(paths.profilesDir,activeId))).toEqual(['sentinel.txt']);
      expect(await readdir(join(paths.trashDir,deletedId))).toEqual(['sentinel.txt']);
      expect((await readdir(paths.profilesDir)).includes(`.staging-${orphanId}-${suffix}`)).toBe(false);
    }finally{await removeTempRoot(root);}
  });
});
