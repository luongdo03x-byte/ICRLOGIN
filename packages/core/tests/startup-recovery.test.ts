import { join } from 'node:path';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { describe,expect,it } from 'vitest';
import { createAppPaths,ensureAppPaths } from '../src/app-paths.js';
import { StartupRecoveryService } from '../src/recovery/startup-recovery.js';
import { createTempRoot,removeTempRoot } from './helpers/temp-root.js';

describe('StartupRecoveryService',()=>{
  it('reports unhealthy database without destructive reset and removes only managed staging prefixes',async()=>{
    const root=await createTempRoot();try{
      const paths=createAppPaths(root);await ensureAppPaths(paths);
      await mkdir(join(paths.profilesDir,'.staging-p1-x'));await mkdir(join(paths.profilesDir,'.restore-p2-x'));await mkdir(join(paths.profilesDir,'keep-profile'));
      await mkdir(join(paths.trashDir,'.purging-p3-x'));await mkdir(join(paths.trashDir,'keep-trash'));
      await mkdir(join(paths.browsersDir,'.staging-144'));await mkdir(join(paths.browsersDir,'144'));
      await writeFile(join(paths.downloadsTempDir,'browser-144-x.zip.part'),'x');await writeFile(join(paths.downloadsTempDir,'keep.txt'),'x');
      const service=new StartupRecoveryService({db:{pragma:()=> 'database disk image is malformed'} as any,paths});
      const report=await service.run();expect(report.databaseHealthy).toBe(false);expect(report.cleanedEntries).toBe(4);
      expect(await readdir(paths.profilesDir)).toEqual(['keep-profile']);expect((await readdir(paths.trashDir)).sort()).toEqual(['keep-trash']);
      expect((await readdir(paths.browsersDir)).sort()).toEqual(['144']);expect((await readdir(paths.downloadsTempDir)).sort()).toEqual(['keep.txt']);
    }finally{await removeTempRoot(root);}
  });
  it('reports healthy when sqlite quick_check returns ok',async()=>{
    const root=await createTempRoot();try{const paths=createAppPaths(root);await ensureAppPaths(paths);const service=new StartupRecoveryService({db:{pragma:()=> 'ok'} as any,paths});await expect(service.run()).resolves.toMatchObject({databaseHealthy:true,quickCheck:'ok'});}finally{await removeTempRoot(root);}
  });
});
