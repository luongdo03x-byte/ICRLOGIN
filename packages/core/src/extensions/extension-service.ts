import { AppError, type ExtensionRecord } from '@icrlogin/shared';
import { ExtensionImporter } from './extension-importer.js';
import type { ProfileMutationCoordinator } from './profile-mutation-coordinator.js';
import { ExtensionRepository, type StoredExtension } from '../repositories/extension-repository.js';

function invalidExtension(message:string):AppError{return new AppError('INVALID_REQUEST',message);}
function publicRecord(value:StoredExtension):ExtensionRecord{const{sourcePath:_sourcePath,...record}=value;return record;}
export interface ExtensionServiceOptions{now?:()=>string;}

export class ExtensionService {
  private readonly now:()=>string;
  constructor(private readonly repository:ExtensionRepository,private readonly importer:ExtensionImporter,private readonly mutations:ProfileMutationCoordinator,options:ExtensionServiceOptions={}){this.now=options.now??(()=>new Date().toISOString());}
  list():ExtensionRecord[]{return this.repository.list().map(publicRecord);}
  async importUnpacked(sourceDir:string):Promise<ExtensionRecord>{return this.persistImport(await this.importer.importUnpacked(sourceDir));}
  async importCrx(crxPath:string):Promise<ExtensionRecord>{return this.persistImport(await this.importer.importCrx(crxPath));}
  async setEnabled(id:string,enabled:boolean):Promise<ExtensionRecord>{this.requireExtension(id);return this.mutations.runWithStoppedProfiles(this.repository.affectedProfileIds(id),async()=>{const updated=this.repository.setEnabled(id,enabled,this.now());if(!updated)throw invalidExtension('Extension not found');return publicRecord(updated);});}
  async delete(id:string):Promise<void>{
    const extension=this.requireExtension(id);
    await this.mutations.runWithStoppedProfiles(this.repository.affectedProfileIds(id),async()=>{
      const staged=await this.importer.stageInternalRemoval(extension.sourcePath);
      try{
        this.repository.delete(id);
      }catch(error){
        await staged.rollback();
        throw error;
      }
      await staged.commit();
    });
  }
  async assignToProfile(extensionId:string,profileId:string):Promise<void>{this.requireExtension(extensionId);if(!this.repository.profileExists(profileId))throw invalidExtension('Profile not found');await this.mutations.runWithStoppedProfiles([profileId],async()=>{this.repository.assignProfile(profileId,extensionId);});}
  async removeFromProfile(extensionId:string,profileId:string):Promise<void>{this.requireExtension(extensionId);if(!this.repository.profileExists(profileId))throw invalidExtension('Profile not found');await this.mutations.runWithStoppedProfiles([profileId],async()=>{this.repository.removeProfile(profileId,extensionId);});}
  async assignToGroup(extensionId:string,groupId:string):Promise<void>{this.requireExtension(extensionId);if(!this.repository.groupExists(groupId))throw invalidExtension('Group not found');const profileIds=this.repository.profileIdsForGroup(groupId);await this.mutations.runWithStoppedProfiles(profileIds,async()=>{this.repository.assignGroup(groupId,extensionId);});}
  async removeFromGroup(extensionId:string,groupId:string):Promise<void>{this.requireExtension(extensionId);if(!this.repository.groupExists(groupId))throw invalidExtension('Group not found');const profileIds=this.repository.profileIdsForGroup(groupId);await this.mutations.runWithStoppedProfiles(profileIds,async()=>{this.repository.removeGroup(groupId,extensionId);});}
  listForProfile(profileId:string):ExtensionRecord[]{if(!this.repository.profileExists(profileId))throw invalidExtension('Profile not found');return this.repository.listForProfile(profileId).map(publicRecord);}
  getDirectExtensionIds(profileId:string):string[]{if(!this.repository.profileExists(profileId))throw invalidExtension('Profile not found');return this.repository.directIds(profileId);}
  async setProfileExtensionIds(profileId:string,extensionIds:string[]):Promise<void>{const ids=[...new Set(extensionIds)];if(!this.repository.profileExists(profileId))throw invalidExtension('Profile not found');if(this.repository.existingIds(ids).size!==ids.length)throw invalidExtension('Extension not found');await this.mutations.runWithStoppedProfiles([profileId],async()=>{this.repository.setDirectIds(profileId,ids);});}
  resolvePaths(profileId:string):string[]{if(!this.repository.profileExists(profileId))throw invalidExtension('Profile not found');return[...new Set(this.repository.listForProfile(profileId).filter(extension=>extension.enabled).map(extension=>extension.sourcePath))];}
  private async persistImport(value:Awaited<ReturnType<ExtensionImporter['importUnpacked']>>):Promise<ExtensionRecord>{const timestamp=this.now();const stored:StoredExtension={...value,enabled:true,profileCount:0,groupCount:0,createdAt:timestamp,updatedAt:timestamp};try{return publicRecord(this.repository.create(stored));}catch(error){await this.importer.removeInternal(value.sourcePath).catch(()=>undefined);throw error;}}
  private requireExtension(id:string):StoredExtension{const extension=this.repository.getById(id);if(!extension)throw invalidExtension('Extension not found');return extension;}
}
