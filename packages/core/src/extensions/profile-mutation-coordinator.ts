import { AppError } from '@icrlogin/shared';
import type { ProfileOperationLock } from '../browsers/operation-lock.js';
import type { ProcessRegistry } from '../browsers/process-registry.js';

export class ProfileMutationCoordinator {
  constructor(
    private readonly operationLock: ProfileOperationLock,
    private readonly registry: ProcessRegistry
  ) {}

  async runWithStoppedProfiles<T>(
    profileIds: readonly string[],
    operation: () => Promise<T> | T,
    message = 'Stop affected profiles before changing this setting'
  ): Promise<T> {
    const ids = [...new Set(profileIds)].sort();
    const run = async (index: number): Promise<T> => {
      if (index >= ids.length) {
        for (const id of ids) {
          if (this.registry.get(id)) {
            throw new AppError('INVALID_REQUEST', message);
          }
        }
        return operation();
      }
      const id = ids[index]!;
      return this.operationLock.runExclusive(id, () => run(index + 1));
    };
    return run(0);
  }
}
