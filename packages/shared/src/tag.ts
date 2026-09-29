import { z } from 'zod';

export const CreateTagInputSchema = z.object({
  name: z.string().trim().min(1).max(64)
}).strict();

export const UpdateTagInputSchema = CreateTagInputSchema;

export interface CreateTagInput {
  name: string;
}

export interface UpdateTagInput {
  name: string;
}

export interface Tag {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}
