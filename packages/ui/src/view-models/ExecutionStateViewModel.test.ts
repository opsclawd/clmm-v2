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
    ['partial', 'Partial completion — some steps confirmed', true, false],
    ['abandoned', 'You declined to sign', true, false],
  ] as Array<[string, string, boolean, boolean]>)(
    '%s state: title=%s, isTerminal=%s, showRetry=%s',
    (kind, expectedTitle, isTerminal, showRetry) => {
      const vm = buildExecutionStateViewModel(makeState(kind as ExecutionLifecycleState['kind']), false);
      expect(vm.title).toBe(expectedTitle);
      expect(vm.isTerminal).toBe(isTerminal);
      expect(vm.showRetry).toBe(showRetry);
    },
  );

  it('failed state with retryEligible=true shows retry', () => {
    const vm = buildExecutionStateViewModel(makeState('failed'), true);
    expect(vm.isTerminal).toBe(false);
    expect(vm.showRetry).toBe(true);
    expect(vm.nextAction).toBe('Refresh preview and retry');
  });

  it('failed state with retryEligible=false does NOT show retry', () => {
    const vm = buildExecutionStateViewModel(makeState('failed'), false);
    expect(vm.isTerminal).toBe(false);
    expect(vm.showRetry).toBe(false);
  });

  it('expired state with retryEligible=true shows retry', () => {
    const vm = buildExecutionStateViewModel(makeState('expired'), true);
    expect(vm.isTerminal).toBe(false);
    expect(vm.showRetry).toBe(true);
    expect(vm.nextAction).toBe('Refresh preview');
  });

  it('expired state with retryEligible=false does NOT show retry', () => {
    const vm = buildExecutionStateViewModel(makeState('expired'), false);
    expect(vm.isTerminal).toBe(false);
    expect(vm.showRetry).toBe(false);
  });

  it('partial state NEVER shows retry — explicitly disabled', () => {
    const vm = buildExecutionStateViewModel(makeState('partial'), true);
    expect(vm.showRetry).toBe(false);
    expect(vm.isTerminal).toBe(true);
    expect(vm.partialCompletionWarning).toBeTruthy();
  });

  it('submission ≠ confirmation — submitted state does not say confirmed', () => {
    const vm = buildExecutionStateViewModel(makeState('submitted'), false);
    expect(vm.title.toLowerCase()).not.toContain('confirmed');
  });
});
