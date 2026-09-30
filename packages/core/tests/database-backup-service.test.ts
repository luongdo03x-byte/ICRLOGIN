import { join } from 'node:path';
import { readdir, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { createAppPaths, ensureAppPaths } from '../src/app-paths.js';
import { DatabaseBackupService } from '../src/backups/database-backup-service.js';
import { createTempRoot, removeTempRoot } from './helpers/temp-root.js';

describe('DatabaseBackupService',()=>{
  it('creates an online sqlite backup and retains only the newest 10 automatic backups',async()=>{
    const root=await createTempRoot(); try{
      const paths=createAppPaths(root); await ensureAppPaths(paths);
      const calls:string[]=[]; let counter=0;
      const db={backup:async(destination:string)=>{calls.push(destination);await writeFile(destination,`backup-${counter++}`,'utf8');}};
      const service=new DatabaseBackupService(db as any,paths,{now:()=>new Date(2026,8,30,0,0,counter).toISOString(),idFactory:()=>String(counter).padStart(4,'0')});
      for(let i=0;i<12;i++)await service.create(i%2===0?'migration':'restore');
      const dir=join(paths.backupsDir,'database'); const names=(await readdir(dir)).sort();
      expect(calls).toHaveLength(12);expect(names).toHaveLength(10);expect(names.some(name=>name.includes('migration'))).toBe(true);expect(names.some(name=>name.includes('restore'))).toBe(true);
    } finally{await removeTempRoot(root);}
  });

  it('propagates backup failures',async()=>{
    const root=await createTempRoot(); try{
      const paths=createAppPaths(root);await ensureAppPaths(paths);
      const service=new DatabaseBackupService({backup:async()=>{throw new Error('backup failed');}} as any,paths);
      await expect(service.create('migration')).rejects.toThrow('backup failed');
    } finally{await removeTempRoot(root);}
  });
});
