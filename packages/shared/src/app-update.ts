export type AppUpdateState =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'up-to-date'
  | 'error';

export type AppUpdateMessageCode =
  | 'UPDATE_DISABLED'
  | 'UPDATE_CHECK_FAILED'
  | 'UPDATE_DOWNLOAD_FAILED'
  | 'UPDATE_INTERNAL_ERROR';

export interface AppUpdateSnapshot {
  state: AppUpdateState;
  currentVersion: string;
  availableVersion: string | null;
  progressPercent: number | null;
  transferredBytes: number | null;
  totalBytes: number | null;
  installOnNextQuit: boolean;
  messageCode: AppUpdateMessageCode | null;
}
