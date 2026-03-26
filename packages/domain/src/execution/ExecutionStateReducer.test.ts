import { describe, it, expect } from 'vitest';
import { applyLifecycleTransition } from './ExecutionStateReducer.js';
import type { ExecutionLifecycleState } from './index.js';

type StateKind = ExecutionLifecycleState['kind'];

function state(kind: StateKind): ExecutionLifecycleState {
  return { kind } as ExecutionLifecycleState;
}

describe('ExecutionStateReducer — valid transitions', () => {
  it('previewed → awaiting-signature', () => {
    const result = applyLifecycleTransition(state('previewed'), 'request-signature');
    expect(result.kind).toBe('awaiting-signature');
  });

  it('awaiting-signature → submitted', () => {
    const result = applyLifecycleTransition(state('awaiting-signature'), 'submit');
    expect(result.kind).toBe('submitted');
  });

  it('awaiting-signature → abandoned (decline)', () => {
    const result = applyLifecycleTransition(state('awaiting-signature'), 'decline');
    expect(result.kind).toBe('abandoned');
  });

  it('awaiting-signature → expired', () => {
    const result = applyLifecycleTransition(state('awaiting-signature'), 'expire');
    expect(result.kind).toBe('expired');
  });

  it('submitted → confirmed', () => {
    const result = applyLifecycleTransition(state('submitted'), 'confirm');
    expect(result.kind).toBe('confirmed');
  });

  it('submitted → failed', () => {
    const result = applyLifecycleTransition(state('submitted'), 'fail');
    expect(result.kind).toBe('failed');
  });

  it('submitted → partial', () => {
    const result = applyLifecycleTransition(state('submitted'), 'partial-completion');
    expect(result.kind).toBe('partial');
  });

  it('failed → previewed (retry, no chain step confirmed)', () => {
    const result = applyLifecycleTransition(state('failed'), 'reset-to-preview');
    expect(result.kind).toBe('previewed');
  });

  it('expired → previewed (retry, no chain step confirmed)', () => {
    const result = applyLifecycleTransition(state('expired'), 'reset-to-preview');
    expect(result.kind).toBe('previewed');
  });
});

describe('ExecutionStateReducer — forbidden transitions', () => {
  it.each([
    ['partial', 'reset-to-preview'],
    ['partial', 'submit'],
    ['confirmed', 'submit'],
    ['confirmed', 'reset-to-preview'],
    ['abandoned', 'submit'],
    ['abandoned', 'reset-to-preview'],
  ] as Array<[StateKind, string]>)(
    'FORBIDDEN: %s → cannot apply %s',
    (fromKind, event) => {
      expect(() =>
        applyLifecycleTransition(state(fromKind), event as 'request-signature' | 'submit' | 'decline' | 'expire' | 'confirm' | 'fail' | 'partial-completion' | 'reset-to-preview'),
      ).toThrow();
    },
  );
});
