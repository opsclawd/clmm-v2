import type { ExecutionPreviewDto } from '@clmm/application/public';
import { renderDirectionalPolicyText } from '../components/DirectionalPolicyCardUtils.js';

export type PreviewViewModel = {
  previewId: string;
  swapLabel: string;
  postureLabel: string;
  directionLabel: string;
  isFresh: boolean;
  isStale: boolean;
  isExpired: boolean;
  requiresRefresh: boolean;
  canSign: boolean;
  freshnessLabel: string;
  steps: Array<{ label: string; sublabel?: string }>;
};

export function buildPreviewViewModel(dto: ExecutionPreviewDto): PreviewViewModel {
  const policy = renderDirectionalPolicyText(dto.breachDirection);
  const isFresh = dto.freshness.kind === 'fresh';
  const isStale = dto.freshness.kind === 'stale';
  const isExpired = dto.freshness.kind === 'expired';

  return {
    previewId: dto.previewId,
    swapLabel: policy.swapLabel,
    postureLabel: policy.postureLabel,
    directionLabel: policy.directionLabel,
    isFresh,
    isStale,
    isExpired,
    requiresRefresh: isStale || isExpired,
    canSign: isFresh,
    freshnessLabel: isFresh ? 'Quote is fresh' : isStale ? 'Quote is stale — refresh before signing' : 'Quote expired — must refresh',
    steps: dto.steps.map((step) => {
      if (step.kind === 'remove-liquidity') return { label: 'Remove Liquidity' };
      if (step.kind === 'collect-fees') return { label: 'Collect Fees' };
      return { label: `Swap: ${step.fromAsset} → ${step.toAsset}`, sublabel: step.policyReason };
    }),
  };
}
