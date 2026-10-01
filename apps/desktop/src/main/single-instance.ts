import { showAndFocusMainWindow, type MainWindowPort } from './tray-controller.js';

export interface SingleInstanceAppPort {
  requestSingleInstanceLock(): boolean;
  on(event: 'second-instance', listener: () => void): unknown;
  quit(): void;
}

export function acquireSingleInstance(app: SingleInstanceAppPort, getWindow: () => MainWindowPort | null): boolean {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return false;
  }
  app.on('second-instance', () => {
    showAndFocusMainWindow(getWindow());
  });
  return true;
}
