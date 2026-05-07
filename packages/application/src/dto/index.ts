import type {
  PositionId,
  PoolId,
  BreachDirection,
  PostExitAssetPosture,
  AssetSymbol,
  BreachEpisodeId,
  ClockTimestamp,
} from '@clmm/domain';
import type { ExecutionLifecycleState, PreviewFreshness, TransactionReference } from '@clmm/domain';
import type { ExitTriggerId, BreachDirection as _BreachDirection } from '@clmm/domain';
import type { PlatformCapabilityState } from '../ports/index.js';

// Drift guard: SrLevel and SrLevelsBlock are structurally duplicated in
// packages/adapters/src/outbound/regime-engine/types.ts. Any field change
// here MUST be mirrored there. The duplication is intentional — application
// must not import from adapters (boundaries rule).
export type SrLevel = {
  price: number;
  rank?: string;
  timeframe?: string;
  invalidation?: number;
  notes?: string;
};

export type SrLevelsBlock = {
  briefId: string;
  sourceRecordedAtIso: string | null;
  summary: string | null;
  capturedAtUnixMs: number;
  supports: SrLevel[];
  resistances: SrLevel[];
};

// Position DTOs
export type PositionSummaryDto = {
  positionId: PositionId;
  poolId: PoolId;
  tokenPairLabel: string;
  currentPrice: number;
  currentPriceLabel: string;
  feeRateLabel: string;
  lowerBoundPrice: number;
  upperBoundPrice: number;
  lowerBoundLabel: string;
  upperBoundLabel: string;
  rangeState: 'in-range' | 'below-range' | 'above-range';
  rangeDistance: {
    belowLowerPercent: number;
    aboveUpperPercent: number;
  };
  hasActionableTrigger: boolean;
  monitoringStatus: 'active' | 'degraded' | 'inactive';
};

export type TokenAmountValue = {
  raw: string;
  decimals: number | null;
  symbol: string;
  usdValue: number;
};

export type RewardAmountValue = {
  mint: string;
  amount: string;
  decimals: number | null;
  symbol: string;
  usdValue: number;
};

export type PositionDetailDto = PositionSummaryDto & {
  currentPrice: number;
  sqrtPrice: string;
  unclaimedFees: {
    feeOwedA: TokenAmountValue;
    feeOwedB: TokenAmountValue;
    totalUsd: number;
  };
  unclaimedRewards: {
    rewards: RewardAmountValue[];
    totalUsd: number;
  };
  positionLiquidity: string;
  poolLiquidity: string;
  poolDepthLabel: string;
  triggerId?: ExitTriggerId;
  breachDirection?: BreachDirection;
};

// Preview DTOs
export type PreviewStepDto =
  | { kind: 'remove-liquidity'; estimatedAmount?: { raw: bigint; symbol: AssetSymbol } }
  | { kind: 'collect-fees'; estimatedFees?: { raw: bigint; symbol: AssetSymbol } }
  | {
      kind: 'swap-assets';
      fromAsset: AssetSymbol;
      toAsset: AssetSymbol;
      policyReason: string;
      estimatedOutput?: { raw: bigint; symbol: AssetSymbol };
    };

export type ExecutionPreviewDto = {
  previewId: string;
  positionId: PositionId;
  episodeId?: BreachEpisodeId;
  breachDirection: BreachDirection;
  postExitPosture: PostExitAssetPosture;
  steps: PreviewStepDto[];
  freshness: PreviewFreshness;
  estimatedAt: ClockTimestamp;
  slippageBps?: number;
  routeLabel?: string;
};

// Execution DTOs
export type ExecutionAttemptDto = {
  attemptId: string;
  positionId: PositionId;
  breachDirection: BreachDirection;
  postExitPosture: PostExitAssetPosture;
  lifecycleState: ExecutionLifecycleState;
  completedStepKinds: string[];
  transactionReferences: TransactionReference[];
  retryEligible: boolean;
  retryReason?: string;
};

export type ExecutionApprovalDto = {
  readonly attemptId: string;
  readonly lifecycleState: ExecutionLifecycleState;
  readonly breachDirection: BreachDirection;
};

export type ExecutionSigningPayloadDto = {
  readonly attemptId: string;
  readonly serializedPayload: string;
  readonly payloadVersion: string;
  readonly lifecycleState: ExecutionLifecycleState;
  readonly signingExpiresAt?: ClockTimestamp;
};

export type PreparedPayloadDto = {
  unsignedPayloadBase64: string;
  payloadVersion: string;
  expiresAt: number;
  requiresSignature: true;
};

// Alert DTOs
export type ActionableAlertDto = {
  triggerId: ExitTriggerId;
  positionId: PositionId;
  breachDirection: BreachDirection;
  triggeredAt: ClockTimestamp;
  previewId?: string;
};

// History DTOs
export type HistoryEventDto = {
  eventId: string;
  positionId: PositionId;
  eventType: string;
  breachDirection: BreachDirection;
  occurredAt: ClockTimestamp;
  transactionReference?: TransactionReference;
  // label makes it clear this is NOT on-chain proof
  note: 'off-chain operational history — not an on-chain receipt or attestation';
};

// Capability DTOs
export type MonitoringReadinessDto = {
  notificationPermission: 'granted' | 'denied' | 'undetermined';
  platformCapabilities: PlatformCapabilityState;
  monitoringActive: boolean;
};

// Entry context DTOs (deep link / resume)
export type EntryContextDto =
  | { kind: 'trigger-preview'; positionId: PositionId; triggerId: ExitTriggerId }
  | { kind: 'execution-result'; attemptId: string }
  | { kind: 'history'; positionId: PositionId }
  | { kind: 'degraded-recovery'; reason: string };

// --- Insight DTOs (SOL/USDC v1) ---
//
// Consumed by the external clmm-autopilot-pipeline. The pair/source literals
// are intentional: this is an opinionated, single-pool read API. Adding more
// pools requires explicit DTO and allowlist work — there is no generic
// multi-pool registry in v1. See spec at
// docs/superpowers/specs/2026-05-01-sol-usdc-insights-data-api-design.md.

export type InsightDataWarning = {
  code:
    | 'sr_levels_unavailable'
    | 'actionable_triggers_unavailable'
    | 'fee_reward_usd_unavailable'
    | 'price_distance_unavailable';
  message: string;
  scope?: {
    poolId?: string;
    positionId?: string;
  };
};

export type InsightDataQualityDto = {
  partial: boolean;
  warnings: InsightDataWarning[];
};

// Opinionated, single-pool read API — see docs for the v1 design constraint.
// Fields typed as `string` that originate from bigint values (sqrtPrice,
// poolLiquidity, positionLiquidity, feeOwedA/B.raw, rewardAmount.raw)
// are decimal-string representations of on-chain 64-bit integers.
// Consumers MUST parse them as BigInt or BigNumber, NOT Number, to avoid
// IEEE 754 precision loss beyond 2^53.
export type SolUsdcPoolSnapshotDto = {
  poolId: string;
  pair: 'SOL/USDC';
  source: 'orca';
  observedAtUnixMs: number;
  tokenPairLabel: string;
  currentPrice: number;
  currentPriceLabel: string;
  sqrtPrice: string;
  tickCurrentIndex: number;
  tickSpacing: number;
  feeRate: number;
  feeRateLabel: string;
  poolLiquidity: string;
  priceSource: 'orca_whirlpool_sqrt_price';
};

export type SolUsdcFeeAmountDto = {
  raw: string;
  decimals: number | null;
  symbol: string;
  mint: string;
};

export type SolUsdcRewardAmountDto = {
  mint: string;
  raw: string;
  decimals: number | null;
  symbol: string;
};

export type ExternalBreachDirection = 'lower-bound-breach' | 'upper-bound-breach';

// Compile-time drift guard: ExternalBreachDirection must match the kind values
// of BreachDirection from @clmm/domain. If this type errors, the external API
// contract has drifted from the domain invariant — update ExternalBreachDirection
// and the toExternalBreachDirection conversion function.
type _AssertBreachDirectionMatch = _BreachDirection['kind'] extends ExternalBreachDirection
  ? ExternalBreachDirection extends _BreachDirection['kind']
    ? true
    : never
  : never;

export type SolUsdcPositionInsightDto = {
  walletId: string;
  positionId: string;
  poolId: string;
  pair: 'SOL/USDC';
  source: 'orca';
  observedAtUnixMs: number;
  rangeState: 'in-range' | 'below-range' | 'above-range';
  lowerTick: number;
  upperTick: number;
  currentTick: number;
  lowerPriceLabel: string;
  upperPriceLabel: string;
  currentPrice: number;
  currentPriceLabel: string;
  rangeDistance: {
    belowLowerTickPercent: number;
    aboveUpperTickPercent: number;
    belowLowerPricePercent?: number;
    aboveUpperPricePercent?: number;
  };
  feeRateLabel: string;
  unclaimedFees: {
    feeOwedA: SolUsdcFeeAmountDto;
    feeOwedB: SolUsdcFeeAmountDto;
  };
  unclaimedRewards: SolUsdcRewardAmountDto[];
  // null distinguishes "valuation unavailable" from a real zero. See spec
  // §"USD Valuation Flow" — do not collapse to 0.
  unclaimedFeesUsd: number | null;
  unclaimedRewardsUsd: number | null;
  positionLiquidity: string;
  poolLiquidity: string;
  hasActionableTrigger: boolean;
  triggerId?: string;
  breachDirection?: ExternalBreachDirection;
};

export type SolUsdcPositionSnapshotDto = {
  walletId: string;
  positions: SolUsdcPositionInsightDto[];
  dataQuality: InsightDataQualityDto;
};

export type SolUsdcInsightInputBundleDto = {
  pair: 'SOL/USDC';
  source: 'orca';
  observedAtUnixMs: number;
  pool: SolUsdcPoolSnapshotDto;
  // S/R lives once at the bundle top level, never copied per position.
  srLevels: SrLevelsBlock | null;
  positions: SolUsdcPositionInsightDto[];
  alerts: Array<{
    triggerId: string;
    positionId: string;
    breachDirection: ExternalBreachDirection;
    triggeredAt: number;
  }>;
  dataQuality: InsightDataQualityDto;
};

export type SolUsdcInsightErrorDto = {
  code: 'pool_snapshot_unavailable' | 'position_list_unavailable' | 'position_detail_unavailable';
  message: string;
  pair: 'SOL/USDC';
  poolId: string;
  walletId?: string;
  positionId?: string;
  retryable: true;
};

export type {
  RegimeReasonSeverity,
  RegimeReason,
  RegimeFreshness,
  RegimeClmmSuitability,
  RegimeMetadata,
  RegimeBlock,
} from './regime.js';

export type { SrThesisDto, SrThesesBlock } from './srTheses.js';

export type {
  PolicyInsightBlock,
  PolicyInsightClmmPolicy,
  PolicyInsightLevels,
  PolicyInsightFreshness,
  PolicyInsightRecommendedAction,
  PolicyInsightConfidence,
  PolicyInsightRiskLevel,
  PolicyInsightDataQuality,
  PolicyInsightStatus,
} from './policyInsights.js';
