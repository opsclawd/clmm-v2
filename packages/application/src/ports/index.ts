import type {
  PositionId,
  WalletId,
  PoolId,
  BreachDirection,
  ClockTimestamp,
  TokenAmount,
} from '@clmm/domain';
import type { LiquidityPosition, PositionDetail, PoolData, PriceQuote } from '@clmm/domain';
import type { ExitTrigger, BreachEpisodeId, ExitTriggerId } from '@clmm/domain';
import type {
  ExecutionPlan,
  ExecutionPreview,
  ExecutionAttempt,
  ExecutionLifecycleState,
  TransactionReference,
  SwapInstruction,
  ExecutionStep,
} from '@clmm/domain';
import type { HistoryEvent, HistoryTimeline, ExecutionOutcomeSummary } from '@clmm/domain';
import type {
  SrLevelsBlock,
  RegimeBlock,
  SrThesesBlock,
  PolicyInsightBlock,
} from '../dto/index.js';
import type { PositionPlan, PlanAction, RegimeResponse } from '@clmm/domain';

// --- Position read ports ---

export interface SupportedPositionReadPort {
  listSupportedPositions(walletId: WalletId): Promise<LiquidityPosition[]>;
  getPosition(walletId: WalletId, positionId: PositionId): Promise<LiquidityPosition | null>;
  getPositionDetail(walletId: WalletId, positionId: PositionId): Promise<PositionDetail | null>;
  getPoolData(poolId: PoolId): Promise<PoolData | null>;
}

// --- Price ports ---

export interface PricePort {
  getPrices(tokenMints: readonly string[]): Promise<readonly PriceQuote[]>;
}

export interface RangeObservationPort {
  observeRangeState(positionId: PositionId): Promise<{
    positionId: PositionId;
    currentPrice: number;
    observedAt: ClockTimestamp;
  }>;
}

// --- Swap + execution ports ---

export interface SwapQuotePort {
  getQuote(instruction: SwapInstruction): Promise<{
    estimatedOutputAmount: TokenAmount;
    priceImpactPercent: number;
    routeLabel: string;
    quotedAt: ClockTimestamp;
  }>;
}

export interface ExecutionPreparationPort {
  prepareExecution(params: {
    plan: ExecutionPlan;
    walletId: WalletId;
    positionId: PositionId;
  }): Promise<{
    serializedPayload: Uint8Array;
    preparedAt: ClockTimestamp;
  }>;
}

export interface ExecutionSubmissionPort {
  submitExecution(
    signedPayload: Uint8Array,
    plannedStepKinds: ReadonlyArray<ExecutionStep['kind']>,
  ): Promise<{
    references: TransactionReference[];
    submittedAt: ClockTimestamp;
  }>;
  reconcileExecution(references: TransactionReference[]): Promise<{
    confirmedSteps: Array<ExecutionPlan['steps'][number]['kind']>;
    finalState: ExecutionLifecycleState | null;
  }>;
}

// --- Wallet signing port ---

export interface WalletSigningPort {
  requestSignature(
    serializedPayload: Uint8Array,
    walletId: WalletId,
  ): Promise<
    { kind: 'signed'; signedPayload: Uint8Array } | { kind: 'declined' } | { kind: 'interrupted' }
  >;
}

// --- Notification + capability ports ---

export interface NotificationPort {
  sendActionableAlert(params: {
    walletId: WalletId;
    positionId: PositionId;
    breachDirection: BreachDirection;
    triggerId: ExitTriggerId;
  }): Promise<{ deliveredAt: ClockTimestamp | null }>;
}

export interface NotificationDedupPort {
  hasDispatched(triggerId: string): Promise<boolean>;
  markDispatched(triggerId: string): Promise<void>;
}

export type PlatformCapabilityState = {
  nativePushAvailable: boolean;
  browserNotificationAvailable: boolean;
  nativeWalletAvailable: boolean;
  browserWalletAvailable: boolean;
  isMobileWeb: boolean;
};

export interface PlatformCapabilityPort {
  getCapabilities(): Promise<PlatformCapabilityState>;
}

export interface NotificationPermissionPort {
  getPermissionState(): Promise<'granted' | 'denied' | 'undetermined'>;
  requestPermission(): Promise<'granted' | 'denied'>;
}

export type DeepLinkMetadata = {
  kind: 'trigger' | 'preview' | 'history' | 'unknown';
  positionId?: PositionId;
  triggerId?: ExitTriggerId;
};

export interface DeepLinkEntryPort {
  parseDeepLink(url: string): DeepLinkMetadata;
}

// --- Storage repositories ---

export interface TriggerRepository {
  getTrigger(triggerId: ExitTriggerId): Promise<ExitTrigger | null>;
  listActionableTriggers(walletId: WalletId): Promise<ExitTrigger[]>;
  deleteTrigger(triggerId: ExitTriggerId): Promise<void>;
}

export type StoredExecutionAttempt = ExecutionAttempt & {
  attemptId: string;
  positionId: PositionId;
  breachDirection: BreachDirection;
  episodeId?: BreachEpisodeId;
  previewId?: string;
};

export interface ExecutionRepository {
  savePreview(
    positionId: PositionId,
    preview: ExecutionPreview,
    breachDirection: BreachDirection,
  ): Promise<{ previewId: string }>;
  getPreview(previewId: string): Promise<{
    preview: ExecutionPreview;
    positionId: PositionId;
    breachDirection: BreachDirection;
  } | null>;
  saveAttempt(attempt: StoredExecutionAttempt): Promise<void>;
  getAttempt(attemptId: string): Promise<StoredExecutionAttempt | null>;
  savePreparedPayload(params: {
    payloadId: string;
    attemptId: string;
    unsignedPayload: Uint8Array;
    payloadVersion: string;
    expiresAt: ClockTimestamp;
    createdAt: ClockTimestamp;
  }): Promise<void>;
  getPreparedPayload(attemptId: string): Promise<{
    payloadVersion: string;
    unsignedPayload: Uint8Array;
    expiresAt: ClockTimestamp;
  } | null>;
  listAwaitingSignatureAttemptsByEpisode(
    episodeId: BreachEpisodeId,
  ): Promise<StoredExecutionAttempt[]>;
  listSubmittedAttempts(): Promise<StoredExecutionAttempt[]>;
  updateAttemptState(attemptId: string, state: ExecutionLifecycleState): Promise<void>;
}

export type {
  EpisodeTransition,
  FinalizationResult,
  BreachEpisodeRepository,
} from './BreachEpisodeRepository.js';

export interface ExecutionSessionRepository {
  saveSession(params: {
    sessionId: string;
    attemptId: string;
    walletId: WalletId;
    positionId: PositionId;
    createdAt: ClockTimestamp;
  }): Promise<void>;
  getSession(sessionId: string): Promise<{
    attemptId: string;
    walletId: WalletId;
    positionId: PositionId;
  } | null>;
  deleteSession(sessionId: string): Promise<void>;
}

export interface ExecutionHistoryRepository {
  appendEvent(event: HistoryEvent): Promise<void>;
  recordWalletPositionOwnership(
    walletId: WalletId,
    positionId: PositionId,
    observedAt: number,
  ): Promise<void>;
  getWalletHistory(walletId: WalletId): Promise<readonly HistoryEvent[]>;
  getTimeline(positionId: PositionId): Promise<HistoryTimeline>;
  getOutcomeSummary(positionId: PositionId): Promise<ExecutionOutcomeSummary | null>;
}

export interface MonitoredWalletRepository {
  enroll(walletId: WalletId, enrolledAt: ClockTimestamp): Promise<void>;
  unenroll(walletId: WalletId): Promise<void>;
  listActiveWallets(): Promise<Array<{ walletId: WalletId; lastScannedAt: ClockTimestamp | null }>>;
  markScanned(walletId: WalletId, scannedAt: ClockTimestamp): Promise<void>;
}

// --- Job ports ---

export interface ReconciliationJobPort {
  enqueue(attemptId: string): Promise<void>;
}

// --- Cross-cutting ports ---

export type DetectionTimingRecord = {
  readonly positionId: string;
  readonly detectedAt: number;
  readonly observedAt: number;
  readonly durationMs: number;
};

export type DeliveryTimingRecord = {
  readonly triggerId: string;
  readonly dispatchedAt: number;
  readonly deliveredAt: number | null;
  readonly durationMs: number;
  readonly channel: 'push' | 'web-push' | 'in-app';
};

export interface ObservabilityPort {
  log(level: 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>): void;
  recordTiming(event: string, durationMs: number, tags?: Record<string, string>): void;
  recordDetectionTiming(record: DetectionTimingRecord): void;
  recordDeliveryTiming(record: DeliveryTimingRecord): void;
}

export interface ClockPort {
  now(): ClockTimestamp;
}

export interface IdGeneratorPort {
  generateId(): string;
}

// --- S/R levels read port (application-owned; CurrentSrLevelsAdapter implements) ---

export interface SrLevelsReadPort {
  fetchCurrent(symbol: string, source: string): Promise<SrLevelsBlock | null>;
}

// --- V2 S/R theses read port (application-owned; CurrentSrThesesAdapter implements) ---
//
// Like RegimeReadResult, this is a discriminated union so the BFF controller
// can map directly to documented `unavailableReason` codes. Adapters MUST
// return one of these kinds for expected upstream conditions instead of
// throwing.

export type SrThesesReadResult =
  | { kind: 'block'; block: SrThesesBlock }
  | { kind: 'not-found' }
  | { kind: 'config-error' }
  | { kind: 'upstream-error' };

export interface SrThesesReadPort {
  fetchCurrent(symbol: string, source: string): Promise<SrThesesReadResult>;
}

// --- Regime read port (application-owned; CurrentRegimeAdapter implements) ---
//
// Returned outcome is a discriminated union so the BFF controller can map
// directly to the documented `unavailableReason` codes without parsing
// adapter logs or HTTP details. Production code paths must never throw
// for expected upstream unavailability.

export type RegimeReadResult =
  | { kind: 'block'; block: RegimeBlock }
  | { kind: 'not-found' }
  | { kind: 'config-error' }
  | { kind: 'upstream-error' };

export interface RegimeReadPort {
  fetchCurrent(params: {
    symbol: string;
    source: string;
    network: string;
    poolAddress: string;
    timeframe: string;
  }): Promise<RegimeReadResult>;
}

// --- PolicyInsights read port (application-owned; CurrentPolicyInsightsAdapter implements) ---
//
// Returned outcome is a discriminated union so the BFF controller can map
// directly to the documented `unavailableReason` codes without parsing
// adapter logs or HTTP details. Production code paths must never throw
// for expected upstream unavailability. `store-unavailable` is distinct
// from `upstream-error` because PolicyInsights upstream documents 503 as
// a known availability state — the BFF surfaces it separately so UI copy
// can stay accurate.

export type PolicyInsightsReadResult =
  | { kind: 'block'; block: PolicyInsightBlock }
  | { kind: 'not-found' }
  | { kind: 'store-unavailable' }
  | { kind: 'config-error' }
  | { kind: 'malformed' }
  | { kind: 'upstream-error' };

export interface PolicyInsightsReadPort {
  fetchCurrent(): Promise<PolicyInsightsReadResult>;
}

// --- Wallet ownership challenge port ---

export type WalletChallengeRow = {
  walletId: WalletId;
  nonce: string;
  expiresAt: ClockTimestamp;
  issuedAt: ClockTimestamp;
};

export type ConsumeAndEnrollResult =
  | { kind: 'consumed' }
  | { kind: 'not_found' }
  | { kind: 'expired' }
  | { kind: 'mismatch' };

export interface WalletChallengeRepository {
  issue(params: {
    walletId: WalletId;
    nonce: string;
    expiresAt: ClockTimestamp;
    issuedAt: ClockTimestamp;
    now: ClockTimestamp;
  }): Promise<WalletChallengeRow>;

  get(walletId: WalletId): Promise<WalletChallengeRow | null>;

  consumeAndEnrollIfMatches(params: {
    walletId: WalletId;
    nonce: string;
    now: ClockTimestamp;
    enrolledAt: ClockTimestamp;
  }): Promise<ConsumeAndEnrollResult>;
}

// --- Wallet enrollment API port ---

export type EnrollmentErrorCode =
  | 'WALLET_MALFORMED'
  | 'CHALLENGE_NOT_FOUND'
  | 'CHALLENGE_EXPIRED'
  | 'CHALLENGE_MISMATCH'
  | 'SIGNATURE_INVALID'
  | 'ENROLLMENT_UPGRADE_REQUIRED'
  | 'BAD_REQUEST'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR';

export type ChallengeDetails = {
  walletId: string;
  nonce: string;
  expiresAt: number;
  message: string;
};

export type ChallengeRequestResult =
  | { kind: 'ok'; challenge: ChallengeDetails }
  | { kind: 'error'; code: EnrollmentErrorCode };

export type EnrollWithCredentialsResult =
  | { kind: 'ok'; enrolledAt: number }
  | { kind: 'error'; code: EnrollmentErrorCode };

export interface WalletEnrollmentApiPort {
  requestChallenge(walletId: string): Promise<ChallengeRequestResult>;
  enrollWithCredentials(
    walletId: string,
    credentials: { nonce: string; message: string; signature: string },
  ): Promise<EnrollWithCredentialsResult>;
}

// --- Wallet message signing port ---

export type SignMessageOutcome =
  | { kind: 'ok'; signatureBase64: string }
  | { kind: 'unsupported' }
  | { kind: 'wallet-mismatch' }
  | { kind: 'rejected' }
  | { kind: 'failed' };

export interface WalletMessageSigningPort {
  signMessage(params: { walletId: string; message: string }): Promise<SignMessageOutcome>;
}

// --- Plan repository port ---

export type PlanOutcome =
  | { readonly kind: 'acknowledged' }
  | { readonly kind: 'stand-down' }
  | { readonly kind: 'expired' }
  | { readonly kind: 'position-changed' }
  | { readonly kind: 'rejected' }
  | { readonly kind: 'executed' }
  | { readonly kind: 'failed' };

export type PlanRequestParams = {
  readonly planId: import('@clmm/domain').PlanId;
  readonly canonicalHash: import('@clmm/domain').CanonicalHash;
  readonly positionId: PositionId;
  readonly walletId: WalletId;
  readonly requestedAt: ClockTimestamp;
  readonly action: PlanAction;
  readonly snapshotFingerprint?: string;
};

export type PlanRequestResult =
  | { readonly kind: 'created' }
  | { readonly kind: 'exact-replay' }
  | { readonly kind: 'conflict' };

export type PlanResponseParams = {
  readonly planId: import('@clmm/domain').PlanId;
  readonly regimeResponse: RegimeResponse;
  readonly respondedAt: ClockTimestamp;
  readonly asOfAt: ClockTimestamp;
  readonly expiresAt: ClockTimestamp;
};

export type PlanDecisionParams = {
  readonly planId: import('@clmm/domain').PlanId;
  readonly decision: PlanOutcome;
  readonly decidedAt: ClockTimestamp;
};

export type PlanExecutionLinkParams = {
  readonly planId: import('@clmm/domain').PlanId;
  readonly attemptId: string;
  readonly linkedAt: ClockTimestamp;
};

export type CanonicalResult = {
  readonly id: string;
  readonly payload: Record<string, unknown>;
};

export type PlanTerminalOutcomeParams = {
  readonly planId: import('@clmm/domain').PlanId;
  readonly outcome: PlanOutcome;
  readonly canonicalResult: CanonicalResult;
  readonly resultIdempotencyKey: string;
  readonly committedAt: ClockTimestamp;
};

export type TerminalOutcomeCommitResult =
  | { readonly kind: 'committed' }
  | { readonly kind: 'plan-not-found' };

export type PlanResultClaim = {
  readonly resultId: string;
  readonly planId: import('@clmm/domain').PlanId;
  readonly canonicalResult: CanonicalResult;
  readonly idempotencyKey: string;
  readonly attemptCount: number;
};

export type PlanRetryScheduleParams = {
  readonly resultId: string;
  readonly nextAttemptAt: ClockTimestamp;
  readonly lastError?: string;
};

export type PlanDeliveryCompletionParams = {
  readonly resultId: string;
  readonly deliveredAt: ClockTimestamp;
};

export type PlanPermanentFailureParams = {
  readonly planId: import('@clmm/domain').PlanId;
  readonly reason: string;
  readonly failedAt: ClockTimestamp;
};

export interface PlanRepository {
  createRequest(params: PlanRequestParams): Promise<PlanRequestResult>;
  acceptResponse(
    params: PlanResponseParams,
  ): Promise<{ readonly kind: 'accepted' } | { readonly kind: 'conflict-detected' }>;
  getCurrentPlan(positionId: PositionId): Promise<PositionPlan | null>;
  recordDecision(params: PlanDecisionParams): Promise<void>;
  linkExecutionAttempt(params: PlanExecutionLinkParams): Promise<void>;
  commitTerminalOutcome(params: PlanTerminalOutcomeParams): Promise<TerminalOutcomeCommitResult>;
  claimDueResult(): Promise<PlanResultClaim | null>;
  rescheduleRetry(params: PlanRetryScheduleParams): Promise<void>;
  completeDelivery(params: PlanDeliveryCompletionParams): Promise<void>;
  recordPermanentFailure(params: PlanPermanentFailureParams): Promise<void>;
}
