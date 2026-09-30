import { contextBridge, ipcRenderer } from 'electron';
import { type ApiEnvelope, type IcrDesktopApiV6 } from '@icrlogin/shared';
import { createPublicBridge } from './bridge.js';
const bridge:IcrDesktopApiV6=createPublicBridge((channel,payload)=>ipcRenderer.invoke(channel,payload) as Promise<ApiEnvelope<unknown>>,(channel,listener)=>{const wrapped=(_event:unknown,payload:unknown)=>listener(payload);ipcRenderer.on(channel,wrapped);return()=>ipcRenderer.removeListener(channel,wrapped);});
contextBridge.exposeInMainWorld('icr',bridge);
