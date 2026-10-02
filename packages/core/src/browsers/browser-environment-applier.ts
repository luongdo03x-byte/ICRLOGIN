import { AppError } from '@icrlogin/shared';
import { CdpConnection } from './cdp-client.js';
import type { EffectiveRuntimeEnvironment } from './runtime-environment-resolver.js';

export interface CdpConnectionLike {
  connect(): Promise<void>;
  send<T = unknown>(method: string, params?: unknown, sessionId?: string): Promise<T>;
  on(method: string, listener: (params: any, sessionId?: string) => void): () => void;
  close(): void;
}

export interface BrowserEnvironmentHandle {
  openUrls(urls: readonly string[]): Promise<void>;
  close(): void;
}

export type CdpConnectionFactory = (webSocketUrl: string) => CdpConnectionLike;

function permissionSetting(mode: EffectiveRuntimeEnvironment['geolocationMode']): 'granted' | 'prompt' | 'denied' {
  if (mode === 'allow') return 'granted';
  if (mode === 'block') return 'denied';
  return 'prompt';
}

export class BrowserEnvironmentApplier {
  constructor(private readonly connectionFactory: CdpConnectionFactory = (url) => new CdpConnection(url)) {}

  async apply(webSocketUrl: string, environment: EffectiveRuntimeEnvironment): Promise<BrowserEnvironmentHandle> {
    const cdp = this.connectionFactory(webSocketUrl);
    try {
      await cdp.connect();
      const version = await cdp.send<{ userAgent?: string }>('Browser.getVersion');
      const effectiveUserAgent = environment.userAgent ?? version.userAgent ?? '';

      await cdp.send('Browser.setPermission', {
        permission: { name: 'geolocation' },
        setting: permissionSetting(environment.geolocationMode)
      });

      const applyToSession = async (sessionId: string): Promise<void> => {
        if (effectiveUserAgent) {
          await cdp.send('Emulation.setUserAgentOverride', {
            userAgent: effectiveUserAgent,
            acceptLanguage: environment.language
          }, sessionId);
        }
        await cdp.send('Emulation.setLocaleOverride', {
          locale: environment.language.replace('-', '_')
        }, sessionId);
        await cdp.send('Emulation.setTimezoneOverride', { timezoneId: environment.timezone }, sessionId);
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width: environment.windowWidth,
          height: environment.windowHeight,
          screenWidth: environment.screenWidth,
          screenHeight: environment.screenHeight,
          deviceScaleFactor: 1,
          mobile: false
        }, sessionId);
        if (environment.latitude !== null && environment.longitude !== null) {
          await cdp.send('Emulation.setGeolocationOverride', {
            latitude: environment.latitude,
            longitude: environment.longitude,
            accuracy: environment.accuracy ?? 0
          }, sessionId);
        } else {
          await cdp.send('Emulation.clearGeolocationOverride', {}, sessionId);
        }
      };

      const disposeAttached = cdp.on('Target.attachedToTarget', (params) => {
        if (params?.targetInfo?.type !== 'page' || typeof params.sessionId !== 'string') return;
        const sessionId = params.sessionId;
        void (async () => {
          try {
            await applyToSession(sessionId);
          } finally {
            await cdp.send('Runtime.runIfWaitingForDebugger', {}, sessionId).catch(() => undefined);
          }
        })().catch(() => undefined);
      });
      await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });

      const existing = await cdp.send<{ targetInfos?: Array<{ targetId: string; type: string }> }>('Target.getTargets');
      for (const target of existing.targetInfos ?? []) {
        if (target.type !== 'page') continue;
        const attached = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId: target.targetId, flatten: true });
        await applyToSession(attached.sessionId);
      }

      let closed = false;
      return {
        async openUrls(urls: readonly string[]): Promise<void> {
          for (const url of urls) await cdp.send('Target.createTarget', { url });
        },
        close() {
          if (closed) return;
          closed = true;
          disposeAttached();
          cdp.close();
        }
      };
    } catch (error) {
      cdp.close();
      throw new AppError('BROWSER_ENVIRONMENT_APPLY_FAILED', 'Unable to apply browser runtime environment', {
        cause: error instanceof Error ? error.message : String(error)
      });
    }
  }
}
