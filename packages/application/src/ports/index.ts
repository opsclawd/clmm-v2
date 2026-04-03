import type {
  PositionId,
  WalletId,
  BreachDirection,
  ClockTimestamp,
  TokenAmount,
} from '@clmm/domain';
import type {
  LiquidityPosition,
} from '@clmm/domain';
import type {
  ExitTrigger,
  BreachEpisode,
  BreachEpisodeId,
  ExitTriggerId,
} from '@clmm/domain';
import type {
  ExecutionPlan,
  ExecutionPreview,
  ExecutionAttempt,
  ExecutionLifecycleState,
  TransactionReference,
  SwapInstruction,
} from '@clmm/domain';
import type {
  HistoryEvent,
  HistoryTimeline,
  ExecutionOutcomeSummary,
} from '@clmm/domain';

// --- Position read ports ---

export interface SupportedPositionReadPort {
  listSupportedPositions(walletId: WalletId): Promise<LiquidityPosition[]>;
  getPosition(walletId: WalletId, positionId: PositionId): Promise<LiquidityPosition | null>;
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
  submitExecution(signedPayload: Uint8Array): Promise<{
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
    | { kind: 'signed'; signedPayload: Uint8Array }
    | { kind: 'declined' }
    | { kind: 'interrupted' }
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
  saveTrigger(trigger: ExitTrigger): Promise<void>;
  getTrigger(triggerId: ExitTriggerId): Promise<ExitTrigger | null>;
  listActionableTriggers(walletId: WalletId): Promise<ExitTrigger[]>;
  getActiveEpisodeTrigger(episodeId: BreachEpisodeId): Promise<ExitTriggerId | null>;
  saveEpisode(episode: BreachEpisode): Promise<void>;
  deleteTrigger(triggerId: ExitTriggerId): Promise<void>;
}

export type StoredExecutionAttempt = ExecutionAttempt & {
  attemptId: string;
  positionId: PositionId;
  breachDirection: BreachDirection;
  previewId?: string;
};

export interface ExecutionRepository {
  savePreview(positionId: PositionId, preview: ExecutionPreview, breachDirection: BreachDirection): Promise<{ previewId: string }>;
  getPreview(previewId: string): Promise<{ preview: ExecutionPreview; positionId: PositionId; breachDirection: BreachDirection } | null>;
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
  updateAttemptState(attemptId: string, state: ExecutionLifecycleState): Promise<void>;
}

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
  getTimeline(positionId: PositionId): Promise<HistoryTimeline>;
  getOutcomeSummary(positionId: PositionId): Promise<ExecutionOutcomeSummary | null>;
}

export interface MonitoredWalletRepository {
  enroll(walletId: WalletId, enrolledAt: ClockTimestamp): Promise<void>;
  unenroll(walletId: WalletId): Promise<void>;
  listActiveWallets(): Promise<Array<{ walletId: WalletId; lastScannedAt: ClockTimestamp | null }>>;
  markScanned(walletId: WalletId, scannedAt: ClockTimestamp): Promise<void>;
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
