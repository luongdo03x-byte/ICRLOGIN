import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  AppError,
  PROFILE_CONFIG_EXPORT_VERSION,
  ProfileConfigExportSchema,
  type CreateProfileInput,
  type ImportProfileResult,
  type Profile,
  type ProfileConfigExport
} from '@icrlogin/shared';

interface ProfileTransferStore {
  getById(id:string): Profile | null;
  create(input:CreateProfileInput): Promise<Profile>;
  removeCreated(id:string): Promise<void>;
}
interface TransferRelations {
  getTagIds(profileId:string): string[];
  getExtensionIds(profileId:string): string[];
  existingTagIds(ids:string[]): Set<string>;
  existingExtensionIds(ids:string[]): Set<string>;
  setProfileTags(profileId:string,ids:string[]): void;
  setProfileExtensionIds(profileId:string,ids:string[]): Promise<void> | void;
}
interface TransferReferences { groupExists(id:string):boolean; proxyExists(id:string):boolean; }
export interface ProfileConfigTransferServiceDependencies {
  profiles: ProfileTransferStore;
  relations: TransferRelations;
  references: TransferReferences;
  options?: { now?:()=>string };
}
function invalid(message:string):AppError{return new AppError('INVALID_REQUEST',message);}
function publicConfig(profile:Profile){
  return {
    name:profile.name,browserVersion:profile.browserVersion,groupId:profile.groupId,proxyId:profile.proxyId,
    userAgent:profile.userAgent,language:profile.language,timezone:profile.timezone,
    environmentMode:profile.environmentMode,latitude:profile.latitude,longitude:profile.longitude,accuracy:profile.accuracy,
    windowWidth:profile.windowWidth,windowHeight:profile.windowHeight,screenWidth:profile.screenWidth,screenHeight:profile.screenHeight,
    webrtcEnabled:profile.webrtcEnabled,geolocationMode:profile.geolocationMode,startupUrls:[...profile.startupUrls],description:profile.description
  };
}
export class ProfileConfigTransferService {
  private readonly now:()=>string;
  constructor(private readonly deps:ProfileConfigTransferServiceDependencies){this.now=deps.options?.now??(()=>new Date().toISOString());}
  async exportProfile(profileId:string,destination:string):Promise<void>{
    const profile=this.deps.profiles.getById(profileId); if(!profile)throw new AppError('PROFILE_NOT_FOUND','Profile not found');
    const payload:ProfileConfigExport={formatVersion:PROFILE_CONFIG_EXPORT_VERSION,exportedAt:this.now(),profile:publicConfig(profile),tagIds:this.deps.relations.getTagIds(profileId),extensionIds:this.deps.relations.getExtensionIds(profileId)};
    const validated=ProfileConfigExportSchema.parse(payload);
    const temp=join(dirname(destination),`.${randomUUID()}.tmp`);
    try{await writeFile(temp,`${JSON.stringify(validated,null,2)}\n`,{encoding:'utf8',flag:'wx'});await rename(temp,destination);}catch(error){await rm(temp,{force:true});throw error;}
  }
  async importProfile(source:string,requestedName?:string):Promise<ImportProfileResult>{
    let parsed:ProfileConfigExport;
    try{parsed=ProfileConfigExportSchema.parse(JSON.parse(await readFile(source,'utf8'))) as ProfileConfigExport;}catch{throw invalid('Invalid profile config export');}
    const warnings:string[]=[];
    const sourceProfile=parsed.profile;
    const groupId=sourceProfile.groupId&&this.deps.references.groupExists(sourceProfile.groupId)?sourceProfile.groupId:null;
    if(sourceProfile.groupId&&groupId===null)warnings.push('GROUP_REFERENCE_MISSING');
    const proxyId=sourceProfile.proxyId&&this.deps.references.proxyExists(sourceProfile.proxyId)?sourceProfile.proxyId:null;
    if(sourceProfile.proxyId&&proxyId===null)warnings.push('PROXY_REFERENCE_MISSING');
    const existingTags=this.deps.relations.existingTagIds(parsed.tagIds);const tagIds=parsed.tagIds.filter(id=>existingTags.has(id));
    if(tagIds.length!==parsed.tagIds.length)warnings.push('TAG_REFERENCES_SKIPPED');
    const existingExtensions=this.deps.relations.existingExtensionIds(parsed.extensionIds);const extensionIds=parsed.extensionIds.filter(id=>existingExtensions.has(id));
    if(extensionIds.length!==parsed.extensionIds.length)warnings.push('EXTENSION_REFERENCES_SKIPPED');
    const input:CreateProfileInput={...sourceProfile,name:requestedName?.trim()||sourceProfile.name,groupId,proxyId};
    let created:Profile|undefined;
    try{
      created=await this.deps.profiles.create(input);
      this.deps.relations.setProfileTags(created.id,tagIds);
      await this.deps.relations.setProfileExtensionIds(created.id,extensionIds);
      return {profile:created,warnings};
    }catch(error){if(created)await this.deps.profiles.removeCreated(created.id).catch(()=>undefined);throw error;}
  }
}
