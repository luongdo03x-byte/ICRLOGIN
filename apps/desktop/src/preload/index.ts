import { contextBridge, ipcRenderer } from 'electron';

export interface HealthResponse {
  status: 'ok';
  dataRoot: string;
  runningRuntimeCount: number;
}

export type Invoke = (channel: string) => Promise<HealthResponse>;

export function createPublicBridge(invoke: Invoke) {
  return Object.freeze({
    health: () => invoke('icr:health')
  });
}

const bridge = createPublicBridge((channel) => ipcRenderer.invoke(channel) as Promise<HealthResponse>);
contextBridge.exposeInMainWorld('icr', bridge);
