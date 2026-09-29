import { z } from 'zod';
import type { AppErrorCode } from './errors.js';

const id = z.string().uuid();
const ids = z.array(id).min(1).max(500);

export const BulkStartInputSchema = z.object({
  ids,
  concurrency: z.number().int().min(1).max(5).default(3)
}).strict();

export const BulkIdsInputSchema = z.object({ ids }).strict();
export const BulkMoveGroupInputSchema = z.object({ ids, groupId: id.nullable() }).strict();
export const BulkAssignProxyInputSchema = z.object({ ids, proxyId: id.nullable() }).strict();
export const BulkTagsInputSchema = z.object({ ids, tagIds: z.array(id).min(1).max(100) }).strict();

export type BulkItemResult<T = null> =
  | { id: string; success: true; data: T }
  | { id: string; success: false; error: { code: AppErrorCode; message: string } };
