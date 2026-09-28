import type { ProxyType } from '@icrlogin/shared';

export interface ProxyRuntimeConfig {
  id: string;
  type: ProxyType;
  host: string;
  port: number;
  username: string | null;
  password: string | null;
}

export function buildProxyServerArg(config: ProxyRuntimeConfig): string {
  return `${config.type}://${config.host}:${config.port}`;
}
