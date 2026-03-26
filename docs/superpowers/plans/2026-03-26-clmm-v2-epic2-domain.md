# CLMM V2 — Epic 2: Domain Model

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisite:** Epic 1 complete — `pnpm typecheck && pnpm boundaries && pnpm test` all pass.

**Goal:** Encode the full domain model — positions, triggers, directional exit policy, execution plan, preview freshness, lifecycle state machine, retry boundaries, and history events — as pure, deterministic TypeScript. The directional exit policy service must be 100% branch-tested for both breach directions.

**Architecture:** Everything in `packages/domain/src`. Zero external dependencies. Pure functions and immutable value objects. `DirectionalExitPolicyService` is the single source of truth for `LowerBoundBreach → ExitToUSDC + SOL→USDC swap` and `UpperBoundBreach → ExitToSOL + USDC→SOL swap`. Tests use `vitest` with no mocks — domain is pure.

**Tech Stack:** TypeScript strict, Vitest, zero runtime dependencies

---

## File Map

```
packages/domain/src/
  index.ts                                  # re-exports all public types + services

  shared/
    index.ts                                # PositionId, WalletId, PoolId, BreachDirection,
                                            # PostExitAssetPosture, ClockTimestamp,
                                            # AssetSymbol, TokenAmount

  positions/
    index.ts                                # LiquidityPosition, RangeBounds, RangeState,
                                            # MonitoringReadiness

  triggers/
    index.ts                                # BreachEpisode, ExitTrigger, ConfirmationEvaluation
    TriggerQualificationService.ts
    TriggerQualificationService.test.ts

  exit-policy/
    DirectionalExitPolicyService.ts         # THE CORE INVARIANT — must be exhaustively tested
    DirectionalExitPolicyService.test.ts

  execution/
    index.ts                                # SwapInstruction, ExecutionStep, ExecutionPlan,
                                            # ExecutionPreview, ExecutionAttempt,
                                            # ExecutionLifecycleState, TransactionReference,
                                            # RetryEligibility, PreviewFreshness
    ExecutionPlanFactory.ts
    ExecutionPlanFactory.test.ts
    PreviewFreshnessPolicy.ts
    PreviewFreshnessPolicy.test.ts
    RetryBoundaryPolicy.ts
    RetryBoundaryPolicy.test.ts
    ExecutionStateReducer.ts
    ExecutionStateReducer.test.ts

  history/
    index.ts                                # HistoryEvent, HistoryTimeline,
                                            # HistoryEventType, ExecutionOutcomeSummary
```

---

## Task 1: Shared Value Objects

**Files:**
- Create: `packages/domain/src/shared/index.ts`

- [ ] **Step 1.1: Write the shared types**

`packages/domain/src/shared/index.ts`:
```typescript
// Branded IDs — prevent accidental mix-ups
export type PositionId = string & { readonly _brand: 'PositionId' };
export type WalletId = string & { readonly _brand: 'WalletId' };
export type PoolId = string & { readonly _brand: 'PoolId' };
export type ClockTimestamp = number & { readonly _brand: 'ClockTimestamp' };

export function makePositionId(raw: string): PositionId {
  return raw as PositionId;
}
export function makeWalletId(raw: string): WalletId {
  return raw as WalletId;
}
export function makePoolId(raw: string): PoolId {
  return raw as PoolId;
}
export function makeClockTimestamp(ms: number): ClockTimestamp {
  return ms as ClockTimestamp;
}

// BreachDirection — discriminated union, NEVER a boolean or string
export type BreachDirection =
  | { readonly kind: 'lower-bound-breach' }
  | { readonly kind: 'upper-bound-breach' };

export const LOWER_BOUND_BREACH: BreachDirection = { kind: 'lower-bound-breach' };
export const UPPER_BOUND_BREACH: BreachDirection = { kind: 'upper-bound-breach' };

// PostExitAssetPosture — discriminated union
export type PostExitAssetPosture =
  | { readonly kind: 'exit-to-usdc' }
  | { readonly kind: 'exit-to-sol' };

export const EXIT_TO_USDC: PostExitAssetPosture = { kind: 'exit-to-usdc' };
export const EXIT_TO_SOL: PostExitAssetPosture = { kind: 'exit-to-sol' };

// Asset symbols for swap instructions
export type AssetSymbol = 'SOL' | 'USDC';

// Token amounts — always stored as bigint (lamports / raw units)
export type TokenAmount = {
  readonly raw: bigint;
  readonly decimals: number;
  readonly symbol: AssetSymbol;
};

export function makeTokenAmount(
  raw: bigint,
  decimals: number,
  symbol: AssetSymbol,
): TokenAmount {
  return { raw, decimals, symbol };
}
```

- [ ] **Step 1.2: Typecheck**

```bash
pnpm --filter @clmm/domain typecheck
```

Expected: exits 0.

- [ ] **Step 1.3: Commit**

```bash
git add packages/domain/src/shared/
git commit -m "feat(domain): add shared value objects (PositionId, BreachDirection, PostExitAssetPosture)"
```

---

## Task 2: Positions + Monitoring Readiness

**Files:**
- Create: `packages/domain/src/positions/index.ts`

- [ ] **Step 2.1: Write position types**

`packages/domain/src/positions/index.ts`:
```typescript
import type { PositionId, WalletId, PoolId, ClockTimestamp } from '../shared/index.js';

export type RangeBounds = {
  readonly lowerBound: number;
  readonly upperBound: number;
};

export type RangeState =
  | { readonly kind: 'in-range'; readonly currentPrice: number }
  | { readonly kind: 'below-range'; readonly currentPrice: number }
  | { readonly kind: 'above-range'; readonly currentPrice: number };

export function evaluateRangeState(
  bounds: RangeBounds,
  currentPrice: number,
): RangeState {
  if (currentPrice < bounds.lowerBound) {
    return { kind: 'below-range', currentPrice };
  }
  if (currentPrice > bounds.upperBound) {
    return { kind: 'above-range', currentPrice };
  }
  return { kind: 'in-range', currentPrice };
}

export type MonitoringReadiness =
  | { readonly kind: 'active' }
  | { readonly kind: 'degraded'; readonly reason: string }
  | { readonly kind: 'inactive'; readonly reason: string };

export type LiquidityPosition = {
  readonly positionId: PositionId;
  readonly walletId: WalletId;
  readonly poolId: PoolId;
  readonly bounds: RangeBounds;
  readonly lastObservedAt: ClockTimestamp;
  readonly rangeState: RangeState;
  readonly monitoringReadiness: MonitoringReadiness;
};
```

- [ ] **Step 2.2: Typecheck**

```bash
pnpm --filter @clmm/domain typecheck
```

Expected: exits 0.

- [ ] **Step 2.3: Commit**

```bash
git add packages/domain/src/positions/
git commit -m "feat(domain): add LiquidityPosition, RangeBounds, RangeState, MonitoringReadiness"
```

---

## Task 3: Triggers + TriggerQualificationService (TDD)

**Files:**
- Create: `packages/domain/src/triggers/index.ts`
- Create: `packages/domain/src/triggers/TriggerQualificationService.ts`
- Create: `packages/domain/src/triggers/TriggerQualificationService.test.ts`

- [ ] **Step 3.1: Write the failing tests first**

`packages/domain/src/triggers/TriggerQualificationService.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import {
  qualifyTrigger,
  type BreachObservation,
  type TriggerQualificationResult,
} from './TriggerQualificationService.js';
import {
  makePositionId,
  makeClockTimestamp,
  LOWER_BOUND_BREACH,
  UPPER_BOUND_BREACH,
} from '../shared/index.js';

const posId = makePositionId('pos-1');
const now = makeClockTimestamp(1_000_000);

const baseObservation: BreachObservation = {
  positionId: posId,
  direction: LOWER_BOUND_BREACH,
  observedAt: now,
  episodeId: 'episode-1',
  consecutiveOutOfRangeCount: 3,
};

describe('TriggerQualificationService', () => {
  describe('MVP confirmation rule: requires 3 consecutive out-of-range observations', () => {
    it('qualifies a lower-bound breach when count meets threshold', () => {
      const result = qualifyTrigger(baseObservation);
      expect(result.kind).toBe('qualified');
    });

    it('does not qualify when below threshold', () => {
      const result = qualifyTrigger({
        ...baseObservation,
        consecutiveOutOfRangeCount: 2,
      });
      expect(result.kind).toBe('not-qualified');
      if (result.kind === 'not-qualified') {
        expect(result.reason).toContain('confirmation');
      }
    });

    it('qualifies an upper-bound breach when count meets threshold', () => {
      const result = qualifyTrigger({
        ...baseObservation,
        direction: UPPER_BOUND_BREACH,
      });
      expect(result.kind).toBe('qualified');
    });

    it('preserves breach direction in qualified trigger', () => {
      const lower = qualifyTrigger({ ...baseObservation, direction: LOWER_BOUND_BREACH });
      const upper = qualifyTrigger({ ...baseObservation, direction: UPPER_BOUND_BREACH });
      expect(lower.kind).toBe('qualified');
      expect(upper.kind).toBe('qualified');
      if (lower.kind === 'qualified') {
        expect(lower.trigger.breachDirection.kind).toBe('lower-bound-breach');
      }
      if (upper.kind === 'qualified') {
        expect(upper.trigger.breachDirection.kind).toBe('upper-bound-breach');
      }
    });
  });

  describe('episode idempotency', () => {
    it('suppresses duplicate trigger for the same episode', () => {
      const existingTriggerId = 'trigger-existing';
      const result = qualifyTrigger({
        ...baseObservation,
        existingTriggerIdForEpisode: existingTriggerId,
      });
      expect(result.kind).toBe('duplicate-suppressed');
      if (result.kind === 'duplicate-suppressed') {
        expect(result.existingTriggerId).toBe(existingTriggerId);
      }
    });

    it('does not suppress when no existing trigger for episode', () => {
      const result = qualifyTrigger({
        ...baseObservation,
        existingTriggerIdForEpisode: undefined,
      });
      expect(result.kind).toBe('qualified');
    });
  });

  describe('qualified trigger has required fields', () => {
    it('trigger includes positionId, breachDirection, triggeredAt, confirmationEvaluatedAt', () => {
      const result = qualifyTrigger(baseObservation);
      expect(result.kind).toBe('qualified');
      if (result.kind === 'qualified') {
        const { trigger } = result;
        expect(trigger.positionId).toBe(posId);
        expect(trigger.breachDirection).toBe(LOWER_BOUND_BREACH);
        expect(typeof trigger.triggeredAt).toBe('number');
        expect(typeof trigger.confirmationEvaluatedAt).toBe('number');
        expect(trigger.confirmationPassed).toBe(true);
      }
    });
  });
});
```

- [ ] **Step 3.2: Run test — confirm it FAILS**

```bash
pnpm --filter @clmm/domain test
```

Expected: FAIL — `qualifyTrigger` not found.

- [ ] **Step 3.3: Write the trigger types**

`packages/domain/src/triggers/index.ts`:
```typescript
import type {
  PositionId,
  BreachDirection,
  ClockTimestamp,
} from '../shared/index.js';

export type BreachEpisodeId = string & { readonly _brand: 'BreachEpisodeId' };
export type ExitTriggerId = string & { readonly _brand: 'ExitTriggerId' };

export type BreachEpisode = {
  readonly episodeId: BreachEpisodeId;
  readonly positionId: PositionId;
  readonly direction: BreachDirection;
  readonly startedAt: ClockTimestamp;
  readonly lastObservedAt: ClockTimestamp;
  readonly activeTriggerId: ExitTriggerId | null;
};

export type ExitTrigger = {
  readonly triggerId: ExitTriggerId;
  readonly positionId: PositionId;
  readonly breachDirection: BreachDirection;
  readonly triggeredAt: ClockTimestamp;
  readonly confirmationEvaluatedAt: ClockTimestamp;
  readonly confirmationPassed: true;
  readonly episodeId: BreachEpisodeId;
};

export type ConfirmationEvaluation = {
  readonly passed: boolean;
  readonly reason: string;
  readonly evaluatedAt: ClockTimestamp;
};
```

- [ ] **Step 3.4: Write the TriggerQualificationService implementation**

`packages/domain/src/triggers/TriggerQualificationService.ts`:
```typescript
import type { PositionId, BreachDirection, ClockTimestamp } from '../shared/index.js';
import type { BreachEpisodeId, ExitTrigger, ExitTriggerId } from './index.js';

const MVP_CONFIRMATION_THRESHOLD = 3;

export type BreachObservation = {
  readonly positionId: PositionId;
  readonly direction: BreachDirection;
  readonly observedAt: ClockTimestamp;
  readonly episodeId: string;
  readonly consecutiveOutOfRangeCount: number;
  readonly existingTriggerIdForEpisode?: string;
};

export type TriggerQualificationResult =
  | {
      readonly kind: 'qualified';
      readonly trigger: ExitTrigger;
    }
  | {
      readonly kind: 'not-qualified';
      readonly reason: string;
    }
  | {
      readonly kind: 'duplicate-suppressed';
      readonly existingTriggerId: string;
    };

export function qualifyTrigger(
  observation: BreachObservation,
): TriggerQualificationResult {
  // Episode idempotency check first
  if (observation.existingTriggerIdForEpisode != null) {
    return {
      kind: 'duplicate-suppressed',
      existingTriggerId: observation.existingTriggerIdForEpisode,
    };
  }

  // MVP confirmation rule
  if (observation.consecutiveOutOfRangeCount < MVP_CONFIRMATION_THRESHOLD) {
    return {
      kind: 'not-qualified',
      reason: `confirmation threshold not met: need ${MVP_CONFIRMATION_THRESHOLD} consecutive observations, got ${observation.consecutiveOutOfRangeCount}`,
    };
  }

  const trigger: ExitTrigger = {
    triggerId: `trigger-${observation.positionId}-${observation.observedAt}` as ExitTriggerId,
    positionId: observation.positionId,
    breachDirection: observation.direction,
    triggeredAt: observation.observedAt,
    confirmationEvaluatedAt: observation.observedAt,
    confirmationPassed: true,
    episodeId: observation.episodeId as BreachEpisodeId,
  };

  return { kind: 'qualified', trigger };
}
```

- [ ] **Step 3.5: Run tests — expect PASS**

```bash
pnpm --filter @clmm/domain test
```

Expected: all TriggerQualificationService tests pass.

- [ ] **Step 3.6: Commit**

```bash
git add packages/domain/src/triggers/
git commit -m "feat(domain): add triggers model and TriggerQualificationService (TDD)"
```

---

## Task 4: DirectionalExitPolicyService — THE CORE INVARIANT (TDD)

This is the most critical file in the entire codebase. It must be exhaustively tested for both breach directions. Any mistake here is a release blocker.

**Files:**
- Create: `packages/domain/src/exit-policy/DirectionalExitPolicyService.ts`
- Create: `packages/domain/src/exit-policy/DirectionalExitPolicyService.test.ts`

- [ ] **Step 4.1: Write exhaustive failing tests — both directions**

`packages/domain/src/exit-policy/DirectionalExitPolicyService.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { applyDirectionalExitPolicy } from './DirectionalExitPolicyService.js';
import {
  LOWER_BOUND_BREACH,
  UPPER_BOUND_BREACH,
  type BreachDirection,
} from '../shared/index.js';

describe('DirectionalExitPolicyService', () => {
  describe('LOWER BOUND BREACH → ExitToUSDC + SOL→USDC swap', () => {
    const result = applyDirectionalExitPolicy(LOWER_BOUND_BREACH);

    it('produces exit-to-usdc posture', () => {
      expect(result.postExitPosture.kind).toBe('exit-to-usdc');
    });

    it('swap instruction is SOL → USDC', () => {
      expect(result.swapInstruction.fromAsset).toBe('SOL');
      expect(result.swapInstruction.toAsset).toBe('USDC');
    });

    it('swap instruction includes policyReason', () => {
      expect(result.swapInstruction.policyReason).toBeTruthy();
      expect(result.swapInstruction.policyReason.toLowerCase()).toContain('lower');
    });

    it('step order is: remove-liquidity, collect-fees, swap-assets', () => {
      const kinds = result.executionStepSkeleton.map((s) => s.kind);
      expect(kinds).toEqual(['remove-liquidity', 'collect-fees', 'swap-assets']);
    });

    it('swap step carries the SOL→USDC instruction', () => {
      const swapStep = result.executionStepSkeleton[2];
      expect(swapStep?.kind).toBe('swap-assets');
      if (swapStep?.kind === 'swap-assets') {
        expect(swapStep.instruction.fromAsset).toBe('SOL');
        expect(swapStep.instruction.toAsset).toBe('USDC');
      }
    });
  });

  describe('UPPER BOUND BREACH → ExitToSOL + USDC→SOL swap', () => {
    const result = applyDirectionalExitPolicy(UPPER_BOUND_BREACH);

    it('produces exit-to-sol posture', () => {
      expect(result.postExitPosture.kind).toBe('exit-to-sol');
    });

    it('swap instruction is USDC → SOL', () => {
      expect(result.swapInstruction.fromAsset).toBe('USDC');
      expect(result.swapInstruction.toAsset).toBe('SOL');
    });

    it('swap instruction includes policyReason', () => {
      expect(result.swapInstruction.policyReason).toBeTruthy();
      expect(result.swapInstruction.policyReason.toLowerCase()).toContain('upper');
    });

    it('step order is: remove-liquidity, collect-fees, swap-assets', () => {
      const kinds = result.executionStepSkeleton.map((s) => s.kind);
      expect(kinds).toEqual(['remove-liquidity', 'collect-fees', 'swap-assets']);
    });

    it('swap step carries the USDC→SOL instruction', () => {
      const swapStep = result.executionStepSkeleton[2];
      expect(swapStep?.kind).toBe('swap-assets');
      if (swapStep?.kind === 'swap-assets') {
        expect(swapStep.instruction.fromAsset).toBe('USDC');
        expect(swapStep.instruction.toAsset).toBe('SOL');
      }
    });
  });

  describe('exhaustive direction coverage', () => {
    const directions: BreachDirection[] = [LOWER_BOUND_BREACH, UPPER_BOUND_BREACH];

    it('every BreachDirection kind produces a non-generic result', () => {
      for (const direction of directions) {
        const result = applyDirectionalExitPolicy(direction);
        // Neither result may be direction-agnostic
        if (direction.kind === 'lower-bound-breach') {
          expect(result.postExitPosture.kind).toBe('exit-to-usdc');
          expect(result.swapInstruction.fromAsset).toBe('SOL');
        } else {
          expect(result.postExitPosture.kind).toBe('exit-to-sol');
          expect(result.swapInstruction.fromAsset).toBe('USDC');
        }
      }
    });

    it('lower-bound and upper-bound results are never identical', () => {
      const lower = applyDirectionalExitPolicy(LOWER_BOUND_BREACH);
      const upper = applyDirectionalExitPolicy(UPPER_BOUND_BREACH);
      expect(lower.postExitPosture.kind).not.toBe(upper.postExitPosture.kind);
      expect(lower.swapInstruction.fromAsset).not.toBe(upper.swapInstruction.fromAsset);
    });
  });
});
```

- [ ] **Step 4.2: Run — expect FAIL (not implemented yet)**

```bash
pnpm --filter @clmm/domain test
```

Expected: FAIL — `applyDirectionalExitPolicy` not found.

- [ ] **Step 4.3: Write the execution types (needed by the service)**

`packages/domain/src/execution/index.ts`:
```typescript
import type { AssetSymbol, PostExitAssetPosture, TokenAmount } from '../shared/index.js';

export type SwapInstruction = {
  readonly fromAsset: AssetSymbol;
  readonly toAsset: AssetSymbol;
  readonly policyReason: string;
  readonly amountBasis?: TokenAmount; // populated later when quote is available
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
```

- [ ] **Step 4.4: Write the DirectionalExitPolicyService**

`packages/domain/src/exit-policy/DirectionalExitPolicyService.ts`:
```typescript
/**
 * DirectionalExitPolicyService
 *
 * THE CORE PRODUCT INVARIANT — DO NOT RE-DERIVE ELSEWHERE.
 *
 * LowerBoundBreach → RemoveLiquidity → CollectFees → Swap SOL→USDC → ExitToUSDC
 * UpperBoundBreach → RemoveLiquidity → CollectFees → Swap USDC→SOL → ExitToSOL
 *
 * This mapping lives ONLY here. It must not be re-derived in adapters, UI, or
 * anywhere outside this file.
 */

import type { BreachDirection, PostExitAssetPosture } from '../shared/index.js';
import { EXIT_TO_USDC, EXIT_TO_SOL } from '../shared/index.js';
import type { ExecutionStep, SwapInstruction } from '../execution/index.js';

export type DirectionalExitPolicyResult = {
  readonly postExitPosture: PostExitAssetPosture;
  readonly swapInstruction: SwapInstruction;
  readonly executionStepSkeleton: readonly ExecutionStep[];
};

export function applyDirectionalExitPolicy(
  direction: BreachDirection,
): DirectionalExitPolicyResult {
  switch (direction.kind) {
    case 'lower-bound-breach': {
      const swapInstruction: SwapInstruction = {
        fromAsset: 'SOL',
        toAsset: 'USDC',
        policyReason:
          'lower-bound breach: position is fully in SOL; swap to USDC to exit directional exposure',
      };
      return {
        postExitPosture: EXIT_TO_USDC,
        swapInstruction,
        executionStepSkeleton: [
          { kind: 'remove-liquidity' },
          { kind: 'collect-fees' },
          { kind: 'swap-assets', instruction: swapInstruction },
        ],
      };
    }

    case 'upper-bound-breach': {
      const swapInstruction: SwapInstruction = {
        fromAsset: 'USDC',
        toAsset: 'SOL',
        policyReason:
          'upper-bound breach: position is fully in USDC; swap to SOL to exit directional exposure',
      };
      return {
        postExitPosture: EXIT_TO_SOL,
        swapInstruction,
        executionStepSkeleton: [
          { kind: 'remove-liquidity' },
          { kind: 'collect-fees' },
          { kind: 'swap-assets', instruction: swapInstruction },
        ],
      };
    }

    default: {
      // TypeScript exhaustiveness check — this branch is unreachable
      const _exhaustive: never = direction;
      throw new Error(
        `Unhandled BreachDirection: ${JSON.stringify(_exhaustive)}`,
      );
    }
  }
}
```

- [ ] **Step 4.5: Run tests — ALL must pass**

```bash
pnpm --filter @clmm/domain test
```

Expected: all DirectionalExitPolicyService tests pass with 100% branch coverage.

- [ ] **Step 4.6: Verify coverage — both branches covered**

```bash
pnpm --filter @clmm/domain test --coverage
```

Expected: `DirectionalExitPolicyService.ts` shows 100% branches covered.

- [ ] **Step 4.7: Commit**

```bash
git add packages/domain/src/exit-policy/ packages/domain/src/execution/index.ts
git commit -m "feat(domain): add DirectionalExitPolicyService with exhaustive tests

CORE INVARIANT:
- LowerBoundBreach → ExitToUSDC + SOL→USDC swap
- UpperBoundBreach → ExitToSOL + USDC→SOL swap
- 100% branch coverage on both directions
- TypeScript exhaustiveness check prevents unhandled BreachDirection"
```

---

## Task 5: ExecutionPlanFactory (TDD)

**Files:**
- Create: `packages/domain/src/execution/ExecutionPlanFactory.ts`
- Create: `packages/domain/src/execution/ExecutionPlanFactory.test.ts`

- [ ] **Step 5.1: Write failing tests**

`packages/domain/src/execution/ExecutionPlanFactory.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { buildExecutionPlan } from './ExecutionPlanFactory.js';
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH } from '../shared/index.js';

describe('ExecutionPlanFactory', () => {
  it('builds a downside plan with SOL→USDC swap and ExitToUSDC posture', () => {
    const plan = buildExecutionPlan(LOWER_BOUND_BREACH);
    expect(plan.postExitPosture.kind).toBe('exit-to-usdc');
    expect(plan.swapInstruction.fromAsset).toBe('SOL');
    expect(plan.swapInstruction.toAsset).toBe('USDC');
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps[0]?.kind).toBe('remove-liquidity');
    expect(plan.steps[1]?.kind).toBe('collect-fees');
    expect(plan.steps[2]?.kind).toBe('swap-assets');
  });

  it('builds an upside plan with USDC→SOL swap and ExitToSOL posture', () => {
    const plan = buildExecutionPlan(UPPER_BOUND_BREACH);
    expect(plan.postExitPosture.kind).toBe('exit-to-sol');
    expect(plan.swapInstruction.fromAsset).toBe('USDC');
    expect(plan.swapInstruction.toAsset).toBe('SOL');
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps[2]?.kind).toBe('swap-assets');
  });

  it('plan is never direction-agnostic', () => {
    const downside = buildExecutionPlan(LOWER_BOUND_BREACH);
    const upside = buildExecutionPlan(UPPER_BOUND_BREACH);
    expect(downside.postExitPosture.kind).not.toBe(upside.postExitPosture.kind);
  });
});
```

- [ ] **Step 5.2: Run — confirm FAIL**

```bash
pnpm --filter @clmm/domain test
```

Expected: FAIL.

- [ ] **Step 5.3: Write implementation**

`packages/domain/src/execution/ExecutionPlanFactory.ts`:
```typescript
import type { BreachDirection } from '../shared/index.js';
import { applyDirectionalExitPolicy } from '../exit-policy/DirectionalExitPolicyService.js';
import type { ExecutionPlan } from './index.js';

export function buildExecutionPlan(direction: BreachDirection): ExecutionPlan {
  const policy = applyDirectionalExitPolicy(direction);
  return {
    steps: policy.executionStepSkeleton,
    postExitPosture: policy.postExitPosture,
    swapInstruction: policy.swapInstruction,
  };
}
```

- [ ] **Step 5.4: Run tests — expect PASS**

```bash
pnpm --filter @clmm/domain test
```

Expected: passes.

- [ ] **Step 5.5: Commit**

```bash
git add packages/domain/src/execution/ExecutionPlanFactory.ts packages/domain/src/execution/ExecutionPlanFactory.test.ts
git commit -m "feat(domain): add ExecutionPlanFactory"
```

---

## Task 6: PreviewFreshnessPolicy (TDD)

**Files:**
- Create: `packages/domain/src/execution/PreviewFreshnessPolicy.ts`
- Create: `packages/domain/src/execution/PreviewFreshnessPolicy.test.ts`

- [ ] **Step 6.1: Write failing tests**

`packages/domain/src/execution/PreviewFreshnessPolicy.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { evaluatePreviewFreshness } from './PreviewFreshnessPolicy.js';

const PREVIEW_TTL_MS = 60_000; // 60 seconds

describe('PreviewFreshnessPolicy', () => {
  const estimatedAt = 1_000_000;

  it('returns fresh when within TTL', () => {
    const now = estimatedAt + 30_000;
    const result = evaluatePreviewFreshness(estimatedAt, now);
    expect(result.kind).toBe('fresh');
  });

  it('returns stale when past half-TTL but within TTL', () => {
    const now = estimatedAt + 45_000;
    const result = evaluatePreviewFreshness(estimatedAt, now);
    expect(result.kind).toBe('stale');
  });

  it('returns expired when past TTL', () => {
    const now = estimatedAt + PREVIEW_TTL_MS + 1;
    const result = evaluatePreviewFreshness(estimatedAt, now);
    expect(result.kind).toBe('expired');
  });

  it('fresh result includes expiresAt', () => {
    const now = estimatedAt + 10_000;
    const result = evaluatePreviewFreshness(estimatedAt, now);
    expect(result.kind).toBe('fresh');
    if (result.kind === 'fresh') {
      expect(result.expiresAt).toBe(estimatedAt + PREVIEW_TTL_MS);
    }
  });
});
```

- [ ] **Step 6.2: Run — FAIL**

```bash
pnpm --filter @clmm/domain test
```

- [ ] **Step 6.3: Write implementation**

`packages/domain/src/execution/PreviewFreshnessPolicy.ts`:
```typescript
import type { PreviewFreshness } from './index.js';

// MVP constants — not user-configurable
const PREVIEW_TTL_MS = 60_000;       // total preview lifetime
const PREVIEW_STALE_AFTER_MS = 30_000; // warn stale after this

export function evaluatePreviewFreshness(
  estimatedAt: number,
  now: number,
): PreviewFreshness {
  const age = now - estimatedAt;

  if (age > PREVIEW_TTL_MS) {
    return { kind: 'expired' };
  }

  if (age > PREVIEW_STALE_AFTER_MS) {
    return { kind: 'stale' };
  }

  return { kind: 'fresh', expiresAt: estimatedAt + PREVIEW_TTL_MS };
}
```

- [ ] **Step 6.4: Run — PASS**

```bash
pnpm --filter @clmm/domain test
```

- [ ] **Step 6.5: Commit**

```bash
git add packages/domain/src/execution/PreviewFreshnessPolicy.ts packages/domain/src/execution/PreviewFreshnessPolicy.test.ts
git commit -m "feat(domain): add PreviewFreshnessPolicy (fresh/stale/expired)"
```

---

## Task 7: RetryBoundaryPolicy (TDD)

**Files:**
- Create: `packages/domain/src/execution/RetryBoundaryPolicy.ts`
- Create: `packages/domain/src/execution/RetryBoundaryPolicy.test.ts`

- [ ] **Step 7.1: Write failing tests**

`packages/domain/src/execution/RetryBoundaryPolicy.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { evaluateRetryEligibility } from './RetryBoundaryPolicy.js';
import type { ExecutionAttempt } from './index.js';

const baseAttempt: ExecutionAttempt = {
  lifecycleState: { kind: 'failed' },
  completedSteps: [],
  transactionReferences: [],
};

describe('RetryBoundaryPolicy', () => {
  describe('full retry allowed when no chain step confirmed', () => {
    it('eligible after failed with no completed steps', () => {
      const result = evaluateRetryEligibility(baseAttempt);
      expect(result.kind).toBe('eligible');
    });

    it('eligible after expired with no completed steps', () => {
      const result = evaluateRetryEligibility({
        ...baseAttempt,
        lifecycleState: { kind: 'expired' },
      });
      expect(result.kind).toBe('eligible');
    });
  });

  describe('retry BLOCKED after partial completion', () => {
    it('ineligible when in partial state', () => {
      const result = evaluateRetryEligibility({
        ...baseAttempt,
        lifecycleState: { kind: 'partial' },
        completedSteps: ['remove-liquidity'],
      });
      expect(result.kind).toBe('ineligible');
      if (result.kind === 'ineligible') {
        expect(result.reason).toContain('partial');
      }
    });

    it('ineligible when failed but chain steps already confirmed', () => {
      const result = evaluateRetryEligibility({
        ...baseAttempt,
        lifecycleState: { kind: 'failed' },
        completedSteps: ['remove-liquidity'],
      });
      expect(result.kind).toBe('ineligible');
    });
  });

  describe('terminal states block retry permanently', () => {
    it.each([
      { kind: 'confirmed' as const },
      { kind: 'abandoned' as const },
    ])('$kind is ineligible', ({ kind }) => {
      const result = evaluateRetryEligibility({
        ...baseAttempt,
        lifecycleState: { kind },
      });
      expect(result.kind).toBe('ineligible');
    });
  });

  describe('in-flight states block retry', () => {
    it.each([
      { kind: 'awaiting-signature' as const },
      { kind: 'submitted' as const },
    ])('$kind is ineligible', ({ kind }) => {
      const result = evaluateRetryEligibility({
        ...baseAttempt,
        lifecycleState: { kind },
      });
      expect(result.kind).toBe('ineligible');
    });
  });
});
```

- [ ] **Step 7.2: Run — FAIL**

```bash
pnpm --filter @clmm/domain test
```

- [ ] **Step 7.3: Write implementation**

`packages/domain/src/execution/RetryBoundaryPolicy.ts`:
```typescript
import type { ExecutionAttempt, RetryEligibility } from './index.js';

export function evaluateRetryEligibility(
  attempt: ExecutionAttempt,
): RetryEligibility {
  const { lifecycleState, completedSteps } = attempt;

  // Partial is PERMANENTLY ineligible regardless of completed steps
  if (lifecycleState.kind === 'partial') {
    return {
      kind: 'ineligible',
      reason:
        'partial completion: one or more chain steps confirmed; full replay is forbidden',
    };
  }

  // Terminal states block retry
  if (
    lifecycleState.kind === 'confirmed' ||
    lifecycleState.kind === 'abandoned'
  ) {
    return {
      kind: 'ineligible',
      reason: `${lifecycleState.kind} is a terminal state; no retry possible`,
    };
  }

  // In-flight states block retry
  if (
    lifecycleState.kind === 'awaiting-signature' ||
    lifecycleState.kind === 'submitted'
  ) {
    return {
      kind: 'ineligible',
      reason: `execution is currently ${lifecycleState.kind}; wait for resolution`,
    };
  }

  // failed or expired — eligible only if no chain steps confirmed
  if (completedSteps.length > 0) {
    return {
      kind: 'ineligible',
      reason: `${completedSteps.length} chain step(s) already confirmed; full replay forbidden`,
    };
  }

  return {
    kind: 'eligible',
    reason: 'no chain steps confirmed; full retry from refreshed preview is safe',
  };
}
```

- [ ] **Step 7.4: Run — PASS**

```bash
pnpm --filter @clmm/domain test
```

- [ ] **Step 7.5: Commit**

```bash
git add packages/domain/src/execution/RetryBoundaryPolicy.ts packages/domain/src/execution/RetryBoundaryPolicy.test.ts
git commit -m "feat(domain): add RetryBoundaryPolicy (partial→never retry)"
```

---

## Task 8: ExecutionStateReducer (TDD)

**Files:**
- Create: `packages/domain/src/execution/ExecutionStateReducer.ts`
- Create: `packages/domain/src/execution/ExecutionStateReducer.test.ts`

- [ ] **Step 8.1: Write failing tests covering valid transitions AND forbidden ones**

`packages/domain/src/execution/ExecutionStateReducer.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { applyLifecycleTransition } from './ExecutionStateReducer.js';
import type { ExecutionLifecycleState } from './index.js';

type StateKind = ExecutionLifecycleState['kind'];

function state(kind: StateKind): ExecutionLifecycleState {
  return { kind } as ExecutionLifecycleState;
}

describe('ExecutionStateReducer — valid transitions', () => {
  it('previewed → awaiting-signature', () => {
    const result = applyLifecycleTransition(state('previewed'), 'request-signature');
    expect(result.kind).toBe('awaiting-signature');
  });

  it('awaiting-signature → submitted', () => {
    const result = applyLifecycleTransition(state('awaiting-signature'), 'submit');
    expect(result.kind).toBe('submitted');
  });

  it('awaiting-signature → abandoned (decline)', () => {
    const result = applyLifecycleTransition(state('awaiting-signature'), 'decline');
    expect(result.kind).toBe('abandoned');
  });

  it('awaiting-signature → expired', () => {
    const result = applyLifecycleTransition(state('awaiting-signature'), 'expire');
    expect(result.kind).toBe('expired');
  });

  it('submitted → confirmed', () => {
    const result = applyLifecycleTransition(state('submitted'), 'confirm');
    expect(result.kind).toBe('confirmed');
  });

  it('submitted → failed', () => {
    const result = applyLifecycleTransition(state('submitted'), 'fail');
    expect(result.kind).toBe('failed');
  });

  it('submitted → partial', () => {
    const result = applyLifecycleTransition(state('submitted'), 'partial-completion');
    expect(result.kind).toBe('partial');
  });

  it('failed → previewed (retry, no chain step confirmed)', () => {
    const result = applyLifecycleTransition(state('failed'), 'reset-to-preview');
    expect(result.kind).toBe('previewed');
  });

  it('expired → previewed (retry, no chain step confirmed)', () => {
    const result = applyLifecycleTransition(state('expired'), 'reset-to-preview');
    expect(result.kind).toBe('previewed');
  });
});

describe('ExecutionStateReducer — forbidden transitions', () => {
  it.each([
    ['partial', 'reset-to-preview'],
    ['partial', 'submit'],
    ['confirmed', 'submit'],
    ['confirmed', 'reset-to-preview'],
    ['abandoned', 'submit'],
    ['abandoned', 'reset-to-preview'],
  ] as Array<[StateKind, string]>)(
    'FORBIDDEN: %s → cannot apply %s',
    (fromKind, event) => {
      expect(() =>
        applyLifecycleTransition(state(fromKind), event),
      ).toThrow();
    },
  );
});
```

- [ ] **Step 8.2: Run — FAIL**

```bash
pnpm --filter @clmm/domain test
```

- [ ] **Step 8.3: Write implementation**

`packages/domain/src/execution/ExecutionStateReducer.ts`:
```typescript
import type { ExecutionLifecycleState } from './index.js';

type LifecycleEvent =
  | 'request-signature'
  | 'submit'
  | 'decline'
  | 'expire'
  | 'confirm'
  | 'fail'
  | 'partial-completion'
  | 'reset-to-preview';

export function applyLifecycleTransition(
  current: ExecutionLifecycleState,
  event: LifecycleEvent,
): ExecutionLifecycleState {
  switch (current.kind) {
    case 'previewed':
      if (event === 'request-signature') return { kind: 'awaiting-signature' };
      break;

    case 'awaiting-signature':
      if (event === 'submit') return { kind: 'submitted' };
      if (event === 'decline') return { kind: 'abandoned' };
      if (event === 'expire') return { kind: 'expired' };
      break;

    case 'submitted':
      if (event === 'confirm') return { kind: 'confirmed' };
      if (event === 'fail') return { kind: 'failed' };
      if (event === 'partial-completion') return { kind: 'partial' };
      break;

    case 'failed':
      if (event === 'reset-to-preview') return { kind: 'previewed' };
      break;

    case 'expired':
      if (event === 'reset-to-preview') return { kind: 'previewed' };
      break;

    case 'partial':
      // PERMANENTLY FORBIDDEN — partial never transitions
      throw new Error(
        `FORBIDDEN: partial state cannot transition; event=${event}. ` +
        'Partial completion requires explicit recovery guidance, not replay.',
      );

    case 'confirmed':
      throw new Error(
        `FORBIDDEN: confirmed is terminal; event=${event}`,
      );

    case 'abandoned':
      throw new Error(
        `FORBIDDEN: abandoned is terminal; event=${event}`,
      );
  }

  throw new Error(
    `Invalid transition: ${current.kind} + ${event}`,
  );
}
```

- [ ] **Step 8.4: Run — ALL PASS**

```bash
pnpm --filter @clmm/domain test
```

Expected: all state machine tests pass.

- [ ] **Step 8.5: Commit**

```bash
git add packages/domain/src/execution/ExecutionStateReducer.ts packages/domain/src/execution/ExecutionStateReducer.test.ts
git commit -m "feat(domain): add ExecutionStateReducer with valid/forbidden transitions

- partial→* PERMANENTLY FORBIDDEN
- confirmed/abandoned are terminal — throw on any event"
```

---

## Task 9: History Types

**Files:**
- Create: `packages/domain/src/history/index.ts`

- [ ] **Step 9.1: Write history types**

`packages/domain/src/history/index.ts`:
```typescript
import type {
  PositionId,
  BreachDirection,
  ClockTimestamp,
} from '../shared/index.js';
import type { ExecutionLifecycleState, TransactionReference } from '../execution/index.js';

export type HistoryEventType =
  | 'trigger-created'
  | 'preview-created'
  | 'preview-refreshed'
  | 'preview-expired'
  | 'signature-requested'
  | 'signature-declined'
  | 'submitted'
  | 'reconciliation-update'
  | 'confirmed'
  | 'failed'
  | 'partial-completion'
  | 'abandoned';

export type HistoryEvent = {
  readonly eventId: string;
  readonly positionId: PositionId;
  readonly eventType: HistoryEventType;
  readonly breachDirection: BreachDirection;
  readonly occurredAt: ClockTimestamp;
  readonly lifecycleState?: ExecutionLifecycleState;
  readonly transactionReference?: TransactionReference;
  // Explicitly NOT: receipt, attestation, proof, claim, or canonical certificate
};

export type HistoryTimeline = {
  readonly positionId: PositionId;
  readonly events: readonly HistoryEvent[];
};

export type ExecutionOutcomeSummary = {
  readonly positionId: PositionId;
  readonly breachDirection: BreachDirection;
  readonly finalState: ExecutionLifecycleState;
  readonly transactionReferences: readonly TransactionReference[];
  readonly completedAt: ClockTimestamp;
  // Note: this is an operational summary, NOT an on-chain receipt or attestation
};
```

- [ ] **Step 9.2: Typecheck**

```bash
pnpm --filter @clmm/domain typecheck
```

Expected: exits 0.

- [ ] **Step 9.3: Commit**

```bash
git add packages/domain/src/history/
git commit -m "feat(domain): add HistoryEvent, HistoryTimeline, ExecutionOutcomeSummary"
```

---

## Task 10: Domain Public Barrel + Final Tests

**Files:**
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 10.1: Update domain public barrel**

`packages/domain/src/index.ts`:
```typescript
// Shared value objects
export * from './shared/index.js';

// Positions + range state
export * from './positions/index.js';

// Triggers
export * from './triggers/index.js';
export { qualifyTrigger } from './triggers/TriggerQualificationService.js';
export type {
  BreachObservation,
  TriggerQualificationResult,
} from './triggers/TriggerQualificationService.js';

// Exit policy — THE CORE INVARIANT
export { applyDirectionalExitPolicy } from './exit-policy/DirectionalExitPolicyService.js';
export type { DirectionalExitPolicyResult } from './exit-policy/DirectionalExitPolicyService.js';

// Execution types + factories + policies
export * from './execution/index.js';
export { buildExecutionPlan } from './execution/ExecutionPlanFactory.js';
export { evaluatePreviewFreshness } from './execution/PreviewFreshnessPolicy.js';
export { evaluateRetryEligibility } from './execution/RetryBoundaryPolicy.js';
export { applyLifecycleTransition } from './execution/ExecutionStateReducer.js';

// History
export * from './history/index.js';
```

- [ ] **Step 10.2: Run full domain test suite with coverage**

```bash
pnpm --filter @clmm/domain test --coverage
```

Expected: all tests pass. `DirectionalExitPolicyService.ts` must show 100% branch coverage.

- [ ] **Step 10.3: Run banned-concept scanner**

```bash
pnpm --filter @clmm/config test
```

Expected: passes — no Receipt/Attestation/Proof/ClaimVerification in domain.

- [ ] **Step 10.4: Run boundaries**

```bash
pnpm boundaries
```

Expected: exits 0 — domain imports no external packages.

- [ ] **Step 10.5: Commit**

```bash
git add packages/domain/src/index.ts
git commit -m "feat(domain): complete domain barrel export

Epic 2 complete: all domain types, services, and policies implemented and tested"
```

---

## Epic 2 Done-When

- [ ] `pnpm --filter @clmm/domain test --coverage` exits 0 with 100% branch coverage on `DirectionalExitPolicyService`
- [ ] All ExecutionStateReducer transitions tested — valid, invalid, partial→* forbidden
- [ ] `pnpm boundaries` exits 0 — domain has no external SDK imports
- [ ] `pnpm --filter @clmm/config test` exits 0 — no banned concepts in domain code
- [ ] `applyDirectionalExitPolicy(LOWER_BOUND_BREACH)` → `exit-to-usdc` + `SOL→USDC`
- [ ] `applyDirectionalExitPolicy(UPPER_BOUND_BREACH)` → `exit-to-sol` + `USDC→SOL`
- [ ] TypeScript exhaustiveness check in `DirectionalExitPolicyService` prevents unhandled BreachDirection
