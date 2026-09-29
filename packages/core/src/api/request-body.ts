import { AppError } from '@icrlogin/shared';

export const DEFAULT_JSON_BODY_LIMIT = 1024 * 1024;

export async function readJsonBody(
  request: AsyncIterable<Uint8Array | string>,
  limit = DEFAULT_JSON_BODY_LIMIT
): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new AppError('INVALID_REQUEST', 'Request body exceeds 1 MiB');
    chunks.push(buffer);
  }

  if (size === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new AppError('INVALID_REQUEST', 'Malformed JSON');
  }
}
