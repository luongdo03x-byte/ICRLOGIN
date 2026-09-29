import type { ServerResponse } from 'node:http';
import { httpFail, httpOk } from '@icrlogin/shared';

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('content-length', Buffer.byteLength(text));
  res.end(text);
}

export { httpOk as ok, httpFail as fail };
