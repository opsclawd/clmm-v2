import { describe, it, expect } from 'vitest';
import { buildExecutionStateViewModel } from './ExecutionStateViewModel.js';
import type { ExecutionLifecycleState } from '@clmm/domain';

function makeState(kind: ExecutionLifecycleState['kind']): ExecutionLifecycleState {
  return { kind } as ExecutionLifecycleState;
}

describe('ExecutionStateViewModel', () => {
  it.each([
    ['confirmed', 'Transaction confirmed', true, false],
    ['submitted', 'Submitted — awaiting confirmation', false, false],
    ['failed', 'Transaction failed', false, true],
    ['partial', 'Partial completion — some steps confirmed', false, false],
    ['abandoned', 'You declined to sign', false, false],
    ['expired', 'Preview expired', false, true],
  ] as Array<[string, string, boolean, boolean]>)(
    '%s state: title=%s, isTerminal=%s, showRetry=%s',
    (kind, expectedTitle, isTerminal, showRetry) => {
      const vm = buildExecutionStateViewModel(makeState(kind as ExecutionLifecycleState['kind']), false);
      expect(vm.title).toBe(expectedTitle);
      expect(vm.isTerminal).toBe(isTerminal);
      expect(vm.showRetry).toBe(showRetry);
    },
  );

  it('partial state NEVER shows retry — explicitly disabled', () => {
    const vm = buildExecutionStateViewModel(makeState('partial'), false);
    expect(vm.showRetry).toBe(false);
    expect(vm.partialCompletionWarning).toBeTruthy();
  });

  it('submission ≠ confirmation — submitted state does not say confirmed', () => {
    const vm = buildExecutionStateViewModel(makeState('submitted'), false);
    expect(vm.title.toLowerCase()).not.toContain('confirmed');
  });
});
