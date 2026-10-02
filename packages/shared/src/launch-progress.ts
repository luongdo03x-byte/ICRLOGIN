export type ProfileLaunchStage =
  | 'idle'
  | 'resolving-network'
  | 'resolving-geo'
  | 'downloading-browser'
  | 'verifying-browser'
  | 'installing-browser'
  | 'preparing-runtime'
  | 'launching'
  | 'waiting-cdp'
  | 'applying-environment'
  | 'running'
  | 'failed';

export interface ProfileLaunchProgress {
  profileId: string;
  stage: ProfileLaunchStage;
  percent: number | null;
  receivedBytes: number | null;
  totalBytes: number | null;
  staleNetworkIdentity: boolean;
  message: string | null;
}
