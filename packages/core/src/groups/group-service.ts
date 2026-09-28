import { randomUUID } from 'node:crypto';
import {
  AppError,
  CreateGroupInputSchema,
  UpdateGroupInputSchema,
  type CreateGroupInput,
  type Group,
  type UpdateGroupInput
} from '@icrlogin/shared';
import { GroupRepository } from '../repositories/group-repository.js';

export interface GroupServiceOptions {
  idFactory?: () => string;
  now?: () => string;
}

function invalidGroup(message: string): AppError {
  return new AppError('INVALID_REQUEST', message);
}

export class GroupService {
  private readonly idFactory: () => string;
  private readonly now: () => string;

  constructor(
    private readonly repository: GroupRepository,
    options: GroupServiceOptions = {}
  ) {
    this.idFactory = options.idFactory ?? randomUUID;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  list(): Group[] {
    return this.repository.list();
  }

  create(input: CreateGroupInput): Group {
    let parsed: CreateGroupInput;
    try {
      parsed = CreateGroupInputSchema.parse(input) as CreateGroupInput;
    } catch {
      throw invalidGroup('Invalid group input');
    }

    const timestamp = this.now();
    try {
      return this.repository.create({
        id: this.idFactory(),
        name: parsed.name,
        sortOrder: this.repository.nextSortOrder(),
        createdAt: timestamp,
        updatedAt: timestamp
      });
    } catch {
      throw invalidGroup('Group name already exists');
    }
  }

  update(id: string, input: UpdateGroupInput): Group {
    let parsed: UpdateGroupInput;
    try {
      parsed = UpdateGroupInputSchema.parse(input) as UpdateGroupInput;
    } catch {
      throw invalidGroup('Invalid group input');
    }

    try {
      const updated = this.repository.updateName(id, parsed.name, this.now());
      if (!updated) throw invalidGroup('Group not found');
      return updated;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw invalidGroup('Group name already exists');
    }
  }

  delete(id: string): void {
    if (!this.repository.getById(id)) throw invalidGroup('Group not found');
    this.repository.deleteAndUngroupProfiles(id);
  }
}
