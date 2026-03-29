# CLMM V2 Epic Review Remediation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the CLMM V2 codebase from ~75% spec compliance to full compliance by fixing 2 CI blockers, 2 behavioral bugs, implementing 9 missing application use cases, adding 6 missing fakes + 2 fixture files, creating 12+ use-case tests, building 9 missing UI components, completing the adapters barrel, and verifying all CI gates pass.

**Architecture:** Hexagonal (ports-and-adapters). Domain is pure with zero external deps. Application layer defines ports and use cases. Adapters implement ports. UI consumes only `@clmm/application/public` DTOs. All changes follow the existing pattern of functional use cases taking port dependencies as params.

**Tech Stack:** TypeScript strict mode, Vitest, pnpm workspaces, Turborepo, React Native 0.74, Expo SDK 52, NestJS 10, Drizzle ORM, @solana/kit

---

## File Map

### Phase 1: CI Green (4 files modified)
- Modify: `packages/testing/src/fakes/FakeExecutionRepository.ts` — remove unused import
- Modify: `apps/app/package.json` — add `react-native-web`
- Modify: `packages/adapters/package.json` — add `drizzle-orm`, `postgres`
- Modify: `packages/application/package.json` — add `@clmm/testing` devDep

### Phase 2: Behavioral Bug Fixes (2 files modified)
- Modify: `packages/ui/src/view-models/ExecutionStateViewModel.ts` — fix `abandoned` + `partial` isTerminal, fix `showRetry` logic
- Modify: `packages/ui/src/view-models/ExecutionStateViewModel.test.ts` — update assertions

### Phase 3: Missing Fakes & Fixtures (9 files created, 2 modified)
- Create: `packages/testing/src/fakes/FakeRangeObservationPort.ts`
- Create: `packages/testing/src/fakes/FakeDeepLinkEntryPort.ts`
- Create: `packages/testing/src/fakes/FakeExecutionSessionRepository.ts`
- Create: `packages/testing/src/fakes/FakePlatformCapabilityPort.ts`
- Create: `packages/testing/src/fakes/FakeNotificationPermissionPort.ts`
- Create: `packages/testing/src/fakes/FakeObservabilityPort.ts`
- Create: `packages/testing/src/fixtures/triggers.ts`
- Create: `packages/testing/src/fixtures/previews.ts`
- Modify: `packages/testing/src/fakes/index.ts` — add new fakes
- Modify: `packages/testing/src/fixtures/index.ts` — add new fixtures

### Phase 4: Missing Application Use Cases (9 files created, 2 modified)
- Create: `packages/application/src/use-cases/positions/GetPositionDetail.ts`
- Create: `packages/application/src/use-cases/positions/GetMonitoringReadiness.ts`
- Create: `packages/application/src/use-cases/wallet/ConnectWalletSession.ts`
- Create: `packages/application/src/use-cases/wallet/SyncPlatformCapabilities.ts`
- Create: `packages/application/src/use-cases/execution/ResolveExecutionEntryContext.ts`
- Create: `packages/application/src/use-cases/execution/RequestWalletSignature.ts`
- Create: `packages/application/src/use-cases/execution/SubmitExecutionAttempt.ts`
- Create: `packages/application/src/use-cases/execution/RecordSignatureDecline.ts`
- Create: `packages/application/src/use-cases/execution/ResumeExecutionAttempt.ts`
- Modify: `packages/application/src/index.ts` — add new use case exports
- Modify: `packages/application/src/public/index.ts` — add new public DTOs if needed

### Phase 5: Application Tests (12 files created, 1 modified)
- Create: `packages/testing/src/scenarios/GetPositionDetail.test.ts`
- Create: `packages/testing/src/scenarios/GetMonitoringReadiness.test.ts`
- Create: `packages/testing/src/scenarios/ConnectWalletSession.test.ts`
- Create: `packages/testing/src/scenarios/SyncPlatformCapabilities.test.ts`
- Create: `packages/testing/src/scenarios/ResolveExecutionEntryContext.test.ts`
- Create: `packages/testing/src/scenarios/RequestWalletSignature.test.ts`
- Create: `packages/testing/src/scenarios/SubmitExecutionAttempt.test.ts`
- Create: `packages/testing/src/scenarios/RecordSignatureDecline.test.ts`
- Create: `packages/testing/src/scenarios/ResumeExecutionAttempt.test.ts`
- Create: `packages/testing/src/scenarios/DispatchActionableNotification-dedup.test.ts`
- Create: `packages/testing/src/scenarios/ApproveExecution-interrupt.test.ts`
- Create: `packages/testing/src/scenarios/RecordExecutionAbandonment-terminal.test.ts`
- Modify: `packages/testing/src/scenarios/index.ts` — add new test exports

### Phase 6: Missing UI Components (11 files created, 2 modified)
- Create: `packages/ui/src/design-system/typography.ts`
- Create: `packages/ui/src/components/RangeStatusBadge.tsx`
- Create: `packages/ui/src/components/RangeStatusBadge.test.ts`
- Create: `packages/ui/src/components/ExecutionStateCard.tsx`
- Create: `packages/ui/src/components/HistoryEventRow.tsx`
- Create: `packages/ui/src/view-models/PositionListViewModel.ts`
- Create: `packages/ui/src/view-models/PositionDetailViewModel.ts`
- Create: `packages/ui/src/view-models/HistoryViewModel.ts`
- Create: `packages/ui/src/presenters/PositionDetailPresenter.ts`
- Create: `packages/ui/src/presenters/PreviewPresenter.ts`
- Modify: `packages/ui/src/design-system/index.ts` — add typography export
- Modify: `packages/ui/src/index.ts` — add new component/view-model exports

### Phase 7: Adapter Barrel Completeness (1 file modified)
- Modify: `packages/adapters/src/index.ts` — export all client-facing adapters

---

## Task 1: Fix Lint Failure — Remove Unused Import

**Files:**
- Modify: `packages/testing/src/fakes/FakeExecutionRepository.ts:5`

- [ ] **Step 1: Remove unused `ExecutionAttempt` import**

In `packages/testing/src/fakes/FakeExecutionRepository.ts`, change the import block:

```typescript
// BEFORE (line 3-8):
import type {
  BreachDirection,
  ExecutionPreview,
  ExecutionAttempt,
  ExecutionLifecycleState,
  PositionId,
} from '@clmm/domain';

// AFTER:
import type {
  BreachDirection,
  ExecutionPreview,
  ExecutionLifecycleState,
  PositionId,
} from '@clmm/domain';
```

- [ ] **Step 2: Verify lint passes**

Run: `pnpm --filter @clmm/testing lint`

Expected: Exit 0, zero errors.

- [ ] **Step 3: Commit**

```bash
git add packages/testing/src/fakes/FakeExecutionRepository.ts
git commit -m "fix: remove unused ExecutionAttempt import to fix lint failure"
```

---

## Task 2: Fix Build Failure — Add Missing Dependencies

**Files:**
- Modify: `apps/app/package.json`
- Modify: `packages/adapters/package.json`
- Modify: `packages/application/package.json`

- [ ] **Step 1: Add `react-native-web` to apps/app**

In `apps/app/package.json`, add to the `dependencies` object:

```json
"react-native-web": "~0.19.13"
```

Place it after `"react-native": "0.74.0"` alphabetically.

- [ ] **Step 2: Add `drizzle-orm` and `postgres` to adapters runtime deps**

In `packages/adapters/package.json`, add to the `dependencies` object:

```json
"drizzle-orm": "^0.36.0",
"postgres": "^3.4.0"
```

Place them alphabetically within dependencies (after `@solana/kit`, before `expo-notifications`).

- [ ] **Step 3: Add `@clmm/testing` as devDependency to application**

In `packages/application/package.json`, add to `devDependencies`:

```json
"@clmm/testing": "workspace:*"
```

Place it after `"@clmm/config"`.

- [ ] **Step 4: Install dependencies**

Run: `pnpm install`

Expected: Clean install, lockfile updated.

- [ ] **Step 5: Verify build passes**

Run: `pnpm build`

Expected: Exit 0, all packages including `@clmm/app` succeed.

- [ ] **Step 6: Commit**

```bash
git add apps/app/package.json packages/adapters/package.json packages/application/package.json pnpm-lock.yaml
git commit -m "fix: add missing runtime dependencies (react-native-web, drizzle-orm, postgres, @clmm/testing)"
```

---

## Task 3: Fix ExecutionStateViewModel Behavioral Bugs

**Files:**
- Modify: `packages/ui/src/view-models/ExecutionStateViewModel.ts`
- Modify: `packages/ui/src/view-models/ExecutionStateViewModel.test.ts`

- [ ] **Step 1: Write the failing tests first**

In `packages/ui/src/view-models/ExecutionStateViewModel.test.ts`, replace the file contents with:

```typescript
import { describe, it, expect } from 'vitest';
import { buildExecutionStateViewModel } from './ExecutionStateViewModel.js';
import type { ExecutionLifecycleState } from '@clmm/domain';

function makeState(kind: ExecutionLifecycleState['kind']): ExecutionLifecycleState {
  return { kind } as ExecutionLifecycleState;
}

describe('ExecutionStateViewModel', () => {
  it.each([
    ['confirmed', 'Transaction confirmed', true, false],
    ['submitted', 'Submitted — awaiting confirmation', false, false],
    ['partial', 'Partial completion — some steps confirmed', true, false],
    ['abandoned', 'You declined to sign', true, false],
  ] as Array<[string, string, boolean, boolean]>)(
    '%s state: title=%s, isTerminal=%s, showRetry=%s',
    (kind, expectedTitle, isTerminal, showRetry) => {
      const vm = buildExecutionStateViewModel(makeState(kind as ExecutionLifecycleState['kind']), false);
      expect(vm.title).toBe(expectedTitle);
      expect(vm.isTerminal).toBe(isTerminal);
      expect(vm.showRetry).toBe(showRetry);
    },
  );

  it('failed state with retryEligible=true shows retry', () => {
    const vm = buildExecutionStateViewModel(makeState('failed'), true);
    expect(vm.isTerminal).toBe(false);
    expect(vm.showRetry).toBe(true);
    expect(vm.nextAction).toBe('Refresh preview and retry');
  });

  it('failed state with retryEligible=false does NOT show retry', () => {
    const vm = buildExecutionStateViewModel(makeState('failed'), false);
    expect(vm.isTerminal).toBe(false);
    expect(vm.showRetry).toBe(false);
  });

  it('expired state with retryEligible=true shows retry', () => {
    const vm = buildExecutionStateViewModel(makeState('expired'), true);
    expect(vm.isTerminal).toBe(false);
    expect(vm.showRetry).toBe(true);
    expect(vm.nextAction).toBe('Refresh preview');
  });

  it('expired state with retryEligible=false does NOT show retry', () => {
    const vm = buildExecutionStateViewModel(makeState('expired'), false);
    expect(vm.isTerminal).toBe(false);
    expect(vm.showRetry).toBe(false);
  });

  it('partial state NEVER shows retry — explicitly disabled', () => {
    const vm = buildExecutionStateViewModel(makeState('partial'), true);
    expect(vm.showRetry).toBe(false);
    expect(vm.isTerminal).toBe(true);
    expect(vm.partialCompletionWarning).toBeTruthy();
  });

  it('submission ≠ confirmation — submitted state does not say confirmed', () => {
    const vm = buildExecutionStateViewModel(makeState('submitted'), false);
    expect(vm.title.toLowerCase()).not.toContain('confirmed');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @clmm/ui test`

Expected: FAIL — `abandoned` expects `isTerminal: true` but gets `false`; `partial` expects `isTerminal: true` but gets `false`; `failed` with `retryEligible=false` expects `showRetry: false` but gets `true`.

- [ ] **Step 3: Fix the implementation**

In `packages/ui/src/view-models/ExecutionStateViewModel.ts`, replace the file contents with:

```typescript
import type { ExecutionLifecycleState } from '@clmm/domain';

export type ExecutionStateViewModel = {
  title: string;
  subtitle: string;
  isTerminal: boolean;
  showRetry: boolean;
  nextAction?: string;
  partialCompletionWarning?: string;
};

export function buildExecutionStateViewModel(
  state: ExecutionLifecycleState,
  retryEligible: boolean,
): ExecutionStateViewModel {
  switch (state.kind) {
    case 'previewed':
      return { title: 'Preview ready', subtitle: 'Review and sign to proceed', isTerminal: false, showRetry: false };
    case 'awaiting-signature':
      return { title: 'Awaiting your signature', subtitle: 'Wallet approval required', isTerminal: false, showRetry: false };
    case 'submitted':
      return {
        title: 'Submitted — awaiting confirmation',
        subtitle: 'Transaction sent. Waiting for on-chain confirmation.',
        isTerminal: false,
        showRetry: false,
      };
    case 'confirmed':
      return { title: 'Transaction confirmed', subtitle: 'Exit complete.', isTerminal: true, showRetry: false };
    case 'failed':
      return {
        title: 'Transaction failed',
        subtitle: 'No on-chain step was confirmed.',
        isTerminal: false,
        showRetry: retryEligible,
        ...(retryEligible ? { nextAction: 'Refresh preview and retry' } : {}),
      };
    case 'expired':
      return {
        title: 'Preview expired',
        subtitle: 'Quote expired before signing.',
        isTerminal: false,
        showRetry: retryEligible,
        ...(retryEligible ? { nextAction: 'Refresh preview' } : {}),
      };
    case 'abandoned':
      return { title: 'You declined to sign', subtitle: 'Exit was not executed.', isTerminal: true, showRetry: false };
    case 'partial':
      return {
        title: 'Partial completion — some steps confirmed',
        subtitle: 'One or more steps completed on-chain but the sequence did not finish.',
        isTerminal: true,
        showRetry: false,
        partialCompletionWarning:
          'Full replay is not available. Please review completed steps before taking action.',
        nextAction: 'Contact support or review history',
      };
    default: {
      const _exhaustive: never = state;
      throw new Error(`Unhandled lifecycle state: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
```

Key changes:
- `abandoned`: `isTerminal: true` (was `false`) — abandoned is a terminal state per the domain state machine
- `partial`: `isTerminal: true` (was `false`) — partial is terminal for retry purposes per the domain state machine
- `failed`: `showRetry: retryEligible` (was unconditional `true`) — respects the parameter
- `expired`: `showRetry: retryEligible` (was unconditional `true`) — respects the parameter

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @clmm/ui test`

Expected: Exit 0, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/view-models/ExecutionStateViewModel.ts packages/ui/src/view-models/ExecutionStateViewModel.test.ts
git commit -m "fix: correct ExecutionStateViewModel behavioral bugs — abandoned/partial are terminal, showRetry respects retryEligible"
```

---

## Task 4: Create Missing Fakes

**Files:**
- Create: `packages/testing/src/fakes/FakeRangeObservationPort.ts`
- Create: `packages/testing/src/fakes/FakeDeepLinkEntryPort.ts`
- Create: `packages/testing/src/fakes/FakeExecutionSessionRepository.ts`
- Create: `packages/testing/src/fakes/FakePlatformCapabilityPort.ts`
- Create: `packages/testing/src/fakes/FakeNotificationPermissionPort.ts`
- Create: `packages/testing/src/fakes/FakeObservabilityPort.ts`
- Modify: `packages/testing/src/fakes/index.ts`

- [ ] **Step 1: Create FakeRangeObservationPort**

Create `packages/testing/src/fakes/FakeRangeObservationPort.ts`:

```typescript
import type { RangeObservationPort } from '@clmm/application';
import type { PositionId, ClockTimestamp } from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';

export class FakeRangeObservationPort implements RangeObservationPort {
  private _observations = new Map<string, { currentPrice: number }>();

  setObservation(positionId: PositionId, currentPrice: number): void {
    this._observations.set(positionId, { currentPrice });
  }

  async observeRangeState(positionId: PositionId): Promise<{
    positionId: PositionId;
    currentPrice: number;
    observedAt: ClockTimestamp;
  }> {
    const obs = this._observations.get(positionId);
    if (!obs) {
      throw new Error(`FakeRangeObservationPort: no observation set for ${positionId}`);
    }
    return {
      positionId,
      currentPrice: obs.currentPrice,
      observedAt: makeClockTimestamp(Date.now()),
    };
  }
}
```

- [ ] **Step 2: Create FakeDeepLinkEntryPort**

Create `packages/testing/src/fakes/FakeDeepLinkEntryPort.ts`:

```typescript
import type { DeepLinkEntryPort, DeepLinkMetadata } from '@clmm/application';

export class FakeDeepLinkEntryPort implements DeepLinkEntryPort {
  private _nextResult: DeepLinkMetadata = { kind: 'unknown' };

  setNextResult(metadata: DeepLinkMetadata): void {
    this._nextResult = metadata;
  }

  parseDeepLink(_url: string): DeepLinkMetadata {
    return this._nextResult;
  }
}
```

- [ ] **Step 3: Create FakeExecutionSessionRepository**

Create `packages/testing/src/fakes/FakeExecutionSessionRepository.ts`:

```typescript
import type { ExecutionSessionRepository } from '@clmm/application';
import type { WalletId, PositionId, ClockTimestamp } from '@clmm/domain';

type StoredSession = {
  attemptId: string;
  walletId: WalletId;
  positionId: PositionId;
};

export class FakeExecutionSessionRepository implements ExecutionSessionRepository {
  readonly sessions = new Map<string, StoredSession>();

  async saveSession(params: {
    sessionId: string;
    attemptId: string;
    walletId: WalletId;
    positionId: PositionId;
    createdAt: ClockTimestamp;
  }): Promise<void> {
    this.sessions.set(params.sessionId, {
      attemptId: params.attemptId,
      walletId: params.walletId,
      positionId: params.positionId,
    });
  }

  async getSession(sessionId: string): Promise<StoredSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
}
```

- [ ] **Step 4: Create FakePlatformCapabilityPort**

Create `packages/testing/src/fakes/FakePlatformCapabilityPort.ts`:

```typescript
import type { PlatformCapabilityPort, PlatformCapabilityState } from '@clmm/application';

export class FakePlatformCapabilityPort implements PlatformCapabilityPort {
  private _capabilities: PlatformCapabilityState = {
    nativePushAvailable: true,
    browserNotificationAvailable: false,
    nativeWalletAvailable: true,
    browserWalletAvailable: false,
    isMobileWeb: false,
  };

  setCapabilities(capabilities: Partial<PlatformCapabilityState>): void {
    this._capabilities = { ...this._capabilities, ...capabilities };
  }

  async getCapabilities(): Promise<PlatformCapabilityState> {
    return { ...this._capabilities };
  }
}
```

- [ ] **Step 5: Create FakeNotificationPermissionPort**

Create `packages/testing/src/fakes/FakeNotificationPermissionPort.ts`:

```typescript
import type { NotificationPermissionPort } from '@clmm/application';

export class FakeNotificationPermissionPort implements NotificationPermissionPort {
  private _state: 'granted' | 'denied' | 'undetermined' = 'undetermined';
  private _requestResult: 'granted' | 'denied' = 'granted';

  setState(state: 'granted' | 'denied' | 'undetermined'): void {
    this._state = state;
  }

  setRequestResult(result: 'granted' | 'denied'): void {
    this._requestResult = result;
  }

  async getPermissionState(): Promise<'granted' | 'denied' | 'undetermined'> {
    return this._state;
  }

  async requestPermission(): Promise<'granted' | 'denied'> {
    this._state = this._requestResult;
    return this._requestResult;
  }
}
```

- [ ] **Step 6: Create FakeObservabilityPort**

Create `packages/testing/src/fakes/FakeObservabilityPort.ts`:

```typescript
import type { ObservabilityPort } from '@clmm/application';

export class FakeObservabilityPort implements ObservabilityPort {
  readonly logs: Array<{ level: string; message: string; context?: Record<string, unknown> }> = [];
  readonly timings: Array<{ event: string; durationMs: number; tags?: Record<string, string> }> = [];

  log(level: 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>): void {
    this.logs.push({ level, message, context });
  }

  recordTiming(event: string, durationMs: number, tags?: Record<string, string>): void {
    this.timings.push({ event, durationMs, tags });
  }
}
```

- [ ] **Step 7: Update fakes barrel**

Replace `packages/testing/src/fakes/index.ts` with:

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
export { FakeRangeObservationPort } from './FakeRangeObservationPort.js';
export { FakeDeepLinkEntryPort } from './FakeDeepLinkEntryPort.js';
export { FakeExecutionSessionRepository } from './FakeExecutionSessionRepository.js';
export { FakePlatformCapabilityPort } from './FakePlatformCapabilityPort.js';
export { FakeNotificationPermissionPort } from './FakeNotificationPermissionPort.js';
export { FakeObservabilityPort } from './FakeObservabilityPort.js';
```

- [ ] **Step 8: Verify typecheck passes**

Run: `pnpm --filter @clmm/testing typecheck`

Expected: Exit 0.

- [ ] **Step 9: Commit**

```bash
git add packages/testing/src/fakes/
git commit -m "feat: add 6 missing fake ports (RangeObservation, DeepLink, ExecutionSession, PlatformCapability, NotificationPermission, Observability)"
```

---

## Task 5: Create Missing Fixtures

**Files:**
- Create: `packages/testing/src/fixtures/triggers.ts`
- Create: `packages/testing/src/fixtures/previews.ts`
- Modify: `packages/testing/src/fixtures/index.ts`

- [ ] **Step 1: Create trigger fixtures**

Create `packages/testing/src/fixtures/triggers.ts`:

```typescript
import type { ExitTrigger, BreachEpisode } from '@clmm/domain';
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH, makeClockTimestamp } from '@clmm/domain';
import { FIXTURE_POSITION_ID } from './positions.js';

export const FIXTURE_BREACH_EPISODE_ID = 'fixture-episode-1' as string & { readonly _brand: 'BreachEpisodeId' };
export const FIXTURE_EXIT_TRIGGER_ID = 'fixture-trigger-1' as string & { readonly _brand: 'ExitTriggerId' };

export const FIXTURE_LOWER_BREACH_EPISODE: BreachEpisode = {
  episodeId: FIXTURE_BREACH_EPISODE_ID,
  positionId: FIXTURE_POSITION_ID,
  direction: LOWER_BOUND_BREACH,
  startedAt: makeClockTimestamp(1_000_000),
  lastObservedAt: makeClockTimestamp(1_003_000),
  activeTriggerId: FIXTURE_EXIT_TRIGGER_ID,
};

export const FIXTURE_LOWER_EXIT_TRIGGER: ExitTrigger = {
  triggerId: FIXTURE_EXIT_TRIGGER_ID,
  positionId: FIXTURE_POSITION_ID,
  breachDirection: LOWER_BOUND_BREACH,
  triggeredAt: makeClockTimestamp(1_003_000),
  confirmationEvaluatedAt: makeClockTimestamp(1_003_000),
  confirmationPassed: true,
  episodeId: FIXTURE_BREACH_EPISODE_ID,
};

export const FIXTURE_UPPER_EXIT_TRIGGER: ExitTrigger = {
  triggerId: 'fixture-trigger-2' as string & { readonly _brand: 'ExitTriggerId' },
  positionId: FIXTURE_POSITION_ID,
  breachDirection: UPPER_BOUND_BREACH,
  triggeredAt: makeClockTimestamp(1_003_000),
  confirmationEvaluatedAt: makeClockTimestamp(1_003_000),
  confirmationPassed: true,
  episodeId: 'fixture-episode-2' as string & { readonly _brand: 'BreachEpisodeId' },
};
```

- [ ] **Step 2: Create preview fixtures**

Create `packages/testing/src/fixtures/previews.ts`:

```typescript
import type { ExecutionPreview, ExecutionPlan } from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';

export const FIXTURE_LOWER_EXECUTION_PLAN: ExecutionPlan = {
  steps: [
    { kind: 'remove-liquidity' },
    { kind: 'collect-fees' },
    { kind: 'swap-assets', instruction: { fromAsset: 'SOL', toAsset: 'USDC', policyReason: 'Lower bound breach → exit to USDC' } },
  ],
  postExitPosture: { kind: 'exit-to-usdc' },
  swapInstruction: { fromAsset: 'SOL', toAsset: 'USDC', policyReason: 'Lower bound breach → exit to USDC' },
};

export const FIXTURE_UPPER_EXECUTION_PLAN: ExecutionPlan = {
  steps: [
    { kind: 'remove-liquidity' },
    { kind: 'collect-fees' },
    { kind: 'swap-assets', instruction: { fromAsset: 'USDC', toAsset: 'SOL', policyReason: 'Upper bound breach → exit to SOL' } },
  ],
  postExitPosture: { kind: 'exit-to-sol' },
  swapInstruction: { fromAsset: 'USDC', toAsset: 'SOL', policyReason: 'Upper bound breach → exit to SOL' },
};

export const FIXTURE_FRESH_PREVIEW: ExecutionPreview = {
  plan: FIXTURE_LOWER_EXECUTION_PLAN,
  freshness: { kind: 'fresh', expiresAt: Date.now() + 30_000 },
  estimatedAt: Date.now(),
};

export const FIXTURE_STALE_PREVIEW: ExecutionPreview = {
  plan: FIXTURE_LOWER_EXECUTION_PLAN,
  freshness: { kind: 'stale' },
  estimatedAt: Date.now() - 60_000,
};

export const FIXTURE_EXPIRED_PREVIEW: ExecutionPreview = {
  plan: FIXTURE_LOWER_EXECUTION_PLAN,
  freshness: { kind: 'expired' },
  estimatedAt: Date.now() - 120_000,
};
```

- [ ] **Step 3: Update fixtures barrel**

Replace `packages/testing/src/fixtures/index.ts` with:

```typescript
export * from './positions.js';
export * from './triggers.js';
export * from './previews.js';
```

- [ ] **Step 4: Verify typecheck passes**

Run: `pnpm --filter @clmm/testing typecheck`

Expected: Exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/testing/src/fixtures/
git commit -m "feat: add trigger and preview fixture data for testing"
```

---

## Task 6: Implement GetPositionDetail Use Case

**Files:**
- Create: `packages/application/src/use-cases/positions/GetPositionDetail.ts`
- Create: `packages/testing/src/scenarios/GetPositionDetail.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/testing/src/scenarios/GetPositionDetail.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getPositionDetail } from '@clmm/application';
import {
  FakeSupportedPositionReadPort,
  FIXTURE_POSITION_ID,
  FIXTURE_POSITION_IN_RANGE,
} from '@clmm/testing';
import { makePositionId } from '@clmm/domain';

describe('GetPositionDetail', () => {
  it('returns position when found', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE]);
    const result = await getPositionDetail({
      positionId: FIXTURE_POSITION_ID,
      positionReadPort,
    });
    expect(result.kind).toBe('found');
    if (result.kind === 'found') {
      expect(result.position.positionId).toBe(FIXTURE_POSITION_ID);
      expect(result.position.rangeState.kind).toBe('in-range');
    }
  });

  it('returns not-found when position does not exist', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([]);
    const result = await getPositionDetail({
      positionId: makePositionId('nonexistent'),
      positionReadPort,
    });
    expect(result.kind).toBe('not-found');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @clmm/testing test -- --testPathPattern GetPositionDetail`

Expected: FAIL — `getPositionDetail` is not exported from `@clmm/application`.

- [ ] **Step 3: Implement the use case**

Create `packages/application/src/use-cases/positions/GetPositionDetail.ts`:

```typescript
import type { SupportedPositionReadPort } from '../../ports/index.js';
import type { PositionId, LiquidityPosition } from '@clmm/domain';

export type GetPositionDetailResult =
  | { kind: 'found'; position: LiquidityPosition }
  | { kind: 'not-found' };

export async function getPositionDetail(params: {
  positionId: PositionId;
  positionReadPort: SupportedPositionReadPort;
}): Promise<GetPositionDetailResult> {
  const position = await params.positionReadPort.getPosition(params.positionId);
  if (!position) return { kind: 'not-found' };
  return { kind: 'found', position };
}
```

- [ ] **Step 4: Add export to application barrel**

In `packages/application/src/index.ts`, add after the existing positions export:

```typescript
export * from './use-cases/positions/GetPositionDetail.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @clmm/testing test -- --testPathPattern GetPositionDetail`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/application/src/use-cases/positions/GetPositionDetail.ts packages/application/src/index.ts packages/testing/src/scenarios/GetPositionDetail.test.ts
git commit -m "feat: implement GetPositionDetail use case with tests"
```

---

## Task 7: Implement GetMonitoringReadiness Use Case

**Files:**
- Create: `packages/application/src/use-cases/positions/GetMonitoringReadiness.ts`
- Create: `packages/testing/src/scenarios/GetMonitoringReadiness.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/testing/src/scenarios/GetMonitoringReadiness.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getMonitoringReadiness } from '@clmm/application';
import {
  FakeNotificationPermissionPort,
  FakePlatformCapabilityPort,
} from '@clmm/testing';

describe('GetMonitoringReadiness', () => {
  it('returns full readiness when all capabilities available', async () => {
    const permissionPort = new FakeNotificationPermissionPort();
    permissionPort.setState('granted');
    const capabilityPort = new FakePlatformCapabilityPort();

    const result = await getMonitoringReadiness({ permissionPort, capabilityPort });

    expect(result.notificationPermission).toBe('granted');
    expect(result.monitoringActive).toBe(true);
    expect(result.platformCapabilities.nativePushAvailable).toBe(true);
  });

  it('returns degraded when notification permission denied', async () => {
    const permissionPort = new FakeNotificationPermissionPort();
    permissionPort.setState('denied');
    const capabilityPort = new FakePlatformCapabilityPort();

    const result = await getMonitoringReadiness({ permissionPort, capabilityPort });

    expect(result.notificationPermission).toBe('denied');
    expect(result.monitoringActive).toBe(false);
  });

  it('returns undetermined when permission not yet requested', async () => {
    const permissionPort = new FakeNotificationPermissionPort();
    const capabilityPort = new FakePlatformCapabilityPort();

    const result = await getMonitoringReadiness({ permissionPort, capabilityPort });

    expect(result.notificationPermission).toBe('undetermined');
    expect(result.monitoringActive).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @clmm/testing test -- --testPathPattern GetMonitoringReadiness`

Expected: FAIL — `getMonitoringReadiness` is not exported from `@clmm/application`.

- [ ] **Step 3: Implement the use case**

Create `packages/application/src/use-cases/positions/GetMonitoringReadiness.ts`:

```typescript
import type { NotificationPermissionPort, PlatformCapabilityPort } from '../../ports/index.js';
import type { MonitoringReadinessDto } from '../../dto/index.js';

export async function getMonitoringReadiness(params: {
  permissionPort: NotificationPermissionPort;
  capabilityPort: PlatformCapabilityPort;
}): Promise<MonitoringReadinessDto> {
  const { permissionPort, capabilityPort } = params;

  const [notificationPermission, platformCapabilities] = await Promise.all([
    permissionPort.getPermissionState(),
    capabilityPort.getCapabilities(),
  ]);

  const monitoringActive = notificationPermission === 'granted';

  return {
    notificationPermission,
    platformCapabilities,
    monitoringActive,
  };
}
```

- [ ] **Step 4: Add export to application barrel**

In `packages/application/src/index.ts`, add after `GetPositionDetail`:

```typescript
export * from './use-cases/positions/GetMonitoringReadiness.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @clmm/testing test -- --testPathPattern GetMonitoringReadiness`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/application/src/use-cases/positions/GetMonitoringReadiness.ts packages/application/src/index.ts packages/testing/src/scenarios/GetMonitoringReadiness.test.ts
git commit -m "feat: implement GetMonitoringReadiness use case with tests"
```

---

## Task 8: Implement ConnectWalletSession Use Case

**Files:**
- Create: `packages/application/src/use-cases/wallet/ConnectWalletSession.ts`
- Create: `packages/testing/src/scenarios/ConnectWalletSession.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/testing/src/scenarios/ConnectWalletSession.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { connectWalletSession } from '@clmm/application';
import {
  FakeWalletSigningPort,
  FakeIdGeneratorPort,
  FakeExecutionSessionRepository,
  FakeClockPort,
  FIXTURE_WALLET_ID,
  FIXTURE_POSITION_ID,
} from '@clmm/testing';

describe('ConnectWalletSession', () => {
  it('creates a new wallet session and returns sessionId', async () => {
    const signingPort = new FakeWalletSigningPort();
    const ids = new FakeIdGeneratorPort();
    const sessionRepo = new FakeExecutionSessionRepository();
    const clock = new FakeClockPort();

    const result = await connectWalletSession({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      signingPort,
      sessionRepo,
      clock,
      ids,
    });

    expect(result.kind).toBe('connected');
    if (result.kind === 'connected') {
      expect(result.sessionId).toBeTruthy();
      const stored = await sessionRepo.getSession(result.sessionId);
      expect(stored).not.toBeNull();
      expect(stored?.walletId).toBe(FIXTURE_WALLET_ID);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @clmm/testing test -- --testPathPattern ConnectWalletSession`

Expected: FAIL — `connectWalletSession` is not exported from `@clmm/application`.

- [ ] **Step 3: Implement the use case**

Create `packages/application/src/use-cases/wallet/ConnectWalletSession.ts`:

```typescript
import type {
  WalletSigningPort,
  ExecutionSessionRepository,
  ClockPort,
  IdGeneratorPort,
} from '../../ports/index.js';
import type { WalletId, PositionId } from '@clmm/domain';

export type ConnectWalletSessionResult =
  | { kind: 'connected'; sessionId: string }
  | { kind: 'failed'; reason: string };

export async function connectWalletSession(params: {
  walletId: WalletId;
  positionId: PositionId;
  signingPort: WalletSigningPort;
  sessionRepo: ExecutionSessionRepository;
  clock: ClockPort;
  ids: IdGeneratorPort;
}): Promise<ConnectWalletSessionResult> {
  const { walletId, positionId, sessionRepo, clock, ids } = params;

  const sessionId = ids.generateId();
  const attemptId = ids.generateId();

  await sessionRepo.saveSession({
    sessionId,
    attemptId,
    walletId,
    positionId,
    createdAt: clock.now(),
  });

  return { kind: 'connected', sessionId };
}
```

- [ ] **Step 4: Add export to application barrel**

In `packages/application/src/index.ts`, add:

```typescript
export * from './use-cases/wallet/ConnectWalletSession.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @clmm/testing test -- --testPathPattern ConnectWalletSession`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/application/src/use-cases/wallet/ConnectWalletSession.ts packages/application/src/index.ts packages/testing/src/scenarios/ConnectWalletSession.test.ts
git commit -m "feat: implement ConnectWalletSession use case with tests"
```

---

## Task 9: Implement SyncPlatformCapabilities Use Case

**Files:**
- Create: `packages/application/src/use-cases/wallet/SyncPlatformCapabilities.ts`
- Create: `packages/testing/src/scenarios/SyncPlatformCapabilities.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/testing/src/scenarios/SyncPlatformCapabilities.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { syncPlatformCapabilities } from '@clmm/application';
import { FakePlatformCapabilityPort } from '@clmm/testing';

describe('SyncPlatformCapabilities', () => {
  it('returns current platform capabilities', async () => {
    const capabilityPort = new FakePlatformCapabilityPort();
    const result = await syncPlatformCapabilities({ capabilityPort });

    expect(result.capabilities.nativePushAvailable).toBe(true);
    expect(result.capabilities.nativeWalletAvailable).toBe(true);
    expect(result.capabilities.browserWalletAvailable).toBe(false);
  });

  it('reflects updated capabilities', async () => {
    const capabilityPort = new FakePlatformCapabilityPort();
    capabilityPort.setCapabilities({ nativePushAvailable: false, isMobileWeb: true });

    const result = await syncPlatformCapabilities({ capabilityPort });

    expect(result.capabilities.nativePushAvailable).toBe(false);
    expect(result.capabilities.isMobileWeb).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @clmm/testing test -- --testPathPattern SyncPlatformCapabilities`

Expected: FAIL.

- [ ] **Step 3: Implement the use case**

Create `packages/application/src/use-cases/wallet/SyncPlatformCapabilities.ts`:

```typescript
import type { PlatformCapabilityPort, PlatformCapabilityState } from '../../ports/index.js';

export type SyncPlatformCapabilitiesResult = {
  capabilities: PlatformCapabilityState;
};

export async function syncPlatformCapabilities(params: {
  capabilityPort: PlatformCapabilityPort;
}): Promise<SyncPlatformCapabilitiesResult> {
  const capabilities = await params.capabilityPort.getCapabilities();
  return { capabilities };
}
```

- [ ] **Step 4: Add export to application barrel**

In `packages/application/src/index.ts`, add:

```typescript
export * from './use-cases/wallet/SyncPlatformCapabilities.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @clmm/testing test -- --testPathPattern SyncPlatformCapabilities`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/application/src/use-cases/wallet/SyncPlatformCapabilities.ts packages/application/src/index.ts packages/testing/src/scenarios/SyncPlatformCapabilities.test.ts
git commit -m "feat: implement SyncPlatformCapabilities use case with tests"
```

---

## Task 10: Implement ResolveExecutionEntryContext Use Case

**Files:**
- Create: `packages/application/src/use-cases/execution/ResolveExecutionEntryContext.ts`
- Create: `packages/testing/src/scenarios/ResolveExecutionEntryContext.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/testing/src/scenarios/ResolveExecutionEntryContext.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolveExecutionEntryContext } from '@clmm/application';
import {
  FakeDeepLinkEntryPort,
  FIXTURE_POSITION_ID,
} from '@clmm/testing';
import type { ExitTriggerId } from '@clmm/domain';

describe('ResolveExecutionEntryContext', () => {
  it('resolves trigger deep link to trigger-preview context', () => {
    const deepLinkPort = new FakeDeepLinkEntryPort();
    const triggerId = 'trigger-1' as ExitTriggerId;
    deepLinkPort.setNextResult({
      kind: 'trigger',
      positionId: FIXTURE_POSITION_ID,
      triggerId,
    });

    const result = resolveExecutionEntryContext({
      url: 'clmmv2://trigger/trigger-1',
      deepLinkPort,
    });

    expect(result.kind).toBe('trigger-preview');
    if (result.kind === 'trigger-preview') {
      expect(result.positionId).toBe(FIXTURE_POSITION_ID);
      expect(result.triggerId).toBe(triggerId);
    }
  });

  it('resolves unknown deep link to degraded-recovery', () => {
    const deepLinkPort = new FakeDeepLinkEntryPort();
    deepLinkPort.setNextResult({ kind: 'unknown' });

    const result = resolveExecutionEntryContext({
      url: 'clmmv2://unknown',
      deepLinkPort,
    });

    expect(result.kind).toBe('degraded-recovery');
  });

  it('resolves history deep link', () => {
    const deepLinkPort = new FakeDeepLinkEntryPort();
    deepLinkPort.setNextResult({
      kind: 'history',
      positionId: FIXTURE_POSITION_ID,
    });

    const result = resolveExecutionEntryContext({
      url: 'clmmv2://history/pos-1',
      deepLinkPort,
    });

    expect(result.kind).toBe('history');
    if (result.kind === 'history') {
      expect(result.positionId).toBe(FIXTURE_POSITION_ID);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @clmm/testing test -- --testPathPattern ResolveExecutionEntryContext`

Expected: FAIL.

- [ ] **Step 3: Implement the use case**

Create `packages/application/src/use-cases/execution/ResolveExecutionEntryContext.ts`:

```typescript
import type { DeepLinkEntryPort } from '../../ports/index.js';
import type { EntryContextDto } from '../../dto/index.js';

export function resolveExecutionEntryContext(params: {
  url: string;
  deepLinkPort: DeepLinkEntryPort;
}): EntryContextDto {
  const { url, deepLinkPort } = params;
  const metadata = deepLinkPort.parseDeepLink(url);

  switch (metadata.kind) {
    case 'trigger':
      if (metadata.positionId && metadata.triggerId) {
        return {
          kind: 'trigger-preview',
          positionId: metadata.positionId,
          triggerId: metadata.triggerId,
        };
      }
      return { kind: 'degraded-recovery', reason: 'Trigger deep link missing required parameters' };

    case 'preview':
      if (metadata.positionId && metadata.triggerId) {
        return {
          kind: 'trigger-preview',
          positionId: metadata.positionId,
          triggerId: metadata.triggerId,
        };
      }
      return { kind: 'degraded-recovery', reason: 'Preview deep link missing required parameters' };

    case 'history':
      if (metadata.positionId) {
        return {
          kind: 'history',
          positionId: metadata.positionId,
        };
      }
      return { kind: 'degraded-recovery', reason: 'History deep link missing positionId' };

    case 'unknown':
      return { kind: 'degraded-recovery', reason: 'Unrecognized deep link format' };

    default: {
      const _exhaustive: never = metadata.kind;
      return { kind: 'degraded-recovery', reason: `Unhandled deep link kind: ${_exhaustive}` };
    }
  }
}
```

- [ ] **Step 4: Add export to application barrel**

In `packages/application/src/index.ts`, add:

```typescript
export * from './use-cases/execution/ResolveExecutionEntryContext.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @clmm/testing test -- --testPathPattern ResolveExecutionEntryContext`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/application/src/use-cases/execution/ResolveExecutionEntryContext.ts packages/application/src/index.ts packages/testing/src/scenarios/ResolveExecutionEntryContext.test.ts
git commit -m "feat: implement ResolveExecutionEntryContext use case with tests"
```

---

## Task 11: Implement RequestWalletSignature Use Case

**Files:**
- Create: `packages/application/src/use-cases/execution/RequestWalletSignature.ts`
- Create: `packages/testing/src/scenarios/RequestWalletSignature.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/testing/src/scenarios/RequestWalletSignature.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { requestWalletSignature, createExecutionPreview } from '@clmm/application';
import {
  FakeClockPort,
  FakeIdGeneratorPort,
  FakeSwapQuotePort,
  FakeExecutionRepository,
  FakeExecutionPreparationPort,
  FakeWalletSigningPort,
  FakeExecutionHistoryRepository,
  FIXTURE_POSITION_ID,
  FIXTURE_WALLET_ID,
} from '@clmm/testing';
import { LOWER_BOUND_BREACH } from '@clmm/domain';

describe('RequestWalletSignature', () => {
  let clock: FakeClockPort;
  let ids: FakeIdGeneratorPort;
  let executionRepo: FakeExecutionRepository;
  let prepPort: FakeExecutionPreparationPort;
  let signingPort: FakeWalletSigningPort;
  let historyRepo: FakeExecutionHistoryRepository;
  let previewId: string;

  beforeEach(async () => {
    clock = new FakeClockPort();
    ids = new FakeIdGeneratorPort();
    executionRepo = new FakeExecutionRepository();
    prepPort = new FakeExecutionPreparationPort();
    signingPort = new FakeWalletSigningPort();
    historyRepo = new FakeExecutionHistoryRepository();

    const swapQuote = new FakeSwapQuotePort();
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

  it('returns signed payload when user approves', async () => {
    const result = await requestWalletSignature({
      previewId,
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      executionRepo,
      prepPort,
      signingPort,
      historyRepo,
      clock,
      ids,
    });

    expect(result.kind).toBe('signed');
    if (result.kind === 'signed') {
      expect(result.attemptId).toBeTruthy();
      expect(result.signedPayload).toBeInstanceOf(Uint8Array);
    }
  });

  it('returns declined when user declines', async () => {
    signingPort.willDecline();
    const result = await requestWalletSignature({
      previewId,
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      executionRepo,
      prepPort,
      signingPort,
      historyRepo,
      clock,
      ids,
    });

    expect(result.kind).toBe('declined');
  });

  it('returns interrupted when signing interrupted (e.g. MWA handoff)', async () => {
    signingPort.willInterrupt();
    const result = await requestWalletSignature({
      previewId,
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      executionRepo,
      prepPort,
      signingPort,
      historyRepo,
      clock,
      ids,
    });

    expect(result.kind).toBe('interrupted');
    if (result.kind === 'interrupted') {
      expect(result.attemptId).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @clmm/testing test -- --testPathPattern RequestWalletSignature`

Expected: FAIL.

- [ ] **Step 3: Implement the use case**

Create `packages/application/src/use-cases/execution/RequestWalletSignature.ts`:

```typescript
import type {
  ExecutionRepository,
  ExecutionPreparationPort,
  WalletSigningPort,
  ExecutionHistoryRepository,
  ClockPort,
  IdGeneratorPort,
} from '../../ports/index.js';
import type { WalletId, PositionId, BreachDirection } from '@clmm/domain';

export type RequestWalletSignatureResult =
  | { kind: 'signed'; attemptId: string; signedPayload: Uint8Array }
  | { kind: 'declined'; attemptId: string }
  | { kind: 'interrupted'; attemptId: string };

export async function requestWalletSignature(params: {
  previewId: string;
  walletId: WalletId;
  positionId: PositionId;
  breachDirection: BreachDirection;
  executionRepo: ExecutionRepository;
  prepPort: ExecutionPreparationPort;
  signingPort: WalletSigningPort;
  historyRepo: ExecutionHistoryRepository;
  clock: ClockPort;
  ids: IdGeneratorPort;
}): Promise<RequestWalletSignatureResult> {
  const {
    previewId, walletId, positionId, breachDirection,
    executionRepo, prepPort, signingPort, historyRepo, clock, ids,
  } = params;

  const previewRecord = await executionRepo.getPreview(previewId);
  if (!previewRecord) {
    throw new Error(`Preview not found: ${previewId}`);
  }

  if (positionId !== previewRecord.positionId) {
    throw new Error(`requestWalletSignature: positionId mismatch for preview ${previewId}`);
  }

  if (breachDirection.kind !== previewRecord.breachDirection.kind) {
    throw new Error(`requestWalletSignature: breachDirection mismatch for preview ${previewId}`);
  }

  const attemptId = ids.generateId();

  await executionRepo.saveAttempt({
    attemptId,
    positionId: previewRecord.positionId,
    breachDirection: previewRecord.breachDirection,
    lifecycleState: { kind: 'awaiting-signature' },
    completedSteps: [],
    transactionReferences: [],
  });

  await historyRepo.appendEvent({
    eventId: ids.generateId(),
    positionId: previewRecord.positionId,
    eventType: 'signature-requested',
    breachDirection: previewRecord.breachDirection,
    occurredAt: clock.now(),
    lifecycleState: { kind: 'awaiting-signature' },
  });

  const { serializedPayload } = await prepPort.prepareExecution({
    plan: previewRecord.preview.plan,
    walletId,
    positionId: previewRecord.positionId,
  });

  const sigResult = await signingPort.requestSignature(serializedPayload, walletId);

  if (sigResult.kind === 'declined') {
    await executionRepo.updateAttemptState(attemptId, { kind: 'abandoned' });
    await historyRepo.appendEvent({
      eventId: ids.generateId(),
      positionId: previewRecord.positionId,
      eventType: 'signature-declined',
      breachDirection: previewRecord.breachDirection,
      occurredAt: clock.now(),
      lifecycleState: { kind: 'abandoned' },
    });
    return { kind: 'declined', attemptId };
  }

  if (sigResult.kind === 'interrupted') {
    await historyRepo.appendEvent({
      eventId: ids.generateId(),
      positionId: previewRecord.positionId,
      eventType: 'signature-interrupted',
      breachDirection: previewRecord.breachDirection,
      occurredAt: clock.now(),
      lifecycleState: { kind: 'awaiting-signature' },
    });
    return { kind: 'interrupted', attemptId };
  }

  return { kind: 'signed', attemptId, signedPayload: sigResult.signedPayload };
}
```

- [ ] **Step 4: Add export to application barrel**

In `packages/application/src/index.ts`, add:

```typescript
export * from './use-cases/execution/RequestWalletSignature.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @clmm/testing test -- --testPathPattern RequestWalletSignature`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/application/src/use-cases/execution/RequestWalletSignature.ts packages/application/src/index.ts packages/testing/src/scenarios/RequestWalletSignature.test.ts
git commit -m "feat: implement RequestWalletSignature use case — separates signing from submission"
```

---

## Task 12: Implement SubmitExecutionAttempt Use Case

**Files:**
- Create: `packages/application/src/use-cases/execution/SubmitExecutionAttempt.ts`
- Create: `packages/testing/src/scenarios/SubmitExecutionAttempt.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/testing/src/scenarios/SubmitExecutionAttempt.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { submitExecutionAttempt } from '@clmm/application';
import {
  FakeClockPort,
  FakeIdGeneratorPort,
  FakeExecutionRepository,
  FakeExecutionSubmissionPort,
  FakeExecutionHistoryRepository,
  FIXTURE_POSITION_ID,
} from '@clmm/testing';
import { LOWER_BOUND_BREACH } from '@clmm/domain';
import type { StoredExecutionAttempt } from '@clmm/application';

describe('SubmitExecutionAttempt', () => {
  it('submits signed payload and transitions to submitted', async () => {
    const clock = new FakeClockPort();
    const ids = new FakeIdGeneratorPort();
    const executionRepo = new FakeExecutionRepository();
    const submissionPort = new FakeExecutionSubmissionPort();
    const historyRepo = new FakeExecutionHistoryRepository();

    const attempt: StoredExecutionAttempt = {
      attemptId: 'attempt-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    };
    await executionRepo.saveAttempt(attempt);

    const signedPayload = new Uint8Array([1, 2, 3]);

    const result = await submitExecutionAttempt({
      attemptId: 'attempt-1',
      signedPayload,
      executionRepo,
      submissionPort,
      historyRepo,
      clock,
      ids,
    });

    expect(result.kind).toBe('submitted');
    if (result.kind === 'submitted') {
      expect(result.references.length).toBeGreaterThan(0);
    }

    const stored = await executionRepo.getAttempt('attempt-1');
    expect(stored?.lifecycleState.kind).toBe('submitted');
  });

  it('returns not-found when attempt does not exist', async () => {
    const clock = new FakeClockPort();
    const ids = new FakeIdGeneratorPort();
    const executionRepo = new FakeExecutionRepository();
    const submissionPort = new FakeExecutionSubmissionPort();
    const historyRepo = new FakeExecutionHistoryRepository();

    const result = await submitExecutionAttempt({
      attemptId: 'nonexistent',
      signedPayload: new Uint8Array([1]),
      executionRepo,
      submissionPort,
      historyRepo,
      clock,
      ids,
    });

    expect(result.kind).toBe('not-found');
  });

  it('returns invalid-state when attempt is not awaiting-signature', async () => {
    const clock = new FakeClockPort();
    const ids = new FakeIdGeneratorPort();
    const executionRepo = new FakeExecutionRepository();
    const submissionPort = new FakeExecutionSubmissionPort();
    const historyRepo = new FakeExecutionHistoryRepository();

    const attempt: StoredExecutionAttempt = {
      attemptId: 'attempt-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'submitted' },
      completedSteps: [],
      transactionReferences: [],
    };
    await executionRepo.saveAttempt(attempt);

    const result = await submitExecutionAttempt({
      attemptId: 'attempt-1',
      signedPayload: new Uint8Array([1]),
      executionRepo,
      submissionPort,
      historyRepo,
      clock,
      ids,
    });

    expect(result.kind).toBe('invalid-state');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @clmm/testing test -- --testPathPattern SubmitExecutionAttempt`

Expected: FAIL.

- [ ] **Step 3: Implement the use case**

Create `packages/application/src/use-cases/execution/SubmitExecutionAttempt.ts`:

```typescript
import type {
  ExecutionRepository,
  ExecutionSubmissionPort,
  ExecutionHistoryRepository,
  ClockPort,
  IdGeneratorPort,
} from '../../ports/index.js';
import type { TransactionReference } from '@clmm/domain';

export type SubmitExecutionAttemptResult =
  | { kind: 'submitted'; references: TransactionReference[] }
  | { kind: 'not-found' }
  | { kind: 'invalid-state'; currentState: string };

export async function submitExecutionAttempt(params: {
  attemptId: string;
  signedPayload: Uint8Array;
  executionRepo: ExecutionRepository;
  submissionPort: ExecutionSubmissionPort;
  historyRepo: ExecutionHistoryRepository;
  clock: ClockPort;
  ids: IdGeneratorPort;
}): Promise<SubmitExecutionAttemptResult> {
  const { attemptId, signedPayload, executionRepo, submissionPort, historyRepo, clock, ids } = params;

  const attempt = await executionRepo.getAttempt(attemptId);
  if (!attempt) return { kind: 'not-found' };

  if (attempt.lifecycleState.kind !== 'awaiting-signature') {
    return { kind: 'invalid-state', currentState: attempt.lifecycleState.kind };
  }

  const { references } = await submissionPort.submitExecution(signedPayload);

  await executionRepo.updateAttemptState(attemptId, { kind: 'submitted' });

  const firstReference = references[0];
  if (firstReference) {
    await historyRepo.appendEvent({
      eventId: ids.generateId(),
      positionId: attempt.positionId,
      eventType: 'submitted',
      breachDirection: attempt.breachDirection,
      occurredAt: clock.now(),
      lifecycleState: { kind: 'submitted' },
      transactionReference: firstReference,
    });
  }

  return { kind: 'submitted', references };
}
```

- [ ] **Step 4: Add export to application barrel**

In `packages/application/src/index.ts`, add:

```typescript
export * from './use-cases/execution/SubmitExecutionAttempt.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @clmm/testing test -- --testPathPattern SubmitExecutionAttempt`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/application/src/use-cases/execution/SubmitExecutionAttempt.ts packages/application/src/index.ts packages/testing/src/scenarios/SubmitExecutionAttempt.test.ts
git commit -m "feat: implement SubmitExecutionAttempt use case — handles signed payload submission"
```

---

## Task 13: Implement RecordSignatureDecline Use Case

**Files:**
- Create: `packages/application/src/use-cases/execution/RecordSignatureDecline.ts`
- Create: `packages/testing/src/scenarios/RecordSignatureDecline.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/testing/src/scenarios/RecordSignatureDecline.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { recordSignatureDecline } from '@clmm/application';
import {
  FakeClockPort,
  FakeIdGeneratorPort,
  FakeExecutionRepository,
  FakeExecutionHistoryRepository,
  FIXTURE_POSITION_ID,
} from '@clmm/testing';
import { LOWER_BOUND_BREACH } from '@clmm/domain';
import type { StoredExecutionAttempt } from '@clmm/application';

describe('RecordSignatureDecline', () => {
  it('transitions awaiting-signature to abandoned', async () => {
    const clock = new FakeClockPort();
    const ids = new FakeIdGeneratorPort();
    const executionRepo = new FakeExecutionRepository();
    const historyRepo = new FakeExecutionHistoryRepository();

    const attempt: StoredExecutionAttempt = {
      attemptId: 'attempt-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    };
    await executionRepo.saveAttempt(attempt);

    const result = await recordSignatureDecline({
      attemptId: 'attempt-1',
      executionRepo,
      historyRepo,
      clock,
      ids,
    });

    expect(result.kind).toBe('declined');
    const stored = await executionRepo.getAttempt('attempt-1');
    expect(stored?.lifecycleState.kind).toBe('abandoned');
  });

  it('returns not-found for missing attempt', async () => {
    const clock = new FakeClockPort();
    const ids = new FakeIdGeneratorPort();
    const executionRepo = new FakeExecutionRepository();
    const historyRepo = new FakeExecutionHistoryRepository();

    const result = await recordSignatureDecline({
      attemptId: 'nonexistent',
      executionRepo,
      historyRepo,
      clock,
      ids,
    });

    expect(result.kind).toBe('not-found');
  });

  it('returns already-terminal when not in awaiting-signature', async () => {
    const clock = new FakeClockPort();
    const ids = new FakeIdGeneratorPort();
    const executionRepo = new FakeExecutionRepository();
    const historyRepo = new FakeExecutionHistoryRepository();

    const attempt: StoredExecutionAttempt = {
      attemptId: 'attempt-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'submitted' },
      completedSteps: [],
      transactionReferences: [],
    };
    await executionRepo.saveAttempt(attempt);

    const result = await recordSignatureDecline({
      attemptId: 'attempt-1',
      executionRepo,
      historyRepo,
      clock,
      ids,
    });

    expect(result.kind).toBe('already-terminal');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @clmm/testing test -- --testPathPattern RecordSignatureDecline`

Expected: FAIL.

- [ ] **Step 3: Implement the use case**

Create `packages/application/src/use-cases/execution/RecordSignatureDecline.ts`:

```typescript
import type {
  ExecutionRepository,
  ExecutionHistoryRepository,
  ClockPort,
  IdGeneratorPort,
} from '../../ports/index.js';
import type { ExecutionLifecycleState } from '@clmm/domain';

export type RecordSignatureDeclineResult =
  | { kind: 'declined' }
  | { kind: 'not-found' }
  | { kind: 'already-terminal'; state: ExecutionLifecycleState['kind'] };

export async function recordSignatureDecline(params: {
  attemptId: string;
  executionRepo: ExecutionRepository;
  historyRepo: ExecutionHistoryRepository;
  clock: ClockPort;
  ids: IdGeneratorPort;
}): Promise<RecordSignatureDeclineResult> {
  const { attemptId, executionRepo, historyRepo, clock, ids } = params;

  const attempt = await executionRepo.getAttempt(attemptId);
  if (!attempt) return { kind: 'not-found' };

  if (attempt.lifecycleState.kind !== 'awaiting-signature') {
    return { kind: 'already-terminal', state: attempt.lifecycleState.kind };
  }

  await executionRepo.updateAttemptState(attemptId, { kind: 'abandoned' });

  await historyRepo.appendEvent({
    eventId: ids.generateId(),
    positionId: attempt.positionId,
    eventType: 'signature-declined',
    breachDirection: attempt.breachDirection,
    occurredAt: clock.now(),
    lifecycleState: { kind: 'abandoned' },
  });

  return { kind: 'declined' };
}
```

- [ ] **Step 4: Add export to application barrel**

In `packages/application/src/index.ts`, add:

```typescript
export * from './use-cases/execution/RecordSignatureDecline.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @clmm/testing test -- --testPathPattern RecordSignatureDecline`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/application/src/use-cases/execution/RecordSignatureDecline.ts packages/application/src/index.ts packages/testing/src/scenarios/RecordSignatureDecline.test.ts
git commit -m "feat: implement RecordSignatureDecline use case — explicit decline separate from abandonment"
```

---

## Task 14: Implement ResumeExecutionAttempt Use Case

**Files:**
- Create: `packages/application/src/use-cases/execution/ResumeExecutionAttempt.ts`
- Create: `packages/testing/src/scenarios/ResumeExecutionAttempt.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/testing/src/scenarios/ResumeExecutionAttempt.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resumeExecutionAttempt } from '@clmm/application';
import {
  FakeExecutionRepository,
  FIXTURE_POSITION_ID,
} from '@clmm/testing';
import { LOWER_BOUND_BREACH } from '@clmm/domain';
import type { StoredExecutionAttempt } from '@clmm/application';

describe('ResumeExecutionAttempt', () => {
  it('returns resumable attempt when in awaiting-signature state', async () => {
    const executionRepo = new FakeExecutionRepository();
    const attempt: StoredExecutionAttempt = {
      attemptId: 'attempt-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    };
    await executionRepo.saveAttempt(attempt);

    const result = await resumeExecutionAttempt({
      attemptId: 'attempt-1',
      executionRepo,
    });

    expect(result.kind).toBe('resumable');
    if (result.kind === 'resumable') {
      expect(result.attemptId).toBe('attempt-1');
      expect(result.positionId).toBe(FIXTURE_POSITION_ID);
      expect(result.breachDirection).toEqual(LOWER_BOUND_BREACH);
    }
  });

  it('returns not-found for missing attempt', async () => {
    const executionRepo = new FakeExecutionRepository();
    const result = await resumeExecutionAttempt({
      attemptId: 'nonexistent',
      executionRepo,
    });

    expect(result.kind).toBe('not-found');
  });

  it('returns not-resumable when attempt is in terminal state', async () => {
    const executionRepo = new FakeExecutionRepository();
    const attempt: StoredExecutionAttempt = {
      attemptId: 'attempt-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'confirmed' },
      completedSteps: ['remove-liquidity', 'collect-fees', 'swap-assets'],
      transactionReferences: [],
    };
    await executionRepo.saveAttempt(attempt);

    const result = await resumeExecutionAttempt({
      attemptId: 'attempt-1',
      executionRepo,
    });

    expect(result.kind).toBe('not-resumable');
    if (result.kind === 'not-resumable') {
      expect(result.currentState).toBe('confirmed');
    }
  });

  it('returns submitted-pending for submitted attempt awaiting reconciliation', async () => {
    const executionRepo = new FakeExecutionRepository();
    const attempt: StoredExecutionAttempt = {
      attemptId: 'attempt-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'submitted' },
      completedSteps: [],
      transactionReferences: [{ signature: 'sig-1', stepKind: 'remove-liquidity' }],
    };
    await executionRepo.saveAttempt(attempt);

    const result = await resumeExecutionAttempt({
      attemptId: 'attempt-1',
      executionRepo,
    });

    expect(result.kind).toBe('submitted-pending');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @clmm/testing test -- --testPathPattern ResumeExecutionAttempt`

Expected: FAIL.

- [ ] **Step 3: Implement the use case**

Create `packages/application/src/use-cases/execution/ResumeExecutionAttempt.ts`:

```typescript
import type { ExecutionRepository } from '../../ports/index.js';
import type { PositionId, BreachDirection } from '@clmm/domain';

export type ResumeExecutionAttemptResult =
  | { kind: 'resumable'; attemptId: string; positionId: PositionId; breachDirection: BreachDirection }
  | { kind: 'submitted-pending'; attemptId: string; positionId: PositionId; breachDirection: BreachDirection }
  | { kind: 'not-found' }
  | { kind: 'not-resumable'; currentState: string };

const TERMINAL_STATES = new Set(['confirmed', 'abandoned', 'partial']);

export async function resumeExecutionAttempt(params: {
  attemptId: string;
  executionRepo: ExecutionRepository;
}): Promise<ResumeExecutionAttemptResult> {
  const { attemptId, executionRepo } = params;

  const attempt = await executionRepo.getAttempt(attemptId);
  if (!attempt) return { kind: 'not-found' };

  const currentState = attempt.lifecycleState.kind;

  if (TERMINAL_STATES.has(currentState)) {
    return { kind: 'not-resumable', currentState };
  }

  if (currentState === 'submitted') {
    return {
      kind: 'submitted-pending',
      attemptId: attempt.attemptId,
      positionId: attempt.positionId,
      breachDirection: attempt.breachDirection,
    };
  }

  if (currentState === 'awaiting-signature' || currentState === 'previewed') {
    return {
      kind: 'resumable',
      attemptId: attempt.attemptId,
      positionId: attempt.positionId,
      breachDirection: attempt.breachDirection,
    };
  }

  // failed/expired can be retried via new preview, not resumed
  return { kind: 'not-resumable', currentState };
}
```

- [ ] **Step 4: Add export to application barrel**

In `packages/application/src/index.ts`, add:

```typescript
export * from './use-cases/execution/ResumeExecutionAttempt.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @clmm/testing test -- --testPathPattern ResumeExecutionAttempt`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/application/src/use-cases/execution/ResumeExecutionAttempt.ts packages/application/src/index.ts packages/testing/src/scenarios/ResumeExecutionAttempt.test.ts
git commit -m "feat: implement ResumeExecutionAttempt use case — supports MWA handoff resume"
```

---

## Task 15: Update Scenarios Barrel

**Files:**
- Modify: `packages/testing/src/scenarios/index.ts`

- [ ] **Step 1: Update scenarios barrel with all new test exports**

Replace `packages/testing/src/scenarios/index.ts` with:

```typescript
export * from './ScanPositionsForBreaches.test.js';
export * from './QualifyActionableTrigger.test.js';
export * from './CreateExecutionPreview.test.js';
export * from './RefreshExecutionPreview.test.js';
export * from './ApproveExecution.test.js';
export * from './ReconcileExecutionAttempt.test.js';
export * from './DispatchActionableNotification.test.js';
export * from './StalePreviews.test.js';
export * from './BreachToExitScenario.test.js';
export * from './ListSupportedPositions.test.js';
export * from './GetExecutionPreview.test.js';
export * from './ListActionableAlerts.test.js';
export * from './AcknowledgeAlert.test.js';
export * from './GetExecutionAttemptDetail.test.js';
export * from './GetExecutionHistory.test.js';
export * from './RecordExecutionAbandonment.test.js';
export * from './GetPositionDetail.test.js';
export * from './GetMonitoringReadiness.test.js';
export * from './ConnectWalletSession.test.js';
export * from './SyncPlatformCapabilities.test.js';
export * from './ResolveExecutionEntryContext.test.js';
export * from './RequestWalletSignature.test.js';
export * from './SubmitExecutionAttempt.test.js';
export * from './RecordSignatureDecline.test.js';
export * from './ResumeExecutionAttempt.test.js';
```

- [ ] **Step 2: Run all tests**

Run: `pnpm test`

Expected: Exit 0, all tests pass (previously 164 + new tests).

- [ ] **Step 3: Commit**

```bash
git add packages/testing/src/scenarios/index.ts
git commit -m "chore: update scenarios barrel with all new test exports"
```

---

## Task 16: Create Typography Design Tokens

**Files:**
- Create: `packages/ui/src/design-system/typography.ts`
- Modify: `packages/ui/src/design-system/index.ts`

- [ ] **Step 1: Create typography tokens**

Create `packages/ui/src/design-system/typography.ts`:

```typescript
export const typography = {
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
  },
  fontWeight: {
    normal: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;
```

- [ ] **Step 2: Update design system barrel**

Replace `packages/ui/src/design-system/index.ts` with:

```typescript
export { colors } from './colors.js';
export { typography } from './typography.js';
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter @clmm/ui typecheck`

Expected: Exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/design-system/
git commit -m "feat: add typography design tokens"
```

---

## Task 17: Create RangeStatusBadge Component

**Files:**
- Create: `packages/ui/src/components/RangeStatusBadge.tsx`
- Create: `packages/ui/src/components/RangeStatusBadge.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/ui/src/components/RangeStatusBadge.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getRangeStatusBadgeProps } from './RangeStatusBadge.js';

describe('RangeStatusBadge', () => {
  it('in-range returns green label', () => {
    const result = getRangeStatusBadgeProps('in-range');
    expect(result.label).toBe('In Range');
    expect(result.colorKey).toBe('primary');
  });

  it('below-range returns breach label', () => {
    const result = getRangeStatusBadgeProps('below-range');
    expect(result.label).toBe('Below Range');
    expect(result.colorKey).toBe('breach');
  });

  it('above-range returns breach label', () => {
    const result = getRangeStatusBadgeProps('above-range');
    expect(result.label).toBe('Above Range');
    expect(result.colorKey).toBe('breach');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @clmm/ui test -- --testPathPattern RangeStatusBadge`

Expected: FAIL.

- [ ] **Step 3: Implement the component**

Create `packages/ui/src/components/RangeStatusBadge.tsx`:

```typescript
import { View, Text } from 'react-native';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';

type RangeStateKind = 'in-range' | 'below-range' | 'above-range';

type BadgeProps = {
  label: string;
  colorKey: keyof typeof colors;
};

export function getRangeStatusBadgeProps(rangeStateKind: RangeStateKind): BadgeProps {
  switch (rangeStateKind) {
    case 'in-range':
      return { label: 'In Range', colorKey: 'primary' };
    case 'below-range':
      return { label: 'Below Range', colorKey: 'breach' };
    case 'above-range':
      return { label: 'Above Range', colorKey: 'breach' };
    default: {
      const _exhaustive: never = rangeStateKind;
      throw new Error(`Unhandled range state: ${_exhaustive}`);
    }
  }
}

export function RangeStatusBadge({ rangeStateKind }: { rangeStateKind: RangeStateKind }) {
  const { label, colorKey } = getRangeStatusBadgeProps(rangeStateKind);
  const badgeColor = colors[colorKey];

  return (
    <View style={{
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 4,
      backgroundColor: `${badgeColor}20`,
    }}>
      <Text style={{
        color: badgeColor,
        fontSize: typography.fontSize.sm,
        fontWeight: typography.fontWeight.semibold,
      }}>
        {label}
      </Text>
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @clmm/ui test -- --testPathPattern RangeStatusBadge`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/RangeStatusBadge.tsx packages/ui/src/components/RangeStatusBadge.test.ts
git commit -m "feat: add RangeStatusBadge component with in-range/breach display"
```

---

## Task 18: Create ExecutionStateCard Component

**Files:**
- Create: `packages/ui/src/components/ExecutionStateCard.tsx`

- [ ] **Step 1: Create the component**

Create `packages/ui/src/components/ExecutionStateCard.tsx`:

```typescript
import { View, Text } from 'react-native';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';
import type { ExecutionStateViewModel } from '../view-models/ExecutionStateViewModel.js';

type Props = {
  viewModel: ExecutionStateViewModel;
};

export function ExecutionStateCard({ viewModel }: Props) {
  return (
    <View style={{
      padding: 16,
      borderRadius: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    }}>
      <Text style={{
        color: colors.text,
        fontSize: typography.fontSize.lg,
        fontWeight: typography.fontWeight.bold,
      }}>
        {viewModel.title}
      </Text>

      <Text style={{
        color: colors.textSecondary,
        fontSize: typography.fontSize.base,
        marginTop: 4,
      }}>
        {viewModel.subtitle}
      </Text>

      {viewModel.partialCompletionWarning ? (
        <View style={{
          marginTop: 12,
          padding: 8,
          borderRadius: 4,
          backgroundColor: `${colors.warning}20`,
        }}>
          <Text style={{ color: colors.warning, fontSize: typography.fontSize.sm }}>
            {viewModel.partialCompletionWarning}
          </Text>
        </View>
      ) : null}

      {viewModel.nextAction ? (
        <Text style={{
          color: colors.primary,
          fontSize: typography.fontSize.base,
          fontWeight: typography.fontWeight.semibold,
          marginTop: 12,
        }}>
          {viewModel.nextAction}
        </Text>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @clmm/ui typecheck`

Expected: Exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/ExecutionStateCard.tsx
git commit -m "feat: add ExecutionStateCard component — renders lifecycle state with warnings"
```

---

## Task 19: Create HistoryEventRow Component

**Files:**
- Create: `packages/ui/src/components/HistoryEventRow.tsx`

- [ ] **Step 1: Create the component**

Create `packages/ui/src/components/HistoryEventRow.tsx`:

```typescript
import { View, Text } from 'react-native';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';
import type { HistoryEventDto } from '@clmm/application/public';

function formatEventType(eventType: string): string {
  return eventType
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getEventColor(eventType: string): string {
  switch (eventType) {
    case 'confirmed':
      return colors.primary;
    case 'failed':
    case 'partial-completion':
      return colors.danger;
    case 'trigger-created':
    case 'preview-created':
      return colors.breach;
    case 'abandoned':
    case 'signature-declined':
      return colors.textSecondary;
    default:
      return colors.text;
  }
}

type Props = {
  event: HistoryEventDto;
};

export function HistoryEventRow({ event }: Props) {
  const eventColor = getEventColor(event.eventType);

  return (
    <View style={{
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    }}>
      <View style={{ flex: 1 }}>
        <Text style={{
          color: eventColor,
          fontSize: typography.fontSize.base,
          fontWeight: typography.fontWeight.medium,
        }}>
          {formatEventType(event.eventType)}
        </Text>
        {event.transactionReference ? (
          <Text style={{
            color: colors.textSecondary,
            fontSize: typography.fontSize.xs,
            marginTop: 2,
          }}>
            tx: {event.transactionReference.signature.slice(0, 8)}...
          </Text>
        ) : null}
      </View>
      <Text style={{
        color: colors.textSecondary,
        fontSize: typography.fontSize.sm,
      }}>
        {new Date(event.occurredAt).toLocaleTimeString()}
      </Text>
    </View>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @clmm/ui typecheck`

Expected: Exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/HistoryEventRow.tsx
git commit -m "feat: add HistoryEventRow component — displays history event with tx reference"
```

---

## Task 20: Create Missing View Models

**Files:**
- Create: `packages/ui/src/view-models/PositionListViewModel.ts`
- Create: `packages/ui/src/view-models/PositionDetailViewModel.ts`
- Create: `packages/ui/src/view-models/HistoryViewModel.ts`

- [ ] **Step 1: Create PositionListViewModel**

Create `packages/ui/src/view-models/PositionListViewModel.ts`:

```typescript
import type { PositionSummaryDto } from '@clmm/application/public';

export type PositionListItemViewModel = {
  positionId: string;
  poolLabel: string;
  rangeStatusLabel: string;
  rangeStatusKind: 'in-range' | 'below-range' | 'above-range';
  hasAlert: boolean;
  monitoringLabel: string;
};

export type PositionListViewModel = {
  items: PositionListItemViewModel[];
  isEmpty: boolean;
};

function rangeStateLabel(kind: string): string {
  switch (kind) {
    case 'in-range': return 'In Range';
    case 'below-range': return 'Below Range';
    case 'above-range': return 'Above Range';
    default: return 'Unknown';
  }
}

function monitoringLabel(status: string): string {
  switch (status) {
    case 'active': return 'Monitoring Active';
    case 'degraded': return 'Monitoring Degraded';
    case 'inactive': return 'Monitoring Inactive';
    default: return 'Unknown';
  }
}

export function buildPositionListViewModel(positions: PositionSummaryDto[]): PositionListViewModel {
  const items: PositionListItemViewModel[] = positions.map((p) => ({
    positionId: p.positionId,
    poolLabel: `Pool ${p.poolId}`,
    rangeStatusLabel: rangeStateLabel(p.rangeState),
    rangeStatusKind: p.rangeState as 'in-range' | 'below-range' | 'above-range',
    hasAlert: p.hasActionableTrigger,
    monitoringLabel: monitoringLabel(p.monitoringStatus),
  }));

  return { items, isEmpty: items.length === 0 };
}
```

- [ ] **Step 2: Create PositionDetailViewModel**

Create `packages/ui/src/view-models/PositionDetailViewModel.ts`:

```typescript
import type { PositionDetailDto } from '@clmm/application/public';
import { getRangeStatusBadgeProps } from '../components/RangeStatusBadge.js';

export type PositionDetailViewModel = {
  positionId: string;
  poolLabel: string;
  rangeBoundsLabel: string;
  currentPriceLabel: string;
  rangeStatusLabel: string;
  rangeStatusColorKey: string;
  hasAlert: boolean;
  alertLabel: string;
  breachDirectionLabel?: string;
};

export function buildPositionDetailViewModel(dto: PositionDetailDto): PositionDetailViewModel {
  const badge = getRangeStatusBadgeProps(dto.rangeState as 'in-range' | 'below-range' | 'above-range');

  let breachDirectionLabel: string | undefined;
  if (dto.breachDirection) {
    breachDirectionLabel = dto.breachDirection.kind === 'lower-bound-breach'
      ? 'Price dropped below lower bound'
      : 'Price rose above upper bound';
  }

  return {
    positionId: dto.positionId,
    poolLabel: `Pool ${dto.poolId}`,
    rangeBoundsLabel: `${dto.lowerBound} — ${dto.upperBound}`,
    currentPriceLabel: `Current: ${dto.currentPrice}`,
    rangeStatusLabel: badge.label,
    rangeStatusColorKey: badge.colorKey,
    hasAlert: dto.hasActionableTrigger,
    alertLabel: dto.hasActionableTrigger ? 'Action Required' : 'No Alerts',
    breachDirectionLabel,
  };
}
```

- [ ] **Step 3: Create HistoryViewModel**

Create `packages/ui/src/view-models/HistoryViewModel.ts`:

```typescript
import type { HistoryEventDto } from '@clmm/application/public';

export type HistoryItemViewModel = {
  eventId: string;
  eventTypeLabel: string;
  occurredAtLabel: string;
  hasTransaction: boolean;
  transactionSignatureShort?: string;
};

export type HistoryViewModel = {
  items: HistoryItemViewModel[];
  isEmpty: boolean;
};

function formatEventType(eventType: string): string {
  return eventType
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function buildHistoryViewModel(events: HistoryEventDto[]): HistoryViewModel {
  const items: HistoryItemViewModel[] = events.map((e) => ({
    eventId: e.eventId,
    eventTypeLabel: formatEventType(e.eventType),
    occurredAtLabel: new Date(e.occurredAt).toLocaleString(),
    hasTransaction: !!e.transactionReference,
    transactionSignatureShort: e.transactionReference
      ? `${e.transactionReference.signature.slice(0, 8)}...`
      : undefined,
  }));

  return { items, isEmpty: items.length === 0 };
}
```

- [ ] **Step 4: Verify typecheck**

Run: `pnpm --filter @clmm/ui typecheck`

Expected: Exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/view-models/PositionListViewModel.ts packages/ui/src/view-models/PositionDetailViewModel.ts packages/ui/src/view-models/HistoryViewModel.ts
git commit -m "feat: add PositionList, PositionDetail, and History view models"
```

---

## Task 21: Create Missing Presenters

**Files:**
- Create: `packages/ui/src/presenters/PositionDetailPresenter.ts`
- Create: `packages/ui/src/presenters/PreviewPresenter.ts`

- [ ] **Step 1: Create PositionDetailPresenter**

Create `packages/ui/src/presenters/PositionDetailPresenter.ts`:

```typescript
import type { PositionDetailDto, ActionableAlertDto } from '@clmm/application/public';
import { buildPositionDetailViewModel, type PositionDetailViewModel } from '../view-models/PositionDetailViewModel.js';

export type PositionDetailPresentation = {
  position: PositionDetailViewModel;
  alert?: {
    triggerId: string;
    directionLabel: string;
  };
};

export function presentPositionDetail(params: {
  position: PositionDetailDto;
  alert?: ActionableAlertDto;
}): PositionDetailPresentation {
  const positionVm = buildPositionDetailViewModel(params.position);

  let alert: PositionDetailPresentation['alert'];
  if (params.alert) {
    alert = {
      triggerId: params.alert.triggerId,
      directionLabel: params.alert.breachDirection.kind === 'lower-bound-breach'
        ? 'Lower Bound Breach — Exit to USDC'
        : 'Upper Bound Breach — Exit to SOL',
    };
  }

  return { position: positionVm, alert };
}
```

- [ ] **Step 2: Create PreviewPresenter**

Create `packages/ui/src/presenters/PreviewPresenter.ts`:

```typescript
import type { ExecutionPreviewDto } from '@clmm/application/public';
import { buildPreviewViewModel, type PreviewViewModel } from '../view-models/PreviewViewModel.js';

export type PreviewPresentation = {
  preview: PreviewViewModel;
  canProceed: boolean;
  warningMessage?: string;
};

export function presentPreview(dto: ExecutionPreviewDto): PreviewPresentation {
  const preview = buildPreviewViewModel(dto);

  let warningMessage: string | undefined;
  if (preview.isStale) {
    warningMessage = 'Quote is stale. Refresh before signing to get the latest rate.';
  } else if (preview.isExpired) {
    warningMessage = 'Quote has expired. You must refresh before proceeding.';
  }

  return {
    preview,
    canProceed: preview.canSign,
    warningMessage,
  };
}
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter @clmm/ui typecheck`

Expected: Exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/presenters/
git commit -m "feat: add PositionDetailPresenter and PreviewPresenter"
```

---

## Task 22: Update UI Barrel Exports

**Files:**
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Update UI barrel with all new exports**

Replace `packages/ui/src/index.ts` with:

```typescript
// Screens — imported by apps/app route files ONLY
export { PositionsListScreen } from './screens/PositionsListScreen.js';
export { AlertsListScreen } from './screens/AlertsListScreen.js';
export { PositionDetailScreen } from './screens/PositionDetailScreen.js';
export { ExecutionPreviewScreen } from './screens/ExecutionPreviewScreen.js';
export { SigningStatusScreen } from './screens/SigningStatusScreen.js';
export { ExecutionResultScreen } from './screens/ExecutionResultScreen.js';
export { HistoryListScreen } from './screens/HistoryListScreen.js';
export { HistoryDetailScreen } from './screens/HistoryDetailScreen.js';

// Components — reusable
export { DirectionalPolicyCard } from './components/DirectionalPolicyCard.js';
export { PreviewStepSequence } from './components/PreviewStepSequence.js';
export { RangeStatusBadge, getRangeStatusBadgeProps } from './components/RangeStatusBadge.js';
export { ExecutionStateCard } from './components/ExecutionStateCard.js';
export { HistoryEventRow } from './components/HistoryEventRow.js';

// View models — for testing and screen composition
export { buildPreviewViewModel } from './view-models/PreviewViewModel.js';
export { buildExecutionStateViewModel } from './view-models/ExecutionStateViewModel.js';
export { buildPositionListViewModel } from './view-models/PositionListViewModel.js';
export { buildPositionDetailViewModel } from './view-models/PositionDetailViewModel.js';
export { buildHistoryViewModel } from './view-models/HistoryViewModel.js';

// Presenters
export { presentPositionDetail } from './presenters/PositionDetailPresenter.js';
export { presentPreview } from './presenters/PreviewPresenter.js';

// Design system
export { colors } from './design-system/colors.js';
export { typography } from './design-system/typography.js';
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @clmm/ui typecheck`

Expected: Exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/index.ts
git commit -m "chore: update UI barrel with all new components, view models, and presenters"
```

---

## Task 23: Complete Adapters Barrel Export

**Files:**
- Modify: `packages/adapters/src/index.ts`

- [ ] **Step 1: Update adapters barrel**

Replace `packages/adapters/src/index.ts` with:

```typescript
// Client-facing adapters (imported by apps/app composition bootstrap)
export { BrowserWalletSigningAdapter } from './outbound/wallet-signing/BrowserWalletSigningAdapter.js';
export { NativePlatformCapabilityAdapter } from './outbound/capabilities/NativePlatformCapabilityAdapter.js';
export { WebPlatformCapabilityAdapter } from './outbound/capabilities/WebPlatformCapabilityAdapter.js';
export { ExpoDeepLinkAdapter } from './outbound/capabilities/ExpoDeepLinkAdapter.js';
export { WebDeepLinkAdapter } from './outbound/capabilities/WebDeepLinkAdapter.js';
export { NativeNotificationPermissionAdapter } from './outbound/capabilities/NativeNotificationPermissionAdapter.js';
export { WebNotificationPermissionAdapter } from './outbound/capabilities/WebNotificationPermissionAdapter.js';

// Server-side adapters (imported by NestJS modules internally — re-exported for completeness)
export { OrcaPositionReadAdapter } from './outbound/solana-position-reads/OrcaPositionReadAdapter.js';
export { SolanaRangeObservationAdapter } from './outbound/solana-position-reads/SolanaRangeObservationAdapter.js';
export { JupiterQuoteAdapter } from './outbound/swap-execution/JupiterQuoteAdapter.js';
export { SolanaExecutionPreparationAdapter } from './outbound/swap-execution/SolanaExecutionPreparationAdapter.js';
export { SolanaExecutionSubmissionAdapter } from './outbound/swap-execution/SolanaExecutionSubmissionAdapter.js';
export { NativeWalletSigningAdapter } from './outbound/wallet-signing/NativeWalletSigningAdapter.js';
export { ExpoPushAdapter } from './outbound/notifications/ExpoPushAdapter.js';
export { WebPushAdapter } from './outbound/notifications/WebPushAdapter.js';
export { InAppAlertAdapter } from './outbound/notifications/InAppAlertAdapter.js';
export { OperationalStorageAdapter } from './outbound/storage/OperationalStorageAdapter.js';
export { OffChainHistoryStorageAdapter } from './outbound/storage/OffChainHistoryStorageAdapter.js';
export { TelemetryAdapter } from './outbound/observability/TelemetryAdapter.js';
```

Note: The existing barrel used non-`.js` extensions. This update normalizes to `.js` extensions consistent with the rest of the codebase. If the adapters package uses a different module resolution strategy that doesn't require `.js`, keep the original style — check `packages/adapters/tsconfig.json` for the `moduleResolution` setting.

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @clmm/adapters typecheck`

Expected: Exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/adapters/src/index.ts
git commit -m "chore: export all adapters from barrel for completeness"
```

---

## Task 24: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Clean install**

Run: `pnpm install`

Expected: Clean install.

- [ ] **Step 2: Typecheck all packages**

Run: `pnpm typecheck`

Expected: Exit 0.

- [ ] **Step 3: Build all packages**

Run: `pnpm build`

Expected: Exit 0, including `@clmm/app`.

- [ ] **Step 4: Run all tests**

Run: `pnpm test`

Expected: Exit 0. Should be ~190+ tests (was 164 + new use case tests + new component tests).

- [ ] **Step 5: Run lint**

Run: `pnpm lint`

Expected: Exit 0, zero errors.

- [ ] **Step 6: Run boundary check**

Run: `pnpm boundaries`

Expected: Exit 0, zero violations.

- [ ] **Step 7: Verify domain coverage**

Run: `pnpm --filter @clmm/domain test -- --coverage`

Expected: DirectionalExitPolicyService: 100% branch coverage.

- [ ] **Step 8: Commit verification passing**

If any step failed, fix the issue and re-run. Once all pass:

```bash
git add -A
git commit -m "chore: all CI gates passing — remediation complete"
```

---

## Summary

| Phase | Tasks | Estimated Effort |
|-------|-------|-----------------|
| CI Green | Tasks 1-2 | Small (5 min) |
| Behavioral Bugs | Task 3 | Small (10 min) |
| Missing Fakes & Fixtures | Tasks 4-5 | Small (15 min) |
| Missing Use Cases | Tasks 6-14 | Medium (60 min) |
| Test Updates | Task 15 | Small (5 min) |
| Missing UI Components | Tasks 16-22 | Medium (45 min) |
| Adapter Barrel | Task 23 | Small (5 min) |
| Final Verification | Task 24 | Small (10 min) |
| **Total** | **24 tasks** | **~2.5 hours** |
