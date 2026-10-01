import { describe, expect, it } from 'vitest';
import type { AppUpdateSnapshot } from '@icrlogin/shared';
import { updateAction, updateStateLabel } from '../../src/renderer/src/pages/settings/update-model.js';

function snapshot(state: AppUpdateSnapshot['state']): AppUpdateSnapshot {
  return { state, currentVersion: '1.0.0', availableVersion: state === 'available' || state === 'downloaded' ? '1.1.0' : null, progressPercent: null, transferredBytes: null, totalBytes: null, installOnNextQuit: state === 'downloaded', messageCode: null };
}

describe('update settings model', () => {
  it('offers only check or download actions and never a force-install action', () => {
    expect(updateAction(snapshot('idle'))).toBe('check');
    expect(updateAction(snapshot('up-to-date'))).toBe('check');
    expect(updateAction(snapshot('error'))).toBe('check');
    expect(updateAction(snapshot('available'))).toBe('download');
    expect(updateAction(snapshot('checking'))).toBeNull();
    expect(updateAction(snapshot('downloading'))).toBeNull();
    expect(updateAction(snapshot('downloaded'))).toBeNull();
    expect(updateAction(snapshot('disabled'))).toBeNull();
  });

  it('uses clear non-sensitive state labels', () => {
    expect(updateStateLabel(snapshot('disabled'))).toBe('Updates disabled');
    expect(updateStateLabel(snapshot('available'))).toBe('Version 1.1.0 available');
    expect(updateStateLabel(snapshot('downloaded'))).toBe('Ready for next normal quit');
  });
});
