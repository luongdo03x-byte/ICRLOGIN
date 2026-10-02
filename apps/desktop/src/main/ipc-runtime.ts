import { AppError, RUNTIME_DESKTOP_CHANNELS, type ApiEnvelope, type GeoIpStatus } from '@icrlogin/shared';
import type { AppServices } from './app-services.js';

export interface RuntimeIpcEventLike { sender: { send(channel: string, payload: unknown): void } }
export interface RuntimeIpcMainLike {
  handle(channel: string, handler: (event: RuntimeIpcEventLike, payload?: unknown) => unknown): void;
}

export interface GeoIpRuntimePort {
  status(): Promise<GeoIpStatus>;
  setLicenseKey(licenseKey: string): Promise<GeoIpStatus>;
  update(): Promise<GeoIpStatus>;
}

function errorEnvelope(error: unknown): ApiEnvelope<never> {
  if (error instanceof AppError) return { ok: false, error: { code: error.code, message: error.message } };
  return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Internal error' } };
}

async function respond<T>(operation: () => Promise<T> | T): Promise<ApiEnvelope<T>> {
  try { return { ok: true, data: await operation() }; }
  catch (error) { return errorEnvelope(error) as ApiEnvelope<T>; }
}

function parseId(payload: unknown): string {
  const id = typeof payload === 'object' && payload !== null ? (payload as { id?: unknown }).id : undefined;
  if (typeof id !== 'string' || id.trim().length === 0 || id.length > 128) throw new AppError('INVALID_REQUEST', 'Invalid profile id');
  return id;
}

function parseLicenseKey(payload: unknown): string {
  const key = typeof payload === 'object' && payload !== null ? (payload as { licenseKey?: unknown }).licenseKey : undefined;
  if (typeof key !== 'string' || key.trim().length < 8 || key.length > 512) throw new AppError('INVALID_REQUEST', 'Invalid MaxMind license key');
  return key.trim();
}

export function registerRuntimeIpcHandlers(
  ipcMain: RuntimeIpcMainLike,
  services: AppServices,
  geoIpRuntime: GeoIpRuntimePort
): void {
  ipcMain.handle(RUNTIME_DESKTOP_CHANNELS.profileStart, (event, payload) => respond(async () => {
    const id = parseId(payload);
    const unsubscribe = services.launchProgress.subscribe((progress) => {
      if (progress.profileId === id) event.sender.send(RUNTIME_DESKTOP_CHANNELS.profileLaunchProgress, progress);
    });
    const latest = services.launchProgress.get(id);
    if (latest) event.sender.send(RUNTIME_DESKTOP_CHANNELS.profileLaunchProgress, latest);
    try {
      const runtime = await services.browsers.start(id);
      return { state: runtime.state, startedAt: runtime.startedAt };
    } finally {
      unsubscribe();
    }
  }));

  ipcMain.handle(RUNTIME_DESKTOP_CHANNELS.profileRuntimeDiagnostics, (_event, payload) => respond(() => {
    const id = parseId(payload);
    return services.launchCoordinator.getEffectiveEnvironment(id);
  }));

  ipcMain.handle(RUNTIME_DESKTOP_CHANNELS.geoIpStatus, () => respond(() => geoIpRuntime.status()));
  ipcMain.handle(RUNTIME_DESKTOP_CHANNELS.geoIpSetLicenseKey, (_event, payload) => respond(() => geoIpRuntime.setLicenseKey(parseLicenseKey(payload))));
  ipcMain.handle(RUNTIME_DESKTOP_CHANNELS.geoIpUpdate, () => respond(() => geoIpRuntime.update()));
}
