import { describe, it, expect } from 'vitest';
import { buildPreviewViewModel } from './PreviewViewModel.js';
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH, makeClockTimestamp } from '@clmm/domain';
import type { ExecutionPreviewDto } from '@clmm/application/public';

function makePreviewDto(direction = LOWER_BOUND_BREACH): ExecutionPreviewDto {
  return {
    previewId: 'preview-1',
    positionId: 'pos-1' as any,
    breachDirection: direction,
    postExitPosture: direction.kind === 'lower-bound-breach'
      ? { kind: 'exit-to-usdc' }
      : { kind: 'exit-to-sol' },
    steps: [
      { kind: 'remove-liquidity' },
      { kind: 'collect-fees' },
      {
        kind: 'swap-assets',
        fromAsset: direction.kind === 'lower-bound-breach' ? 'SOL' : 'USDC',
        toAsset: direction.kind === 'lower-bound-breach' ? 'USDC' : 'SOL',
        policyReason: 'test',
      },
    ],
    freshness: { kind: 'fresh', expiresAt: Date.now() + 60_000 },
    estimatedAt: makeClockTimestamp(Date.now()),
  };
}

describe('PreviewViewModel', () => {
  it('downside preview: swapLabel is SOL → USDC', () => {
    const vm = buildPreviewViewModel(makePreviewDto(LOWER_BOUND_BREACH));
    expect(vm.swapLabel).toBe('SOL → USDC');
    expect(vm.postureLabel).toBe('Exit to USDC');
    expect(vm.isFresh).toBe(true);
    expect(vm.requiresRefresh).toBe(false);
  });

  it('upside preview: swapLabel is USDC → SOL', () => {
    const vm = buildPreviewViewModel(makePreviewDto(UPPER_BOUND_BREACH));
    expect(vm.swapLabel).toBe('USDC → SOL');
    expect(vm.postureLabel).toBe('Exit to SOL');
  });

  it('stale preview: requiresRefresh is true', () => {
    const dto = { ...makePreviewDto(), freshness: { kind: 'stale' as const } };
    const vm = buildPreviewViewModel(dto);
    expect(vm.requiresRefresh).toBe(true);
  });

  it('expired preview: requiresRefresh is true, canSign is false', () => {
    const dto = { ...makePreviewDto(), freshness: { kind: 'expired' as const } };
    const vm = buildPreviewViewModel(dto);
    expect(vm.requiresRefresh).toBe(true);
    expect(vm.canSign).toBe(false);
  });
});
