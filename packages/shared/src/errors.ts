export const APP_ERROR_CODES = [
  'INVALID_REQUEST',
  'PROFILE_NOT_FOUND',
  'PROFILE_ALREADY_RUNNING',
  'PROFILE_START_IN_PROGRESS',
  'PROFILE_NOT_RUNNING',
  'BROWSER_NOT_INSTALLED',
  'BROWSER_DOWNLOAD_FAILED',
  'BROWSER_CHECKSUM_MISMATCH',
  'BROWSER_ARCHIVE_INVALID',
  'PORT_UNAVAILABLE',
  'BROWSER_START_FAILED',
  'CDP_TIMEOUT',
  'PROXY_INVALID',
  'PROXY_CONNECTION_FAILED',
  'RATE_LIMITED',
  'ROUTE_NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'BROWSER_IN_USE',
  'INTERNAL_ERROR'
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(code: AppErrorCode, message: string, details?: Readonly<Record<string, unknown>>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}
