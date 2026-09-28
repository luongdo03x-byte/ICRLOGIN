import { randomUUID } from 'node:crypto';
import {
  AppError,
  CreateProxyInputSchema,
  type CreateProxyInput,
  type Proxy,
  type ProxyPublic
} from '@icrlogin/shared';
import type { SecretStore } from '../security/secret-store.js';
import { ProxyRepository, type ProxyRepositoryUpdate } from '../repositories/proxy-repository.js';
import type { ProxyRuntimeConfig } from './proxy-args.js';

export type UpdateProxyInput = Partial<CreateProxyInput>;

export interface ProxyServiceOptions {
  idFactory?: () => string;
  now?: () => string;
}

function toPublic(proxy: Proxy): ProxyPublic {
  return {
    id: proxy.id,
    name: proxy.name,
    type: proxy.type,
    host: proxy.host,
    port: proxy.port,
    username: proxy.username,
    hasPassword: proxy.encryptedPassword !== null,
    createdAt: proxy.createdAt,
    updatedAt: proxy.updatedAt
  };
}

function invalidProxy(message = 'Invalid proxy input'): AppError {
  return new AppError('PROXY_INVALID', message);
}

export class ProxyService {
  private readonly idFactory: () => string;
  private readonly now: () => string;

  constructor(
    private readonly repository: ProxyRepository,
    private readonly secretStore: SecretStore,
    options: ProxyServiceOptions = {}
  ) {
    this.idFactory = options.idFactory ?? randomUUID;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async create(input: CreateProxyInput): Promise<ProxyPublic> {
    let parsed: CreateProxyInput;
    try {
      parsed = CreateProxyInputSchema.parse(input) as CreateProxyInput;
    } catch {
      throw invalidProxy();
    }

    const timestamp = this.now();
    const proxy: Proxy = {
      id: this.idFactory(),
      name: parsed.name,
      type: parsed.type,
      host: parsed.host,
      port: parsed.port,
      username: parsed.username ?? null,
      encryptedPassword: parsed.password == null ? null : this.secretStore.encrypt(parsed.password),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.repository.create(proxy);
    return toPublic(proxy);
  }

  async get(id: string): Promise<ProxyPublic | null> {
    const proxy = this.repository.getInternalById(id);
    return proxy ? toPublic(proxy) : null;
  }

  async update(id: string, input: UpdateProxyInput): Promise<ProxyPublic> {
    const existing = this.repository.getInternalById(id);
    if (!existing) throw invalidProxy('Proxy not found');

    const candidate: CreateProxyInput = {
      name: input.name ?? existing.name,
      type: input.type ?? existing.type,
      host: input.host ?? existing.host,
      port: input.port ?? existing.port,
      username: input.username === undefined ? existing.username : input.username,
      password: input.password === undefined
        ? (existing.encryptedPassword === null ? null : this.secretStore.decrypt(existing.encryptedPassword))
        : input.password
    };

    let parsed: CreateProxyInput;
    try {
      parsed = CreateProxyInputSchema.parse(candidate) as CreateProxyInput;
    } catch {
      throw invalidProxy();
    }

    const update: ProxyRepositoryUpdate = {
      name: parsed.name,
      type: parsed.type,
      host: parsed.host,
      port: parsed.port,
      username: parsed.username ?? null,
      encryptedPassword: parsed.password == null ? null : this.secretStore.encrypt(parsed.password)
    };
    const updated = this.repository.update(id, update, this.now());
    if (!updated) throw invalidProxy('Proxy not found');
    return toPublic(updated);
  }

  async delete(id: string): Promise<void> {
    this.repository.delete(id);
  }

  async getRuntimeConfig(id: string): Promise<ProxyRuntimeConfig> {
    const proxy = this.repository.getInternalById(id);
    if (!proxy) throw invalidProxy('Proxy not found');
    return {
      id: proxy.id,
      type: proxy.type,
      host: proxy.host,
      port: proxy.port,
      username: proxy.username,
      password: proxy.encryptedPassword === null ? null : this.secretStore.decrypt(proxy.encryptedPassword)
    };
  }
}
