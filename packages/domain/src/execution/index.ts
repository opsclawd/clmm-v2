import type { AssetSymbol, PostExitAssetPosture, TokenAmount } from '../shared/index.js';

export type SwapInstruction = {
  readonly fromAsset: AssetSymbol;
  readonly toAsset: AssetSymbol;
  readonly policyReason: string;
  readonly amountBasis?: TokenAmount;
};

export type ExecutionStep =
  | { readonly kind: 'remove-liquidity' }
  | { readonly kind: 'collect-fees' }
  | { readonly kind: 'swap-assets'; readonly instruction: SwapInstruction };

export type ExecutionLifecycleState =
  | { readonly kind: 'previewed' }
  | { readonly kind: 'awaiting-signature' }
  | { readonly kind: 'submitted' }
  | { readonly kind: 'confirmed' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'expired' }
  | { readonly kind: 'abandoned' }
  | { readonly kind: 'partial' };

export type PreviewFreshness =
  | { readonly kind: 'fresh'; readonly expiresAt: number }
  | { readonly kind: 'stale' }
  | { readonly kind: 'expired' };

export type TransactionReference = {
  readonly signature: string;
  readonly stepKind: ExecutionStep['kind'];
};

export type RetryEligibility =
  | { readonly kind: 'eligible'; readonly reason: string }
  | { readonly kind: 'ineligible'; readonly reason: string };

export type ExecutionPlan = {
  readonly steps: readonly ExecutionStep[];
  readonly postExitPosture: PostExitAssetPosture;
  readonly swapInstruction: SwapInstruction;
};

export type ExecutionPreview = {
  readonly plan: ExecutionPlan;
  readonly freshness: PreviewFreshness;
  readonly estimatedAt: number;
};

export type ExecutionAttempt = {
  readonly lifecycleState: ExecutionLifecycleState;
  readonly completedSteps: ReadonlyArray<ExecutionStep['kind']>;
  readonly transactionReferences: readonly TransactionReference[];
};
