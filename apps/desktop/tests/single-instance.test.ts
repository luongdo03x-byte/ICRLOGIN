import { describe, expect, it, vi } from 'vitest';
import { acquireSingleInstance } from '../src/main/single-instance.js';

describe('single instance ownership', () => {
  it('quits the secondary process before bootstrap ownership', () => {
    const quit = vi.fn();
    const app = { requestSingleInstanceLock: () => false, on: vi.fn(), quit };
    expect(acquireSingleInstance(app, () => null)).toBe(false);
    expect(quit).toHaveBeenCalledOnce();
    expect(app.on).not.toHaveBeenCalled();
  });

  it('shows and focuses the existing window when a second instance starts', () => {
    let secondInstance: (() => void) | null = null;
    const app = {
      requestSingleInstanceLock: () => true,
      quit: vi.fn(),
      on: vi.fn((event: string, listener: () => void) => { if (event === 'second-instance') secondInstance = listener; })
    };
    const window = {
      isDestroyed: () => false,
      isMinimized: () => false,
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn()
    };
    expect(acquireSingleInstance(app, () => window)).toBe(true);
    secondInstance?.();
    expect(window.show).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalledOnce();
    expect(app.quit).not.toHaveBeenCalled();
  });
});
