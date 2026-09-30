import type { ExtensionRecord, ExtensionSourceType } from '@icrlogin/shared';
import type { Database } from '../db/database.js';

export interface StoredExtension extends ExtensionRecord { sourcePath: string; }
type ExtensionRow = { id:string;name:string;version:string;source_type:ExtensionSourceType;source_path:string;enabled:number;profile_count:number;group_count:number;created_at:string;updated_at:string; };
function mapRow(row:ExtensionRow):StoredExtension{return{id:row.id,name:row.name,version:row.version,sourceType:row.source_type,sourcePath:row.source_path,enabled:row.enabled===1,profileCount:Number(row.profile_count),groupCount:Number(row.group_count),createdAt:row.created_at,updatedAt:row.updated_at};}
const SELECT_EXTENSION=`
  SELECT e.*,
    (SELECT COUNT(*) FROM profile_extensions pe WHERE pe.extension_id = e.id) AS profile_count,
    (SELECT COUNT(*) FROM group_extensions ge WHERE ge.extension_id = e.id) AS group_count
  FROM extensions e
`;

export class ExtensionRepository {
  constructor(private readonly db:Database){}
  list():StoredExtension[]{return(this.db.prepare(`${SELECT_EXTENSION} ORDER BY e.name COLLATE NOCASE`).all() as ExtensionRow[]).map(mapRow);}
  getById(id:string):StoredExtension|null{const row=this.db.prepare(`${SELECT_EXTENSION} WHERE e.id = ?`).get(id) as ExtensionRow|undefined;return row?mapRow(row):null;}
  create(value:StoredExtension):StoredExtension{this.db.prepare('INSERT INTO extensions(id, name, version, source_type, source_path, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(value.id,value.name,value.version,value.sourceType,value.sourcePath,value.enabled?1:0,value.createdAt,value.updatedAt);return value;}
  setEnabled(id:string,enabled:boolean,updatedAt:string):StoredExtension|null{const result=this.db.prepare('UPDATE extensions SET enabled = ?, updated_at = ? WHERE id = ?').run(enabled?1:0,updatedAt,id);return result.changes===0?null:this.getById(id);}
  delete(id:string):void{this.db.prepare('DELETE FROM extensions WHERE id = ?').run(id);}
  profileExists(id:string):boolean{return Boolean(this.db.prepare('SELECT 1 FROM profiles WHERE id = ? AND deleted_at IS NULL').get(id));}
  groupExists(id:string):boolean{return Boolean(this.db.prepare('SELECT 1 FROM groups WHERE id = ?').get(id));}
  existingIds(ids:string[]):Set<string>{if(ids.length===0)return new Set();const placeholders=ids.map(()=>'?').join(', ');const rows=this.db.prepare(`SELECT id FROM extensions WHERE id IN (${placeholders})`).all(...ids) as Array<{id:string}>;return new Set(rows.map(row=>row.id));}
  assignProfile(profileId:string,extensionId:string):void{this.db.prepare('INSERT OR IGNORE INTO profile_extensions(profile_id, extension_id) VALUES (?, ?)').run(profileId,extensionId);}
  removeProfile(profileId:string,extensionId:string):void{this.db.prepare('DELETE FROM profile_extensions WHERE profile_id = ? AND extension_id = ?').run(profileId,extensionId);}
  assignGroup(groupId:string,extensionId:string):void{this.db.prepare('INSERT OR IGNORE INTO group_extensions(group_id, extension_id) VALUES (?, ?)').run(groupId,extensionId);}
  removeGroup(groupId:string,extensionId:string):void{this.db.prepare('DELETE FROM group_extensions WHERE group_id = ? AND extension_id = ?').run(groupId,extensionId);}
  directIds(profileId:string):string[]{return(this.db.prepare('SELECT extension_id FROM profile_extensions WHERE profile_id = ? ORDER BY extension_id').all(profileId) as Array<{extension_id:string}>).map(row=>row.extension_id);}
  setDirectIds(profileId:string,extensionIds:string[]):void{this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('DELETE FROM profile_extensions WHERE profile_id = ?').run(profileId);const insert=this.db.prepare('INSERT INTO profile_extensions(profile_id, extension_id) VALUES (?, ?)');for(const extensionId of extensionIds)insert.run(profileId,extensionId);this.db.exec('COMMIT');}catch(error){this.db.exec('ROLLBACK');throw error;}}
  profileIdsForGroup(groupId:string):string[]{return(this.db.prepare('SELECT id FROM profiles WHERE group_id = ? AND deleted_at IS NULL ORDER BY id').all(groupId) as Array<{id:string}>).map(row=>row.id);}
  affectedProfileIds(extensionId:string):string[]{return(this.db.prepare(`
    SELECT DISTINCT p.id
    FROM profiles p
    WHERE p.deleted_at IS NULL AND (
      EXISTS (SELECT 1 FROM profile_extensions pe WHERE pe.profile_id = p.id AND pe.extension_id = ?)
      OR EXISTS (SELECT 1 FROM group_extensions ge WHERE ge.group_id = p.group_id AND ge.extension_id = ?)
    )
    ORDER BY p.id
  `).all(extensionId,extensionId) as Array<{id:string}>).map(row=>row.id);}
  listForProfile(profileId:string):StoredExtension[]{return(this.db.prepare(`
    ${SELECT_EXTENSION}
    WHERE e.id IN (
      SELECT pe.extension_id FROM profile_extensions pe WHERE pe.profile_id = ?
      UNION
      SELECT ge.extension_id FROM group_extensions ge JOIN profiles p ON p.group_id = ge.group_id WHERE p.id = ? AND p.deleted_at IS NULL
    )
    ORDER BY e.name COLLATE NOCASE
  `).all(profileId,profileId) as ExtensionRow[]).map(mapRow);}
}
