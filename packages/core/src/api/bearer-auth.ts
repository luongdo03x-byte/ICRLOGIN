import { createHash, timingSafeEqual } from 'node:crypto';

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

export function constantTimeTokenEqual(left: string, right: string): boolean {
  return timingSafeEqual(digest(left), digest(right));
}

export function authorizeBearer(header: string | undefined, token: string | undefined): boolean {
  if (!token) return true;
  if (!header?.startsWith('Bearer ')) return false;
  return constantTimeTokenEqual(header.slice(7), token);
}
