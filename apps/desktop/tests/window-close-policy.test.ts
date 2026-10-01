import { describe, expect, it } from 'vitest';
import { resolveWindowCloseAction, shouldPromptBeforeClose } from '../src/main/window-close-policy.js';

describe('window close policy', () => {
  it('prompts only in ask mode when managed Chromium is still running', () => {
    expect(shouldPromptBeforeClose('ask', 0)).toBe(false);
    expect(shouldPromptBeforeClose('ask', 1)).toBe(true);
    expect(shouldPromptBeforeClose('ask', 10)).toBe(true);
    expect(shouldPromptBeforeClose('quit', 3)).toBe(false);
    expect(shouldPromptBeforeClose('tray', 3)).toBe(false);
  });

  it('resolves tray, prompt and quit actions without stopping browsers', () => {
    expect(resolveWindowCloseAction('tray', 0)).toBe('tray');
    expect(resolveWindowCloseAction('tray', 5)).toBe('tray');
    expect(resolveWindowCloseAction('ask', 2)).toBe('prompt');
    expect(resolveWindowCloseAction('ask', 0)).toBe('quit');
    expect(resolveWindowCloseAction('quit', 5)).toBe('quit');
  });
});
