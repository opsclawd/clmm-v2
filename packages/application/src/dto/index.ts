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
import type { ExitTriggerId } from '@clmm/domain';
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
  lowerBound: number;
  upperBound: number;
  lowerBoundLabel: string;
  upperBoundLabel: string;
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
  srLevels?: SrLevelsBlock;
};

// Preview DTOs
export type PreviewStepDto =
  | { kind: 'remove-liquidity'; estimatedAmount?: { raw: bigint; symbol: AssetSymbol } }
  | { kind: 'collect-fees'; estimatedFees?: { raw: bigint; symbol: AssetSymbol } }
  | { kind: 'swap-assets'; fromAsset: AssetSymbol; toAsset: AssetSymbol; policyReason: string; estimatedOutput?: { raw: bigint; symbol: AssetSymbol } };

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
