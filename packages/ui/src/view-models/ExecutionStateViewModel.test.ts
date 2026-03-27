import { describe, it, expect } from 'vitest';
import { buildExecutionStateViewModel } from './ExecutionStateViewModel.js';

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
      const vm = buildExecutionStateViewModel({ kind } as any, false);
      expect(vm.title).toBe(expectedTitle);
      expect(vm.isTerminal).toBe(isTerminal);
      expect(vm.showRetry).toBe(showRetry);
    },
  );

  it('partial state NEVER shows retry — explicitly disabled', () => {
    const vm = buildExecutionStateViewModel({ kind: 'partial' } as any, false);
    expect(vm.showRetry).toBe(false);
    expect(vm.partialCompletionWarning).toBeTruthy();
  });

  it('submission ≠ confirmation — submitted state does not say confirmed', () => {
    const vm = buildExecutionStateViewModel({ kind: 'submitted' } as any, false);
    expect(vm.title.toLowerCase()).not.toContain('confirmed');
  });
});
