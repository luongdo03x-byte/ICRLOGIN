import type { AppUpdateSnapshot } from '@icrlogin/shared';

export type UpdateAction = 'check' | 'download';

export function updateAction(snapshot: AppUpdateSnapshot): UpdateAction | null {
  if (snapshot.state === 'available') return 'download';
  if (snapshot.state === 'idle' || snapshot.state === 'up-to-date' || snapshot.state === 'error') return 'check';
  return null;
}

export function updateStateLabel(snapshot: AppUpdateSnapshot): string {
  switch (snapshot.state) {
    case 'disabled': return 'Updates disabled';
    case 'idle': return 'Ready to check';
    case 'checking': return 'Checking for updates…';
    case 'available': return snapshot.availableVersion ? `Version ${snapshot.availableVersion} available` : 'Update available';
    case 'downloading': return snapshot.progressPercent === null ? 'Downloading update…' : `Downloading update… ${snapshot.progressPercent.toFixed(0)}%`;
    case 'downloaded': return 'Ready for next normal quit';
    case 'up-to-date': return 'ICRLogin is up to date';
    case 'error': return 'Update operation failed';
  }
}
