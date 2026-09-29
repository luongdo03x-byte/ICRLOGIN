import {
  AppError,
  type AppErrorCode,
  type BrowserRuntimeInfo,
  type BulkItemResult,
  type UpdateProfileInput
} from '@icrlogin/shared';

interface BulkBrowsers {
  start(id: string): Promise<BrowserRuntimeInfo>;
  stop(id: string): Promise<void>;
  getState(id: string): string;
}

interface BulkProfiles {
  update(id: string, input: UpdateProfileInput): Promise<unknown>;
  softDelete(id: string): Promise<void>;
}

interface BulkTags {
  addProfileTags(profileId: string, tagIds: string[]): void | Promise<void>;
  removeProfileTags(profileId: string, tagIds: string[]): void | Promise<void>;
}

export interface BulkOperationDependencies {
  browsers: BulkBrowsers;
  profiles: BulkProfiles;
  tags: BulkTags;
}

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

function failure(id: string, error: unknown): BulkItemResult<never> {
  const code: AppErrorCode = error instanceof AppError ? error.code : 'INTERNAL_ERROR';
  const message = error instanceof AppError ? error.message : 'Operation failed';
  return { id, success: false, error: { code, message } };
}

export class BulkOperationService {
  constructor(private readonly deps: BulkOperationDependencies) {}

  async startProfiles(ids: readonly string[], concurrency = 3): Promise<BulkItemResult<BrowserRuntimeInfo>[]> {
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 5) {
      throw new AppError('INVALID_REQUEST', 'Bulk start concurrency must be between 1 and 5');
    }
    return this.runBounded(uniqueIds(ids), concurrency, (id) => this.deps.browsers.start(id));
  }

  async stopProfiles(ids: readonly string[]): Promise<BulkItemResult<null>[]> {
    return this.runBounded(uniqueIds(ids), 5, async (id) => {
      await this.deps.browsers.stop(id);
      return null;
    });
  }

  async moveGroup(ids: readonly string[], groupId: string | null): Promise<BulkItemResult<null>[]> {
    return this.runMetadata(ids, (id) => this.deps.profiles.update(id, { groupId }));
  }

  async assignProxy(ids: readonly string[], proxyId: string | null): Promise<BulkItemResult<null>[]> {
    return this.runMetadata(ids, (id) => this.deps.profiles.update(id, { proxyId }));
  }

  async addTags(ids: readonly string[], tagIds: string[]): Promise<BulkItemResult<null>[]> {
    const tags = [...new Set(tagIds)];
    return this.runMetadata(ids, (id) => this.deps.tags.addProfileTags(id, tags));
  }

  async removeTags(ids: readonly string[], tagIds: string[]): Promise<BulkItemResult<null>[]> {
    const tags = [...new Set(tagIds)];
    return this.runMetadata(ids, (id) => this.deps.tags.removeProfileTags(id, tags));
  }

  async softDelete(ids: readonly string[]): Promise<BulkItemResult<null>[]> {
    return this.runMetadata(ids, async (id) => {
      if (this.deps.browsers.getState(id) !== 'stopped') {
        throw new AppError('INVALID_REQUEST', 'Stop the profile before deleting it');
      }
      await this.deps.profiles.softDelete(id);
    });
  }

  private async runMetadata(ids: readonly string[], operation: (id: string) => void | Promise<unknown>): Promise<BulkItemResult<null>[]> {
    return this.runBounded(uniqueIds(ids), 5, async (id) => {
      await operation(id);
      return null;
    });
  }

  private async runBounded<T>(
    ids: readonly string[],
    concurrency: number,
    operation: (id: string) => Promise<T>
  ): Promise<BulkItemResult<T>[]> {
    const results = new Array<BulkItemResult<T>>(ids.length);
    let cursor = 0;

    const worker = async (): Promise<void> => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= ids.length) return;
        const id = ids[index]!;
        try {
          results[index] = { id, success: true, data: await operation(id) };
        } catch (error) {
          results[index] = failure(id, error) as BulkItemResult<T>;
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, () => worker()));
    return results;
  }
}
