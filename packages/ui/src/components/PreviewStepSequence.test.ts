import { describe, it, expect } from 'vitest';
import { buildPreviewStepLabels } from './PreviewStepSequenceUtils.js';
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH } from '@clmm/application/public';

describe('PreviewStepSequence', () => {
  it('downside preview step order: remove liq → fees → SOL→USDC → USDC posture', () => {
    const steps = buildPreviewStepLabels(LOWER_BOUND_BREACH);
    expect(steps[0]?.label).toContain('Remove Liquidity');
    expect(steps[1]?.label).toContain('Collect Fees');
    expect(steps[2]?.label).toContain('SOL → USDC');
    expect(steps[3]?.label).toContain('USDC');
  });

  it('upside preview step order: remove liq → fees → USDC→SOL → SOL posture', () => {
    const steps = buildPreviewStepLabels(UPPER_BOUND_BREACH);
    expect(steps[2]?.label).toContain('USDC → SOL');
    expect(steps[3]?.label).toContain('SOL');
  });

  it('always has exactly 4 steps', () => {
    expect(buildPreviewStepLabels(LOWER_BOUND_BREACH)).toHaveLength(4);
    expect(buildPreviewStepLabels(UPPER_BOUND_BREACH)).toHaveLength(4);
  });
});