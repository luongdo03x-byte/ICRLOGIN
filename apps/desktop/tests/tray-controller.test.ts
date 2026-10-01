import { describe, expect, it, vi } from 'vitest';
import { bindTray, createTrayMenuTemplate, showAndFocusMainWindow } from '../src/main/tray-controller.js';

describe('tray controller', () => {
  it('restores, shows and focuses an existing main window', () => {
    const window = {
      isDestroyed: () => false,
      isMinimized: () => true,
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn()
    };
    expect(showAndFocusMainWindow(window)).toBe(true);
    expect(window.restore).toHaveBeenCalledOnce();
    expect(window.show).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalledOnce();
    expect(showAndFocusMainWindow(null)).toBe(false);
  });

  it('exposes only show and quit menu actions and double-click shows the window', () => {
    const show = vi.fn();
    const quit = vi.fn();
    const template = createTrayMenuTemplate(show, quit);
    expect(template.map((item) => item.label)).toEqual(['Show ICRLogin', 'Quit ICRLogin']);
    template[0]!.click();
    template[1]!.click();
    expect(show).toHaveBeenCalledOnce();
    expect(quit).toHaveBeenCalledOnce();

    let doubleClick: (() => void) | null = null;
    const tray = {
      setToolTip: vi.fn(),
      setContextMenu: vi.fn(),
      on: vi.fn((_event: string, listener: () => void) => { doubleClick = listener; }),
      destroy: vi.fn()
    };
    const dispose = bindTray(tray, { menu: {}, onShow: show });
    expect(tray.setToolTip).toHaveBeenCalledWith('ICRLogin');
    expect(tray.setContextMenu).toHaveBeenCalledWith({});
    doubleClick?.();
    expect(show).toHaveBeenCalledTimes(2);
    dispose();
    expect(tray.destroy).toHaveBeenCalledOnce();
  });
});
