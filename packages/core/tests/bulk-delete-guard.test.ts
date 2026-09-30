import { describe, expect, it } from 'vitest';
import { AppError } from '@icrlogin/shared';
import { BulkOperationService } from '../src/bulk/bulk-operation-service.js';

describe('bulk delete runtime guard', () => {
  it('reports a running profile as failed without calling softDelete', async () => {
    let deletes = 0;
    const service = new BulkOperationService({
      browsers: {
        async start(id) { return { profileId: id } as any; },
        async stop() {},
        getState() { return 'running'; }
      },
      profiles: { async update() {}, async softDelete() { deletes += 1; } },
      tags: { addProfileTags() {}, removeProfileTags() {} },
      profileMutations: {
        async runWithStoppedProfiles() {
          throw new AppError('INVALID_REQUEST', 'Stop the profile before deleting it');
        }
      } as any
    });
    const result = await service.softDelete(['123e4567-e89b-42d3-a456-426614174000']);
    expect(result[0]?.success).toBe(false);
    expect(result[0]?.success ? null : result[0]?.error.code).toBe('INVALID_REQUEST');
    expect(deletes).toBe(0);
  });
});
