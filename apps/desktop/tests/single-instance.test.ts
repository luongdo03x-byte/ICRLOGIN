import { describe, expect, it, vi } from 'vitest';
import { acquireSingleInstance } from '../src/main/single-instance.js';

describe('single instance ownership', () => {
  it('quits the secondary process before bootstrap ownership', () => {
    const quit = vi.fn();
    const coordinator = { requestLock: () => false, registerSecondInstance: vi.fn(), quit };
    expect(acquireSingleInstance(coordinator, () => null)).toBe(false);
    expect(quit).toHaveBeenCalledOnce();
    expect(coordinator.registerSecondInstance).not.toHaveBeenCalled();
  });

  it('shows and focuses the existing window when a second instance starts', () => {
    let secondInstance: (() => void) | null = null;
    const coordinator = {
      requestLock: () => true,
      quit: vi.fn(),
      registerSecondInstance: vi.fn((listener: () => void) => { secondInstance = listener; })
    };
    const window = {
      isDestroyed: () => false,
      isMinimized: () => false,
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn()
    };
    expect(acquireSingleInstance(coordinator, () => window)).toBe(true);
    secondInstance?.();
    expect(window.show).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalledOnce();
    expect(coordinator.quit).not.toHaveBeenCalled();
  });
});
