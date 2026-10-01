import { showAndFocusMainWindow, type MainWindowPort } from './tray-controller.js';

export interface SingleInstanceCoordinator {
  requestLock(): boolean;
  registerSecondInstance(listener: () => void): void;
  quit(): void;
}

export function acquireSingleInstance(coordinator: SingleInstanceCoordinator, getWindow: () => MainWindowPort | null): boolean {
  if (!coordinator.requestLock()) {
    coordinator.quit();
    return false;
  }
  coordinator.registerSecondInstance(() => {
    showAndFocusMainWindow(getWindow());
  });
  return true;
}
