import { describe, expect, it } from 'vitest';
import { shouldPromptBeforeClose } from '../src/main/window-close-policy.js';

describe('window close policy', () => {
  it('prompts only in ask mode when managed Chromium is still running', () => {
    expect(shouldPromptBeforeClose('ask', 0)).toBe(false);
    expect(shouldPromptBeforeClose('ask', 1)).toBe(true);
    expect(shouldPromptBeforeClose('ask', 10)).toBe(true);
    expect(shouldPromptBeforeClose('quit', 3)).toBe(false);
  });
});
