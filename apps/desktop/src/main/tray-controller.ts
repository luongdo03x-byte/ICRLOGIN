export interface MainWindowPort {
  isDestroyed(): boolean;
  isMinimized(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
}

export interface TrayPort {
  setToolTip(value: string): void;
  setContextMenu(menu: unknown): void;
  on(event: 'double-click', listener: () => void): unknown;
  destroy(): void;
}

export interface TrayMenuItem {
  label: string;
  click(): void;
}

export function showAndFocusMainWindow(window: MainWindowPort | null): boolean {
  if (!window || window.isDestroyed()) return false;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  return true;
}

export function createTrayMenuTemplate(onShow: () => void, onQuit: () => void): TrayMenuItem[] {
  return [
    { label: 'Show ICRLogin', click: onShow },
    { label: 'Quit ICRLogin', click: onQuit }
  ];
}

export function bindTray(tray: TrayPort, options: { menu: unknown; onShow: () => void }): () => void {
  tray.setToolTip('ICRLogin');
  tray.setContextMenu(options.menu);
  tray.on('double-click', options.onShow);
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    tray.destroy();
  };
}
