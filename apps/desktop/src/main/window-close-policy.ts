import type { CloseBehavior } from '@icrlogin/shared';

export type WindowCloseAction = 'tray' | 'prompt' | 'quit';

export function resolveWindowCloseAction(closeBehavior: CloseBehavior, runningRuntimeCount: number): WindowCloseAction {
  if (closeBehavior === 'tray') return 'tray';
  if (closeBehavior === 'ask' && runningRuntimeCount > 0) return 'prompt';
  return 'quit';
}

export function shouldPromptBeforeClose(closeBehavior: CloseBehavior, runningRuntimeCount: number): boolean {
  return resolveWindowCloseAction(closeBehavior, runningRuntimeCount) === 'prompt';
}
