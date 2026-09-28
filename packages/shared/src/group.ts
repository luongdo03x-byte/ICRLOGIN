import { z } from 'zod';

export const CreateGroupInputSchema = z.object({
  name: z.string().trim().min(1).max(100)
});

export const UpdateGroupInputSchema = z.object({
  name: z.string().trim().min(1).max(100)
});

export interface CreateGroupInput {
  name: string;
}

export interface UpdateGroupInput {
  name: string;
}

export interface Group {
  id: string;
  name: string;
  sortOrder: number;
  profileCount: number;
  createdAt: string;
  updatedAt: string;
}
