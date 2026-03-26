# CLMM V2 — Epic 3: Application Use Cases

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisite:** Epic 2 complete — domain tests pass, directional policy exhaustively tested.

**Goal:** Define all application ports (interfaces), DTOs, and use-case orchestration in `packages/application`. UI and adapters can build against these contracts independently. All use cases are tested with fake ports from `packages/testing` — no real Solana SDK, no real DB.

**Architecture:** `packages/application` depends only on `packages/domain`. Ports are TypeScript interfaces. DTOs are plain types. The public facade (`src/public/index.ts`) is the only import surface for `packages/ui`. Fake ports from `packages/testing` satisfy all tests.

**Tech Stack:** TypeScript strict, Vitest, fake ports (in-memory), no external SDKs

---

## File Map

```
packages/application/src/
  ports/
    index.ts                          # all port interface exports

  dto/
    index.ts                          # all DTO exports

  public/
    index.ts                          # UI-facing re-export barrel

  use-cases/
    positions/
      ListSupportedPositions.ts
      ListSupportedPositions.test.ts
      GetPositionDetail.ts
      GetMonitoringReadiness.ts

    triggers/
      ScanPositionsForBreaches.ts
      ScanPositionsForBreaches.test.ts
      QualifyActionableTrigger.ts
      QualifyActionableTrigger.test.ts
      ListActionableAlerts.ts

    previews/
      CreateExecutionPreview.ts
      CreateExecutionPreview.test.ts
      RefreshExecutionPreview.ts
      RefreshExecutionPreview.test.ts
      GetExecutionPreview.ts

    execution/
      ApproveExecution.ts
      ApproveExecution.test.ts
      RequestWalletSignature.ts
      SubmitExecutionAttempt.ts
      ReconcileExecutionAttempt.ts
      ReconcileExecutionAttempt.test.ts
      RecordSignatureDecline.ts
      RecordExecutionAbandonment.ts
      ResumeExecutionAttempt.ts
      ResumeExecutionAttempt.test.ts
      ResolveExecutionEntryContext.ts
      ResolveExecutionEntryContext.test.ts
      GetExecutionAttemptDetail.ts

    history/
      GetExecutionHistory.ts

    notifications/
      DispatchActionableNotification.ts
      DispatchActionableNotification.test.ts
      AcknowledgeAlert.ts

    wallet/
      ConnectWalletSession.ts
      SyncPlatformCapabilities.ts

packages/testing/src/
  fakes/
    FakeSupportedPositionReadPort.ts
    FakeRangeObservationPort.ts
    FakeSwapQuotePort.ts
    FakeExecutionPreparationPort.ts
    FakeExecutionSubmissionPort.ts
    FakeWalletSigningPort.ts
    FakeNotificationPort.ts
    FakePlatformCapabilityPort.ts
    FakeNotificationPermissionPort.ts
    FakeDeepLinkEntryPort.ts
    FakeExecutionHistoryRepository.ts
    FakeTriggerRepository.ts
    FakeExecutionRepository.ts
    FakeExecutionSessionRepository.ts
    FakeClockPort.ts
    FakeIdGeneratorPort.ts
    index.ts

  fixtures/
    positions.ts
    triggers.ts
    previews.ts
    index.ts
```

---

## Task 1: Port Interfaces

**Files:**
- Create: `packages/application/src/ports/index.ts`

- [ ] **Step 1.1: Write all port interfaces**

`packages/application/src/ports/index.ts`:
```typescript
import type {
  PositionId,
  WalletId,
  PoolId,
  BreachDirection,
  ClockTimestamp,
  TokenAmount,
} from '@clmm/domain';
import type {
  LiquidityPosition,
  RangeState,
  MonitoringReadiness,
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
  getPosition(positionId: PositionId): Promise<LiquidityPosition | null>;
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
  prepareExecution(plan: ExecutionPlan, walletId: WalletId): Promise<{
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
}

export interface ExecutionRepository {
  savePreview(positionId: PositionId, preview: ExecutionPreview): Promise<{ previewId: string }>;
  getPreview(previewId: string): Promise<ExecutionPreview | null>;
  saveAttempt(attempt: ExecutionAttempt & { attemptId: string; positionId: PositionId }): Promise<void>;
  getAttempt(attemptId: string): Promise<(ExecutionAttempt & { attemptId: string; positionId: PositionId }) | null>;
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

// --- Cross-cutting ports ---

export interface ObservabilityPort {
  log(level: 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>): void;
  recordTiming(event: string, durationMs: number, tags?: Record<string, string>): void;
}

export interface ClockPort {
  now(): ClockTimestamp;
}

export interface IdGeneratorPort {
  generateId(): string;
}
```

- [ ] **Step 1.2: Typecheck**

```bash
pnpm --filter @clmm/application typecheck
```

Expected: exits 0.

- [ ] **Step 1.3: Commit**

```bash
git add packages/application/src/ports/
git commit -m "feat(application): define all application port interfaces"
```

---

## Task 2: DTOs

**Files:**
- Create: `packages/application/src/dto/index.ts`

- [ ] **Step 2.1: Write DTOs**

`packages/application/src/dto/index.ts`:
```typescript
import type {
  PositionId,
  WalletId,
  PoolId,
  BreachDirection,
  PostExitAssetPosture,
  AssetSymbol,
  ClockTimestamp,
} from '@clmm/domain';
import type { ExecutionLifecycleState, PreviewFreshness, TransactionReference } from '@clmm/domain';
import type { ExitTriggerId, BreachEpisodeId } from '@clmm/domain';
import type { PlatformCapabilityState } from '../ports/index.js';

// Position DTOs
export type PositionSummaryDto = {
  positionId: PositionId;
  poolId: PoolId;
  rangeState: 'in-range' | 'below-range' | 'above-range';
  hasActionableTrigger: boolean;
  monitoringStatus: 'active' | 'degraded' | 'inactive';
};

export type PositionDetailDto = PositionSummaryDto & {
  lowerBound: number;
  upperBound: number;
  currentPrice: number;
  triggerId?: ExitTriggerId;
  breachDirection?: BreachDirection;
};

// Preview DTOs
export type PreviewStepDto =
  | { kind: 'remove-liquidity'; estimatedAmount?: { raw: bigint; symbol: AssetSymbol } }
  | { kind: 'collect-fees'; estimatedFees?: { raw: bigint; symbol: AssetSymbol } }
  | { kind: 'swap-assets'; fromAsset: AssetSymbol; toAsset: AssetSymbol; policyReason: string; estimatedOutput?: { raw: bigint; symbol: AssetSymbol } };

export type ExecutionPreviewDto = {
  previewId: string;
  positionId: PositionId;
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
```

- [ ] **Step 2.2: Typecheck**

```bash
pnpm --filter @clmm/application typecheck
```

Expected: exits 0.

- [ ] **Step 2.3: Commit**

```bash
git add packages/application/src/dto/
git commit -m "feat(application): define application DTOs"
```

---

## Task 3: Fake Ports (packages/testing)

All application use-case tests depend on these fakes. Write them before tests.

**Files:** `packages/testing/src/fakes/*.ts`

- [ ] **Step 3.1: Create FakeClockPort and FakeIdGeneratorPort**

`packages/testing/src/fakes/FakeClockPort.ts`:
```typescript
import type { ClockPort } from '@clmm/application';
import type { ClockTimestamp } from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';

export class FakeClockPort implements ClockPort {
  private _now: ClockTimestamp;

  constructor(initialMs = 1_000_000) {
    this._now = makeClockTimestamp(initialMs);
  }

  now(): ClockTimestamp {
    return this._now;
  }

  advance(ms: number): void {
    this._now = makeClockTimestamp(this._now + ms);
  }

  set(ms: number): void {
    this._now = makeClockTimestamp(ms);
  }
}
```

`packages/testing/src/fakes/FakeIdGeneratorPort.ts`:
```typescript
import type { IdGeneratorPort } from '@clmm/application';

export class FakeIdGeneratorPort implements IdGeneratorPort {
  private _counter = 0;
  private readonly _prefix: string;

  constructor(prefix = 'fake') {
    this._prefix = prefix;
  }

  generateId(): string {
    this._counter++;
    return `${this._prefix}-${this._counter}`;
  }
}
```

- [ ] **Step 3.2: Create FakeTriggerRepository**

`packages/testing/src/fakes/FakeTriggerRepository.ts`:
```typescript
import type { TriggerRepository } from '@clmm/application';
import type {
  ExitTrigger,
  BreachEpisode,
  ExitTriggerId,
  BreachEpisodeId,
  WalletId,
} from '@clmm/domain';

export class FakeTriggerRepository implements TriggerRepository {
  readonly triggers = new Map<string, ExitTrigger>();
  readonly episodes = new Map<string, BreachEpisode>();
  readonly episodeTriggerMap = new Map<string, string>();

  async saveTrigger(trigger: ExitTrigger): Promise<void> {
    this.triggers.set(trigger.triggerId, trigger);
  }

  async getTrigger(triggerId: ExitTriggerId): Promise<ExitTrigger | null> {
    return this.triggers.get(triggerId) ?? null;
  }

  async listActionableTriggers(_walletId: WalletId): Promise<ExitTrigger[]> {
    return Array.from(this.triggers.values());
  }

  async getActiveEpisodeTrigger(episodeId: BreachEpisodeId): Promise<ExitTriggerId | null> {
    const id = this.episodeTriggerMap.get(episodeId);
    return (id as ExitTriggerId | undefined) ?? null;
  }

  async saveEpisode(episode: BreachEpisode): Promise<void> {
    this.episodes.set(episode.episodeId, episode);
    if (episode.activeTriggerId) {
      this.episodeTriggerMap.set(episode.episodeId, episode.activeTriggerId);
    }
  }
}
```

- [ ] **Step 3.3: Create FakeExecutionRepository**

`packages/testing/src/fakes/FakeExecutionRepository.ts`:
```typescript
import type { ExecutionRepository } from '@clmm/application';
import type {
  ExecutionPreview,
  ExecutionAttempt,
  ExecutionLifecycleState,
  PositionId,
} from '@clmm/domain';

type StoredAttempt = ExecutionAttempt & { attemptId: string; positionId: PositionId };

export class FakeExecutionRepository implements ExecutionRepository {
  readonly previews = new Map<string, ExecutionPreview>();
  readonly attempts = new Map<string, StoredAttempt>();
  private _previewCounter = 0;

  async savePreview(positionId: PositionId, preview: ExecutionPreview): Promise<{ previewId: string }> {
    const previewId = `preview-${++this._previewCounter}`;
    this.previews.set(previewId, preview);
    return { previewId };
  }

  async getPreview(previewId: string): Promise<ExecutionPreview | null> {
    return this.previews.get(previewId) ?? null;
  }

  async saveAttempt(attempt: StoredAttempt): Promise<void> {
    this.attempts.set(attempt.attemptId, attempt);
  }

  async getAttempt(attemptId: string): Promise<StoredAttempt | null> {
    return this.attempts.get(attemptId) ?? null;
  }

  async updateAttemptState(attemptId: string, state: ExecutionLifecycleState): Promise<void> {
    const existing = this.attempts.get(attemptId);
    if (existing) {
      this.attempts.set(attemptId, { ...existing, lifecycleState: state });
    }
  }
}
```

- [ ] **Step 3.4: Create FakeExecutionHistoryRepository**

`packages/testing/src/fakes/FakeExecutionHistoryRepository.ts`:
```typescript
import type { ExecutionHistoryRepository } from '@clmm/application';
import type {
  HistoryEvent,
  HistoryTimeline,
  ExecutionOutcomeSummary,
  PositionId,
} from '@clmm/domain';

export class FakeExecutionHistoryRepository implements ExecutionHistoryRepository {
  readonly events: HistoryEvent[] = [];

  async appendEvent(event: HistoryEvent): Promise<void> {
    this.events.push(event);
  }

  async getTimeline(positionId: PositionId): Promise<HistoryTimeline> {
    return {
      positionId,
      events: this.events.filter((e) => e.positionId === positionId),
    };
  }

  async getOutcomeSummary(_positionId: PositionId): Promise<ExecutionOutcomeSummary | null> {
    return null;
  }
}
```

- [ ] **Step 3.5: Create FakeSupportedPositionReadPort**

`packages/testing/src/fakes/FakeSupportedPositionReadPort.ts`:
```typescript
import type { SupportedPositionReadPort } from '@clmm/application';
import type { LiquidityPosition, PositionId, WalletId } from '@clmm/domain';

export class FakeSupportedPositionReadPort implements SupportedPositionReadPort {
  private readonly _positions: LiquidityPosition[];

  constructor(positions: LiquidityPosition[] = []) {
    this._positions = positions;
  }

  async listSupportedPositions(_walletId: WalletId): Promise<LiquidityPosition[]> {
    return [...this._positions];
  }

  async getPosition(positionId: PositionId): Promise<LiquidityPosition | null> {
    return this._positions.find((p) => p.positionId === positionId) ?? null;
  }
}
```

- [ ] **Step 3.6: Create remaining fakes (swap, signing, notifications)**

`packages/testing/src/fakes/FakeSwapQuotePort.ts`:
```typescript
import type { SwapQuotePort } from '@clmm/application';
import type { SwapInstruction, TokenAmount, ClockTimestamp } from '@clmm/domain';
import { makeTokenAmount, makeClockTimestamp } from '@clmm/domain';

export class FakeSwapQuotePort implements SwapQuotePort {
  private _shouldFail = false;

  failNext(): void {
    this._shouldFail = true;
  }

  async getQuote(instruction: SwapInstruction): Promise<{
    estimatedOutputAmount: TokenAmount;
    priceImpactPercent: number;
    routeLabel: string;
    quotedAt: ClockTimestamp;
  }> {
    if (this._shouldFail) {
      this._shouldFail = false;
      throw new Error('FakeSwapQuotePort: simulated failure');
    }
    return {
      estimatedOutputAmount: makeTokenAmount(BigInt(1_000_000), 6, instruction.toAsset),
      priceImpactPercent: 0.1,
      routeLabel: 'fake-route',
      quotedAt: makeClockTimestamp(Date.now()),
    };
  }
}
```

`packages/testing/src/fakes/FakeWalletSigningPort.ts`:
```typescript
import type { WalletSigningPort } from '@clmm/application';
import type { WalletId } from '@clmm/domain';

type SigningResult =
  | { kind: 'signed'; signedPayload: Uint8Array }
  | { kind: 'declined' }
  | { kind: 'interrupted' };

export class FakeWalletSigningPort implements WalletSigningPort {
  private _nextResult: SigningResult = {
    kind: 'signed',
    signedPayload: new Uint8Array([1, 2, 3]),
  };

  willDecline(): void {
    this._nextResult = { kind: 'declined' };
  }

  willInterrupt(): void {
    this._nextResult = { kind: 'interrupted' };
  }

  async requestSignature(
    _payload: Uint8Array,
    _walletId: WalletId,
  ): Promise<SigningResult> {
    return this._nextResult;
  }
}
```

`packages/testing/src/fakes/FakeNotificationPort.ts`:
```typescript
import type { NotificationPort } from '@clmm/application';
import type { WalletId, PositionId, BreachDirection, ClockTimestamp, ExitTriggerId } from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';

export class FakeNotificationPort implements NotificationPort {
  readonly dispatched: Array<{
    walletId: WalletId;
    positionId: PositionId;
    breachDirection: BreachDirection;
    triggerId: ExitTriggerId;
  }> = [];

  async sendActionableAlert(params: {
    walletId: WalletId;
    positionId: PositionId;
    breachDirection: BreachDirection;
    triggerId: ExitTriggerId;
  }): Promise<{ deliveredAt: ClockTimestamp | null }> {
    this.dispatched.push(params);
    return { deliveredAt: makeClockTimestamp(Date.now()) };
  }
}
```

- [ ] **Step 3.7: Create FakeExecutionSubmissionPort and FakeExecutionPreparationPort**

`packages/testing/src/fakes/FakeExecutionPreparationPort.ts`:
```typescript
import type { ExecutionPreparationPort } from '@clmm/application';
import type { ExecutionPlan, WalletId, ClockTimestamp } from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';

export class FakeExecutionPreparationPort implements ExecutionPreparationPort {
  async prepareExecution(
    _plan: ExecutionPlan,
    _walletId: WalletId,
  ): Promise<{ serializedPayload: Uint8Array; preparedAt: ClockTimestamp }> {
    return {
      serializedPayload: new Uint8Array([9, 8, 7]),
      preparedAt: makeClockTimestamp(Date.now()),
    };
  }
}
```

`packages/testing/src/fakes/FakeExecutionSubmissionPort.ts`:
```typescript
import type { ExecutionSubmissionPort } from '@clmm/application';
import type { TransactionReference, ExecutionLifecycleState, ClockTimestamp } from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';

export class FakeExecutionSubmissionPort implements ExecutionSubmissionPort {
  private _confirmedSteps: string[] = [];

  setConfirmedSteps(steps: string[]): void {
    this._confirmedSteps = steps;
  }

  async submitExecution(
    _payload: Uint8Array,
  ): Promise<{ references: TransactionReference[]; submittedAt: ClockTimestamp }> {
    return {
      references: [{ signature: 'fake-sig-1', stepKind: 'remove-liquidity' }],
      submittedAt: makeClockTimestamp(Date.now()),
    };
  }

  async reconcileExecution(
    _refs: TransactionReference[],
  ): Promise<{
    confirmedSteps: Array<ExecutionLifecycleState['kind']>;
    finalState: ExecutionLifecycleState | null;
  }> {
    return {
      confirmedSteps: this._confirmedSteps as Array<ExecutionLifecycleState['kind']>,
      finalState: this._confirmedSteps.length === 3 ? { kind: 'confirmed' } : null,
    };
  }
}
```

- [ ] **Step 3.8: Update packages/testing barrel**

`packages/testing/src/fakes/index.ts`:
```typescript
export { FakeClockPort } from './FakeClockPort.js';
export { FakeIdGeneratorPort } from './FakeIdGeneratorPort.js';
export { FakeTriggerRepository } from './FakeTriggerRepository.js';
export { FakeExecutionRepository } from './FakeExecutionRepository.js';
export { FakeExecutionHistoryRepository } from './FakeExecutionHistoryRepository.js';
export { FakeSupportedPositionReadPort } from './FakeSupportedPositionReadPort.js';
export { FakeSwapQuotePort } from './FakeSwapQuotePort.js';
export { FakeWalletSigningPort } from './FakeWalletSigningPort.js';
export { FakeNotificationPort } from './FakeNotificationPort.js';
export { FakeExecutionPreparationPort } from './FakeExecutionPreparationPort.js';
export { FakeExecutionSubmissionPort } from './FakeExecutionSubmissionPort.js';
```

`packages/testing/src/index.ts`:
```typescript
export * from './fakes/index.js';
export * from './fixtures/index.js';
```

- [ ] **Step 3.9: Add test fixtures**

`packages/testing/src/fixtures/positions.ts`:
```typescript
import type { LiquidityPosition } from '@clmm/domain';
import {
  makePositionId,
  makeWalletId,
  makePoolId,
  makeClockTimestamp,
  LOWER_BOUND_BREACH,
  UPPER_BOUND_BREACH,
} from '@clmm/domain';

export const FIXTURE_POSITION_ID = makePositionId('fixture-pos-1');
export const FIXTURE_WALLET_ID = makeWalletId('fixture-wallet-1');
export const FIXTURE_POOL_ID = makePoolId('fixture-pool-1');

export const FIXTURE_POSITION_IN_RANGE: LiquidityPosition = {
  positionId: FIXTURE_POSITION_ID,
  walletId: FIXTURE_WALLET_ID,
  poolId: FIXTURE_POOL_ID,
  bounds: { lowerBound: 100, upperBound: 200 },
  lastObservedAt: makeClockTimestamp(1_000_000),
  rangeState: { kind: 'in-range', currentPrice: 150 },
  monitoringReadiness: { kind: 'active' },
};

export const FIXTURE_POSITION_BELOW_RANGE: LiquidityPosition = {
  ...FIXTURE_POSITION_IN_RANGE,
  rangeState: { kind: 'below-range', currentPrice: 80 },
};

export const FIXTURE_POSITION_ABOVE_RANGE: LiquidityPosition = {
  ...FIXTURE_POSITION_IN_RANGE,
  rangeState: { kind: 'above-range', currentPrice: 250 },
};
```

`packages/testing/src/fixtures/index.ts`:
```typescript
export * from './positions.js';
```

- [ ] **Step 3.10: Typecheck testing package**

```bash
pnpm --filter @clmm/testing typecheck
```

Expected: exits 0.

- [ ] **Step 3.11: Commit**

```bash
git add packages/testing/src/
git commit -m "feat(testing): add fake ports, repositories, and fixtures"
```

---

## Task 4: Monitoring + Trigger Use Cases (TDD)

**Files:**
- Create: `packages/application/src/use-cases/triggers/ScanPositionsForBreaches.ts`
- Create: `packages/application/src/use-cases/triggers/ScanPositionsForBreaches.test.ts`
- Create: `packages/application/src/use-cases/triggers/QualifyActionableTrigger.ts`
- Create: `packages/application/src/use-cases/triggers/QualifyActionableTrigger.test.ts`

- [ ] **Step 4.1: Write failing tests for ScanPositionsForBreaches**

`packages/application/src/use-cases/triggers/ScanPositionsForBreaches.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { scanPositionsForBreaches } from './ScanPositionsForBreaches.js';
import {
  FakeSupportedPositionReadPort,
  FakeClockPort,
  FakeIdGeneratorPort,
  FIXTURE_WALLET_ID,
  FIXTURE_POSITION_BELOW_RANGE,
  FIXTURE_POSITION_ABOVE_RANGE,
  FIXTURE_POSITION_IN_RANGE,
} from '@clmm/testing';

describe('ScanPositionsForBreaches', () => {
  let clock: FakeClockPort;
  let ids: FakeIdGeneratorPort;

  beforeEach(() => {
    clock = new FakeClockPort();
    ids = new FakeIdGeneratorPort('scan');
  });

  it('reports below-range observation for a position below its lower bound', async () => {
    const positionRead = new FakeSupportedPositionReadPort([FIXTURE_POSITION_BELOW_RANGE]);
    const observations = await scanPositionsForBreaches({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort: positionRead,
      clock,
      ids,
    });
    expect(observations).toHaveLength(1);
    expect(observations[0]?.direction.kind).toBe('lower-bound-breach');
  });

  it('reports above-range observation for a position above its upper bound', async () => {
    const positionRead = new FakeSupportedPositionReadPort([FIXTURE_POSITION_ABOVE_RANGE]);
    const observations = await scanPositionsForBreaches({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort: positionRead,
      clock,
      ids,
    });
    expect(observations[0]?.direction.kind).toBe('upper-bound-breach');
  });

  it('reports no observations for in-range positions', async () => {
    const positionRead = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE]);
    const observations = await scanPositionsForBreaches({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort: positionRead,
      clock,
      ids,
    });
    expect(observations).toHaveLength(0);
  });

  it('observations include positionId and breachDirection — never inferred from token order', async () => {
    const positionRead = new FakeSupportedPositionReadPort([FIXTURE_POSITION_BELOW_RANGE]);
    const [obs] = await scanPositionsForBreaches({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort: positionRead,
      clock,
      ids,
    });
    expect(obs?.positionId).toBe(FIXTURE_POSITION_BELOW_RANGE.positionId);
    expect(obs?.direction).toBeDefined();
  });
});
```

- [ ] **Step 4.2: Run — FAIL**

```bash
pnpm --filter @clmm/application test
```

- [ ] **Step 4.3: Implement ScanPositionsForBreaches**

`packages/application/src/use-cases/triggers/ScanPositionsForBreaches.ts`:
```typescript
import type {
  SupportedPositionReadPort,
  ClockPort,
  IdGeneratorPort,
} from '../../ports/index.js';
import type { WalletId, BreachDirection, PositionId, ClockTimestamp } from '@clmm/domain';
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH } from '@clmm/domain';

export type BreachObservationResult = {
  positionId: PositionId;
  direction: BreachDirection;
  observedAt: ClockTimestamp;
  episodeId: string;
};

export async function scanPositionsForBreaches(params: {
  walletId: WalletId;
  positionReadPort: SupportedPositionReadPort;
  clock: ClockPort;
  ids: IdGeneratorPort;
}): Promise<BreachObservationResult[]> {
  const { walletId, positionReadPort, clock, ids } = params;
  const positions = await positionReadPort.listSupportedPositions(walletId);
  const now = clock.now();
  const results: BreachObservationResult[] = [];

  for (const position of positions) {
    if (position.rangeState.kind === 'below-range') {
      results.push({
        positionId: position.positionId,
        direction: LOWER_BOUND_BREACH,
        observedAt: now,
        episodeId: ids.generateId(),
      });
    } else if (position.rangeState.kind === 'above-range') {
      results.push({
        positionId: position.positionId,
        direction: UPPER_BOUND_BREACH,
        observedAt: now,
        episodeId: ids.generateId(),
      });
    }
  }

  return results;
}
```

- [ ] **Step 4.4: Run — PASS**

```bash
pnpm --filter @clmm/application test
```

- [ ] **Step 4.5: Write failing tests for QualifyActionableTrigger**

`packages/application/src/use-cases/triggers/QualifyActionableTrigger.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { qualifyActionableTrigger } from './QualifyActionableTrigger.js';
import {
  FakeClockPort,
  FakeIdGeneratorPort,
  FakeTriggerRepository,
  FIXTURE_POSITION_ID,
} from '@clmm/testing';
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH, makeClockTimestamp } from '@clmm/domain';
import type { BreachObservationResult } from './ScanPositionsForBreaches.js';

function makeObs(
  direction = LOWER_BOUND_BREACH,
  count = 3,
): BreachObservationResult {
  return {
    positionId: FIXTURE_POSITION_ID,
    direction,
    observedAt: makeClockTimestamp(1_000_000),
    episodeId: 'ep-1',
  };
}

describe('QualifyActionableTrigger', () => {
  let clock: FakeClockPort;
  let ids: FakeIdGeneratorPort;
  let repo: FakeTriggerRepository;

  beforeEach(() => {
    clock = new FakeClockPort();
    ids = new FakeIdGeneratorPort('trigger');
    repo = new FakeTriggerRepository();
  });

  it('creates a trigger for a lower-bound breach with correct direction', async () => {
    const result = await qualifyActionableTrigger({
      observation: makeObs(LOWER_BOUND_BREACH),
      consecutiveCount: 3,
      triggerRepo: repo,
      clock,
      ids,
    });
    expect(result.kind).toBe('trigger-created');
    if (result.kind === 'trigger-created') {
      expect(result.trigger.breachDirection.kind).toBe('lower-bound-breach');
    }
  });

  it('creates a trigger for an upper-bound breach with correct direction', async () => {
    const result = await qualifyActionableTrigger({
      observation: makeObs(UPPER_BOUND_BREACH),
      consecutiveCount: 3,
      triggerRepo: repo,
      clock,
      ids,
    });
    expect(result.kind).toBe('trigger-created');
    if (result.kind === 'trigger-created') {
      expect(result.trigger.breachDirection.kind).toBe('upper-bound-breach');
    }
  });

  it('suppresses duplicate when episode already has a trigger', async () => {
    // Seed the repo with an existing trigger
    await qualifyActionableTrigger({
      observation: makeObs(),
      consecutiveCount: 3,
      triggerRepo: repo,
      clock,
      ids,
    });
    // Second call for same episode → suppressed
    const result = await qualifyActionableTrigger({
      observation: makeObs(),
      consecutiveCount: 3,
      triggerRepo: repo,
      clock,
      ids,
    });
    expect(result.kind).toBe('duplicate-suppressed');
  });

  it('does not qualify when below confirmation threshold', async () => {
    const result = await qualifyActionableTrigger({
      observation: makeObs(),
      consecutiveCount: 2,
      triggerRepo: repo,
      clock,
      ids,
    });
    expect(result.kind).toBe('not-qualified');
  });

  it('persists the trigger and episode to the repository', async () => {
    await qualifyActionableTrigger({
      observation: makeObs(),
      consecutiveCount: 3,
      triggerRepo: repo,
      clock,
      ids,
    });
    expect(repo.triggers.size).toBe(1);
  });
});
```

- [ ] **Step 4.6: Run — FAIL**

```bash
pnpm --filter @clmm/application test
```

- [ ] **Step 4.7: Implement QualifyActionableTrigger**

`packages/application/src/use-cases/triggers/QualifyActionableTrigger.ts`:
```typescript
import type { TriggerRepository, ClockPort, IdGeneratorPort } from '../../ports/index.js';
import { qualifyTrigger } from '@clmm/domain';
import type { ExitTrigger, BreachEpisode, BreachEpisodeId, ExitTriggerId } from '@clmm/domain';
import type { BreachObservationResult } from './ScanPositionsForBreaches.js';

export type QualifyResult =
  | { kind: 'trigger-created'; trigger: ExitTrigger }
  | { kind: 'not-qualified'; reason: string }
  | { kind: 'duplicate-suppressed'; existingTriggerId: ExitTriggerId };

export async function qualifyActionableTrigger(params: {
  observation: BreachObservationResult;
  consecutiveCount: number;
  triggerRepo: TriggerRepository;
  clock: ClockPort;
  ids: IdGeneratorPort;
}): Promise<QualifyResult> {
  const { observation, consecutiveCount, triggerRepo, clock, ids } = params;

  // Check for existing trigger in this episode
  const existingId = await triggerRepo.getActiveEpisodeTrigger(
    observation.episodeId as BreachEpisodeId,
  );

  const domainResult = qualifyTrigger({
    positionId: observation.positionId,
    direction: observation.direction,
    observedAt: clock.now(),
    episodeId: observation.episodeId,
    consecutiveOutOfRangeCount: consecutiveCount,
    existingTriggerIdForEpisode: existingId ?? undefined,
  });

  if (domainResult.kind === 'not-qualified') {
    return { kind: 'not-qualified', reason: domainResult.reason };
  }

  if (domainResult.kind === 'duplicate-suppressed') {
    return {
      kind: 'duplicate-suppressed',
      existingTriggerId: domainResult.existingTriggerId as ExitTriggerId,
    };
  }

  // Persist trigger + episode
  await triggerRepo.saveTrigger(domainResult.trigger);

  const episode: BreachEpisode = {
    episodeId: observation.episodeId as BreachEpisodeId,
    positionId: observation.positionId,
    direction: observation.direction,
    startedAt: observation.observedAt,
    lastObservedAt: clock.now(),
    activeTriggerId: domainResult.trigger.triggerId,
  };
  await triggerRepo.saveEpisode(episode);

  return { kind: 'trigger-created', trigger: domainResult.trigger };
}
```

- [ ] **Step 4.8: Run — PASS**

```bash
pnpm --filter @clmm/application test
```

- [ ] **Step 4.9: Commit**

```bash
git add packages/application/src/use-cases/triggers/
git commit -m "feat(application): ScanPositionsForBreaches + QualifyActionableTrigger (TDD)"
```

---

## Task 5: Preview Use Cases (TDD)

**Files:**
- Create: `packages/application/src/use-cases/previews/CreateExecutionPreview.ts`
- Create: `packages/application/src/use-cases/previews/CreateExecutionPreview.test.ts`
- Create: `packages/application/src/use-cases/previews/RefreshExecutionPreview.ts`
- Create: `packages/application/src/use-cases/previews/RefreshExecutionPreview.test.ts`

- [ ] **Step 5.1: Write failing tests for CreateExecutionPreview**

`packages/application/src/use-cases/previews/CreateExecutionPreview.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createExecutionPreview } from './CreateExecutionPreview.js';
import {
  FakeClockPort,
  FakeIdGeneratorPort,
  FakeSwapQuotePort,
  FakeExecutionRepository,
  FIXTURE_POSITION_ID,
} from '@clmm/testing';
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH } from '@clmm/domain';

describe('CreateExecutionPreview', () => {
  let clock: FakeClockPort;
  let ids: FakeIdGeneratorPort;
  let swapQuote: FakeSwapQuotePort;
  let executionRepo: FakeExecutionRepository;

  beforeEach(() => {
    clock = new FakeClockPort();
    ids = new FakeIdGeneratorPort();
    swapQuote = new FakeSwapQuotePort();
    executionRepo = new FakeExecutionRepository();
  });

  it('creates a preview with SOL→USDC swap for lower-bound breach', async () => {
    const result = await createExecutionPreview({
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      swapQuotePort: swapQuote,
      executionRepo,
      clock,
      ids,
    });
    expect(result.plan.postExitPosture.kind).toBe('exit-to-usdc');
    expect(result.plan.swapInstruction.fromAsset).toBe('SOL');
    expect(result.plan.swapInstruction.toAsset).toBe('USDC');
  });

  it('creates a preview with USDC→SOL swap for upper-bound breach', async () => {
    const result = await createExecutionPreview({
      positionId: FIXTURE_POSITION_ID,
      breachDirection: UPPER_BOUND_BREACH,
      swapQuotePort: swapQuote,
      executionRepo,
      clock,
      ids,
    });
    expect(result.plan.postExitPosture.kind).toBe('exit-to-sol');
    expect(result.plan.swapInstruction.fromAsset).toBe('USDC');
    expect(result.plan.swapInstruction.toAsset).toBe('SOL');
  });

  it('persists the preview and returns a previewId', async () => {
    const result = await createExecutionPreview({
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      swapQuotePort: swapQuote,
      executionRepo,
      clock,
      ids,
    });
    expect(result.previewId).toBeTruthy();
    expect(executionRepo.previews.size).toBe(1);
  });

  it('marks preview as fresh immediately after creation', async () => {
    const result = await createExecutionPreview({
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      swapQuotePort: swapQuote,
      executionRepo,
      clock,
      ids,
    });
    expect(result.preview.freshness.kind).toBe('fresh');
  });
});
```

- [ ] **Step 5.2: Run — FAIL**

```bash
pnpm --filter @clmm/application test
```

- [ ] **Step 5.3: Implement CreateExecutionPreview**

`packages/application/src/use-cases/previews/CreateExecutionPreview.ts`:
```typescript
import type { SwapQuotePort, ExecutionRepository, ClockPort, IdGeneratorPort } from '../../ports/index.js';
import type { PositionId, BreachDirection, ExecutionPreview } from '@clmm/domain';
import { buildExecutionPlan, evaluatePreviewFreshness } from '@clmm/domain';

export type CreatePreviewResult = {
  previewId: string;
  plan: ExecutionPreview['plan'];
  preview: ExecutionPreview;
};

export async function createExecutionPreview(params: {
  positionId: PositionId;
  breachDirection: BreachDirection;
  swapQuotePort: SwapQuotePort;
  executionRepo: ExecutionRepository;
  clock: ClockPort;
  ids: IdGeneratorPort;
}): Promise<CreatePreviewResult> {
  const { positionId, breachDirection, swapQuotePort, executionRepo, clock } = params;

  // Build the execution plan — direction-preserving, never generic
  const plan = buildExecutionPlan(breachDirection);

  // Enrich swap instruction with live quote
  const quote = await swapQuotePort.getQuote(plan.swapInstruction);
  const enrichedSwap = { ...plan.swapInstruction, amountBasis: quote.estimatedOutputAmount };
  const enrichedPlan = { ...plan, swapInstruction: enrichedSwap };

  const estimatedAt = clock.now();
  const freshness = evaluatePreviewFreshness(estimatedAt, estimatedAt);

  const preview: ExecutionPreview = {
    plan: enrichedPlan,
    freshness,
    estimatedAt,
  };

  const { previewId } = await executionRepo.savePreview(positionId, preview);

  return { previewId, plan: enrichedPlan, preview };
}
```

- [ ] **Step 5.4: Run — PASS**

```bash
pnpm --filter @clmm/application test
```

- [ ] **Step 5.5: Write and implement RefreshExecutionPreview**

`packages/application/src/use-cases/previews/RefreshExecutionPreview.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { refreshExecutionPreview } from './RefreshExecutionPreview.js';
import { createExecutionPreview } from './CreateExecutionPreview.js';
import {
  FakeClockPort,
  FakeIdGeneratorPort,
  FakeSwapQuotePort,
  FakeExecutionRepository,
  FIXTURE_POSITION_ID,
} from '@clmm/testing';
import { LOWER_BOUND_BREACH } from '@clmm/domain';

describe('RefreshExecutionPreview', () => {
  let clock: FakeClockPort;
  let ids: FakeIdGeneratorPort;
  let swapQuote: FakeSwapQuotePort;
  let executionRepo: FakeExecutionRepository;
  let previewId: string;

  beforeEach(async () => {
    clock = new FakeClockPort(1_000_000);
    ids = new FakeIdGeneratorPort();
    swapQuote = new FakeSwapQuotePort();
    executionRepo = new FakeExecutionRepository();
    const result = await createExecutionPreview({
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      swapQuotePort: swapQuote,
      executionRepo,
      clock,
      ids,
    });
    previewId = result.previewId;
  });

  it('refreshed preview is fresh and replaces the old one', async () => {
    clock.advance(45_000); // advance to stale territory
    const result = await refreshExecutionPreview({
      previewId,
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      swapQuotePort: swapQuote,
      executionRepo,
      clock,
      ids,
    });
    expect(result.preview.freshness.kind).toBe('fresh');
  });

  it('preserves breach direction after refresh — cannot become direction-agnostic', async () => {
    const result = await refreshExecutionPreview({
      previewId,
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      swapQuotePort: swapQuote,
      executionRepo,
      clock,
      ids,
    });
    expect(result.plan.postExitPosture.kind).toBe('exit-to-usdc');
    expect(result.plan.swapInstruction.fromAsset).toBe('SOL');
  });
});
```

`packages/application/src/use-cases/previews/RefreshExecutionPreview.ts`:
```typescript
// RefreshExecutionPreview delegates to createExecutionPreview — same invariant applies
import type { SwapQuotePort, ExecutionRepository, ClockPort, IdGeneratorPort } from '../../ports/index.js';
import type { PositionId, BreachDirection } from '@clmm/domain';
import { createExecutionPreview, type CreatePreviewResult } from './CreateExecutionPreview.js';

export async function refreshExecutionPreview(params: {
  previewId: string; // the stale preview being replaced
  positionId: PositionId;
  breachDirection: BreachDirection;
  swapQuotePort: SwapQuotePort;
  executionRepo: ExecutionRepository;
  clock: ClockPort;
  ids: IdGeneratorPort;
}): Promise<CreatePreviewResult> {
  // Direction preserved by delegating to createExecutionPreview
  return createExecutionPreview({
    positionId: params.positionId,
    breachDirection: params.breachDirection,
    swapQuotePort: params.swapQuotePort,
    executionRepo: params.executionRepo,
    clock: params.clock,
    ids: params.ids,
  });
}
```

- [ ] **Step 5.6: Run — PASS**

```bash
pnpm --filter @clmm/application test
```

- [ ] **Step 5.7: Commit**

```bash
git add packages/application/src/use-cases/previews/
git commit -m "feat(application): CreateExecutionPreview + RefreshExecutionPreview (TDD)

Direction preserved: lower-bound → SOL→USDC, upper-bound → USDC→SOL"
```

---

## Task 6: Execution Use Cases (TDD)

**Files:**
- Create: `packages/application/src/use-cases/execution/ApproveExecution.ts`
- Create: `packages/application/src/use-cases/execution/ApproveExecution.test.ts`
- Create: `packages/application/src/use-cases/execution/ReconcileExecutionAttempt.ts`
- Create: `packages/application/src/use-cases/execution/ReconcileExecutionAttempt.test.ts`

- [ ] **Step 6.1: Write failing tests for ApproveExecution**

`packages/application/src/use-cases/execution/ApproveExecution.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { approveExecution } from './ApproveExecution.js';
import {
  FakeClockPort,
  FakeIdGeneratorPort,
  FakeSwapQuotePort,
  FakeExecutionRepository,
  FakeExecutionPreparationPort,
  FakeWalletSigningPort,
  FakeExecutionSubmissionPort,
  FakeExecutionHistoryRepository,
  FIXTURE_POSITION_ID,
  FIXTURE_WALLET_ID,
} from '@clmm/testing';
import { createExecutionPreview } from '../previews/CreateExecutionPreview.js';
import { LOWER_BOUND_BREACH } from '@clmm/domain';

describe('ApproveExecution', () => {
  let clock: FakeClockPort;
  let ids: FakeIdGeneratorPort;
  let swapQuote: FakeSwapQuotePort;
  let executionRepo: FakeExecutionRepository;
  let prepPort: FakeExecutionPreparationPort;
  let signingPort: FakeWalletSigningPort;
  let submissionPort: FakeExecutionSubmissionPort;
  let historyRepo: FakeExecutionHistoryRepository;
  let previewId: string;

  beforeEach(async () => {
    clock = new FakeClockPort();
    ids = new FakeIdGeneratorPort();
    swapQuote = new FakeSwapQuotePort();
    executionRepo = new FakeExecutionRepository();
    prepPort = new FakeExecutionPreparationPort();
    signingPort = new FakeWalletSigningPort();
    submissionPort = new FakeExecutionSubmissionPort();
    historyRepo = new FakeExecutionHistoryRepository();

    const created = await createExecutionPreview({
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      swapQuotePort: swapQuote,
      executionRepo,
      clock,
      ids,
    });
    previewId = created.previewId;
  });

  it('moves lifecycle to submitted when user signs', async () => {
    const result = await approveExecution({
      previewId,
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      executionRepo,
      prepPort,
      signingPort,
      submissionPort,
      historyRepo,
      clock,
      ids,
    });
    expect(result.kind).toBe('submitted');
  });

  it('records decline when user declines to sign', async () => {
    signingPort.willDecline();
    const result = await approveExecution({
      previewId,
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      executionRepo,
      prepPort,
      signingPort,
      submissionPort,
      historyRepo,
      clock,
      ids,
    });
    expect(result.kind).toBe('declined');
  });

  it('appends history events during execution', async () => {
    await approveExecution({
      previewId,
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      executionRepo,
      prepPort,
      signingPort,
      submissionPort,
      historyRepo,
      clock,
      ids,
    });
    expect(historyRepo.events.length).toBeGreaterThan(0);
    // Verify directional context preserved in history
    for (const event of historyRepo.events) {
      expect(event.breachDirection).toBeDefined();
    }
  });
});
```

- [ ] **Step 6.2: Run — FAIL**

```bash
pnpm --filter @clmm/application test
```

- [ ] **Step 6.3: Implement ApproveExecution**

`packages/application/src/use-cases/execution/ApproveExecution.ts`:
```typescript
import type {
  ExecutionRepository,
  ExecutionPreparationPort,
  WalletSigningPort,
  ExecutionSubmissionPort,
  ExecutionHistoryRepository,
  ClockPort,
  IdGeneratorPort,
} from '../../ports/index.js';
import type { WalletId, PositionId, BreachDirection } from '@clmm/domain';

export type ApproveExecutionResult =
  | { kind: 'submitted'; attemptId: string; references: Array<{ signature: string; stepKind: string }> }
  | { kind: 'declined'; attemptId: string }
  | { kind: 'interrupted'; attemptId: string };

export async function approveExecution(params: {
  previewId: string;
  walletId: WalletId;
  positionId: PositionId;
  breachDirection: BreachDirection;
  executionRepo: ExecutionRepository;
  prepPort: ExecutionPreparationPort;
  signingPort: WalletSigningPort;
  submissionPort: ExecutionSubmissionPort;
  historyRepo: ExecutionHistoryRepository;
  clock: ClockPort;
  ids: IdGeneratorPort;
}): Promise<ApproveExecutionResult> {
  const {
    previewId, walletId, positionId, breachDirection,
    executionRepo, prepPort, signingPort, submissionPort, historyRepo, clock, ids,
  } = params;

  const attemptId = ids.generateId();
  const preview = await executionRepo.getPreview(previewId);

  if (!preview) {
    throw new Error(`Preview not found: ${previewId}`);
  }

  // Save attempt in awaiting-signature state
  await executionRepo.saveAttempt({
    attemptId,
    positionId,
    lifecycleState: { kind: 'awaiting-signature' },
    completedSteps: [],
    transactionReferences: [],
  });

  await historyRepo.appendEvent({
    eventId: ids.generateId(),
    positionId,
    eventType: 'signature-requested',
    breachDirection,
    occurredAt: clock.now(),
    lifecycleState: { kind: 'awaiting-signature' },
  });

  // Prepare execution payload
  const { serializedPayload } = await prepPort.prepareExecution(preview.plan, walletId);

  // Request user signature
  const sigResult = await signingPort.requestSignature(serializedPayload, walletId);

  if (sigResult.kind === 'declined') {
    await executionRepo.updateAttemptState(attemptId, { kind: 'abandoned' });
    await historyRepo.appendEvent({
      eventId: ids.generateId(),
      positionId,
      eventType: 'signature-declined',
      breachDirection,
      occurredAt: clock.now(),
      lifecycleState: { kind: 'abandoned' },
    });
    return { kind: 'declined', attemptId };
  }

  if (sigResult.kind === 'interrupted') {
    // Leave in awaiting-signature for resume
    return { kind: 'interrupted', attemptId };
  }

  // Submit signed execution
  const { references } = await submissionPort.submitExecution(sigResult.signedPayload);

  await executionRepo.updateAttemptState(attemptId, { kind: 'submitted' });
  await historyRepo.appendEvent({
    eventId: ids.generateId(),
    positionId,
    eventType: 'submitted',
    breachDirection,
    occurredAt: clock.now(),
    lifecycleState: { kind: 'submitted' },
    transactionReference: references[0],
  });

  return { kind: 'submitted', attemptId, references };
}
```

- [ ] **Step 6.4: Run — PASS**

```bash
pnpm --filter @clmm/application test
```

- [ ] **Step 6.5: Write and implement ReconcileExecutionAttempt**

`packages/application/src/use-cases/execution/ReconcileExecutionAttempt.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { reconcileExecutionAttempt } from './ReconcileExecutionAttempt.js';
import {
  FakeClockPort,
  FakeIdGeneratorPort,
  FakeExecutionRepository,
  FakeExecutionSubmissionPort,
  FakeExecutionHistoryRepository,
  FIXTURE_POSITION_ID,
} from '@clmm/testing';
import { LOWER_BOUND_BREACH } from '@clmm/domain';

describe('ReconcileExecutionAttempt', () => {
  let clock: FakeClockPort;
  let ids: FakeIdGeneratorPort;
  let executionRepo: FakeExecutionRepository;
  let submissionPort: FakeExecutionSubmissionPort;
  let historyRepo: FakeExecutionHistoryRepository;

  beforeEach(async () => {
    clock = new FakeClockPort();
    ids = new FakeIdGeneratorPort();
    executionRepo = new FakeExecutionRepository();
    submissionPort = new FakeExecutionSubmissionPort();
    historyRepo = new FakeExecutionHistoryRepository();

    await executionRepo.saveAttempt({
      attemptId: 'attempt-1',
      positionId: FIXTURE_POSITION_ID,
      lifecycleState: { kind: 'submitted' },
      completedSteps: [],
      transactionReferences: [{ signature: 'sig-1', stepKind: 'remove-liquidity' }],
    });
  });

  it('marks attempt as confirmed when all steps reconcile', async () => {
    submissionPort.setConfirmedSteps(['remove-liquidity', 'collect-fees', 'swap-assets']);
    const result = await reconcileExecutionAttempt({
      attemptId: 'attempt-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      executionRepo,
      submissionPort,
      historyRepo,
      clock,
      ids,
    });
    expect(result.kind).toBe('confirmed');
  });

  it('marks as partial when some (not all) steps confirm', async () => {
    submissionPort.setConfirmedSteps(['remove-liquidity']);
    const result = await reconcileExecutionAttempt({
      attemptId: 'attempt-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      executionRepo,
      submissionPort,
      historyRepo,
      clock,
      ids,
    });
    expect(result.kind).toBe('partial');
  });

  it('preserves directional context in history events', async () => {
    submissionPort.setConfirmedSteps(['remove-liquidity', 'collect-fees', 'swap-assets']);
    await reconcileExecutionAttempt({
      attemptId: 'attempt-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      executionRepo,
      submissionPort,
      historyRepo,
      clock,
      ids,
    });
    const confirmedEvent = historyRepo.events.find((e) => e.eventType === 'confirmed');
    expect(confirmedEvent?.breachDirection.kind).toBe('lower-bound-breach');
  });
});
```

`packages/application/src/use-cases/execution/ReconcileExecutionAttempt.ts`:
```typescript
import type {
  ExecutionRepository,
  ExecutionSubmissionPort,
  ExecutionHistoryRepository,
  ClockPort,
  IdGeneratorPort,
} from '../../ports/index.js';
import type { PositionId, BreachDirection } from '@clmm/domain';

export type ReconcileResult =
  | { kind: 'confirmed' }
  | { kind: 'partial'; confirmedSteps: string[] }
  | { kind: 'failed' }
  | { kind: 'pending' };

export async function reconcileExecutionAttempt(params: {
  attemptId: string;
  positionId: PositionId;
  breachDirection: BreachDirection;
  executionRepo: ExecutionRepository;
  submissionPort: ExecutionSubmissionPort;
  historyRepo: ExecutionHistoryRepository;
  clock: ClockPort;
  ids: IdGeneratorPort;
}): Promise<ReconcileResult> {
  const { attemptId, positionId, breachDirection, executionRepo, submissionPort, historyRepo, clock, ids } = params;

  const attempt = await executionRepo.getAttempt(attemptId);
  if (!attempt) throw new Error(`Attempt not found: ${attemptId}`);

  const { confirmedSteps, finalState } = await submissionPort.reconcileExecution(
    attempt.transactionReferences,
  );

  if (!finalState) {
    return { kind: 'pending' };
  }

  await executionRepo.updateAttemptState(attemptId, finalState);

  const eventType =
    finalState.kind === 'confirmed' ? 'confirmed' :
    finalState.kind === 'partial' ? 'partial-completion' : 'failed';

  await historyRepo.appendEvent({
    eventId: ids.generateId(),
    positionId,
    eventType,
    breachDirection,
    occurredAt: clock.now(),
    lifecycleState: finalState,
  });

  if (finalState.kind === 'confirmed') return { kind: 'confirmed' };
  if (finalState.kind === 'partial') return { kind: 'partial', confirmedSteps };
  return { kind: 'failed' };
}
```

- [ ] **Step 6.6: Run — PASS**

```bash
pnpm --filter @clmm/application test
```

- [ ] **Step 6.7: Commit**

```bash
git add packages/application/src/use-cases/execution/
git commit -m "feat(application): ApproveExecution + ReconcileExecutionAttempt (TDD)

- Decline recorded as abandoned (never autonomous)
- Partial reconciliation preserved — no blind retry
- Directional context in all history events"
```

---

## Task 7: Notification Use Case (TDD)

**Files:**
- Create: `packages/application/src/use-cases/notifications/DispatchActionableNotification.ts`
- Create: `packages/application/src/use-cases/notifications/DispatchActionableNotification.test.ts`

- [ ] **Step 7.1: Write failing test**

`packages/application/src/use-cases/notifications/DispatchActionableNotification.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { dispatchActionableNotification } from './DispatchActionableNotification.js';
import {
  FakeNotificationPort,
  FakeTriggerRepository,
  FakeClockPort,
  FakeIdGeneratorPort,
  FIXTURE_POSITION_ID,
  FIXTURE_WALLET_ID,
} from '@clmm/testing';
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH } from '@clmm/domain';
import type { ExitTriggerId } from '@clmm/domain';

const TRIGGER_ID = 'trigger-1' as ExitTriggerId;

describe('DispatchActionableNotification', () => {
  let notificationPort: FakeNotificationPort;
  let clock: FakeClockPort;
  let ids: FakeIdGeneratorPort;

  beforeEach(() => {
    notificationPort = new FakeNotificationPort();
    clock = new FakeClockPort();
    ids = new FakeIdGeneratorPort();
  });

  it('dispatches notification with breach direction for lower-bound trigger', async () => {
    await dispatchActionableNotification({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      triggerId: TRIGGER_ID,
      breachDirection: LOWER_BOUND_BREACH,
      notificationPort,
      clock,
    });
    expect(notificationPort.dispatched).toHaveLength(1);
    expect(notificationPort.dispatched[0]?.breachDirection.kind).toBe('lower-bound-breach');
  });

  it('dispatches notification with breach direction for upper-bound trigger', async () => {
    await dispatchActionableNotification({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      triggerId: TRIGGER_ID,
      breachDirection: UPPER_BOUND_BREACH,
      notificationPort,
      clock,
    });
    expect(notificationPort.dispatched[0]?.breachDirection.kind).toBe('upper-bound-breach');
  });
});
```

- [ ] **Step 7.2: Run — FAIL**

```bash
pnpm --filter @clmm/application test
```

- [ ] **Step 7.3: Implement**

`packages/application/src/use-cases/notifications/DispatchActionableNotification.ts`:
```typescript
import type { NotificationPort, ClockPort } from '../../ports/index.js';
import type { WalletId, PositionId, BreachDirection, ExitTriggerId } from '@clmm/domain';

export async function dispatchActionableNotification(params: {
  walletId: WalletId;
  positionId: PositionId;
  triggerId: ExitTriggerId;
  breachDirection: BreachDirection;
  notificationPort: NotificationPort;
  clock: ClockPort;
}): Promise<void> {
  const { walletId, positionId, triggerId, breachDirection, notificationPort } = params;
  await notificationPort.sendActionableAlert({
    walletId,
    positionId,
    breachDirection,
    triggerId,
  });
}
```

- [ ] **Step 7.4: Run — PASS**

```bash
pnpm --filter @clmm/application test
```

- [ ] **Step 7.5: Commit**

```bash
git add packages/application/src/use-cases/notifications/
git commit -m "feat(application): DispatchActionableNotification (TDD)"
```

---

## Task 8: Public Facade + Application Barrel

**Files:**
- Modify: `packages/application/src/public/index.ts`
- Modify: `packages/application/src/index.ts`

- [ ] **Step 8.1: Write public facade (UI-only surface)**

`packages/application/src/public/index.ts`:
```typescript
// This is the ONLY import surface for packages/ui.
// Do not add implementation details here.

// DTOs
export type {
  PositionSummaryDto,
  PositionDetailDto,
  ExecutionPreviewDto,
  PreviewStepDto,
  ExecutionAttemptDto,
  ActionableAlertDto,
  HistoryEventDto,
  MonitoringReadinessDto,
  EntryContextDto,
} from '../dto/index.js';

// Port types needed by UI (capability + permission state)
export type { PlatformCapabilityState } from '../ports/index.js';
```

`packages/application/src/index.ts`:
```typescript
// Application internal API — used by packages/adapters and packages/testing
export * from './ports/index.js';
export * from './dto/index.js';
export * from './use-cases/triggers/ScanPositionsForBreaches.js';
export * from './use-cases/triggers/QualifyActionableTrigger.js';
export * from './use-cases/previews/CreateExecutionPreview.js';
export * from './use-cases/previews/RefreshExecutionPreview.js';
export * from './use-cases/execution/ApproveExecution.js';
export * from './use-cases/execution/ReconcileExecutionAttempt.js';
export * from './use-cases/notifications/DispatchActionableNotification.js';
```

- [ ] **Step 8.2: Typecheck application package**

```bash
pnpm --filter @clmm/application typecheck
```

Expected: exits 0.

- [ ] **Step 8.3: Verify boundaries — no external SDKs in application**

```bash
pnpm boundaries
```

Expected: exits 0.

- [ ] **Step 8.4: Run all tests**

```bash
pnpm test
```

Expected: all pass.

- [ ] **Step 8.5: Commit**

```bash
git add packages/application/src/public/ packages/application/src/index.ts
git commit -m "feat(application): complete application layer — ports, DTOs, use cases, public facade

Epic 3 complete: all use cases tested with fake ports, directional invariant preserved throughout"
```

---

## Epic 3 Done-When

- [ ] `pnpm --filter @clmm/application test` passes
- [ ] `pnpm boundaries` passes — application imports no Solana SDK, React, RN, Expo
- [ ] `CreateExecutionPreview` with `LOWER_BOUND_BREACH` → `exit-to-usdc` + `SOL→USDC`
- [ ] `CreateExecutionPreview` with `UPPER_BOUND_BREACH` → `exit-to-sol` + `USDC→SOL`
- [ ] `ApproveExecution` decline path records `abandoned` — never autonomous
- [ ] `ReconcileExecutionAttempt` partial state → no blind retry
- [ ] All history events carry `breachDirection`
- [ ] `packages/ui` can import only from `packages/application/public`
