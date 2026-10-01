import type { CloseBehavior } from '@icrlogin/shared';

export function shouldPromptBeforeClose(closeBehavior: CloseBehavior, runningRuntimeCount: number): boolean {
  return closeBehavior === 'ask' && runningRuntimeCount > 0;
}
