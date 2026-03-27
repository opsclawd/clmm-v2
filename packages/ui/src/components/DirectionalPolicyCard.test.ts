import { describe, it, expect } from 'vitest';
import { renderDirectionalPolicyText } from './DirectionalPolicyCard.js';
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH } from '@clmm/domain';

describe('DirectionalPolicyCard', () => {
  it('lower-bound breach shows SOL → USDC', () => {
    const text = renderDirectionalPolicyText(LOWER_BOUND_BREACH);
    expect(text.swapLabel).toBe('SOL → USDC');
    expect(text.postureLabel).toBe('Exit to USDC');
  });

  it('upper-bound breach shows USDC → SOL', () => {
    const text = renderDirectionalPolicyText(UPPER_BOUND_BREACH);
    expect(text.swapLabel).toBe('USDC → SOL');
    expect(text.postureLabel).toBe('Exit to SOL');
  });

  it('lower and upper produce different labels — never identical', () => {
    const lower = renderDirectionalPolicyText(LOWER_BOUND_BREACH);
    const upper = renderDirectionalPolicyText(UPPER_BOUND_BREACH);
    expect(lower.swapLabel).not.toBe(upper.swapLabel);
    expect(lower.postureLabel).not.toBe(upper.postureLabel);
  });
});