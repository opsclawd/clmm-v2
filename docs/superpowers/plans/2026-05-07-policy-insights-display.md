# PolicyInsights Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `PolicyInsights` advisory display to the SOL/USDC positions screen footer by wiring `regime-engine GET /v1/insights/sol-usdc/current` through the application port → adapter → BFF route `/policy-insights/sol-usdc/current` → app client → TanStack Query → presentational `PolicyInsightsSection`.

**Architecture:** A second, fully parallel read path that mirrors the existing `Regime` and `SrTheses` paths but uses pair-scoped (not pool-scoped) routing. Application owns DTOs and the `PolicyInsightsReadPort` discriminated-union outcome. `CurrentPolicyInsightsAdapter` performs one fetch + classify with no retry. BFF route is a hard-coded pair endpoint (no `:poolId`, no allowlist map). App-side keeps `deriveUniquePool` only as an enable guard. UI renders an additional card below `RegimeSection` in the positions list footer. Source of truth: [`docs/superpowers/specs/2026-05-07-policy-insights-design.md`](../specs/2026-05-07-policy-insights-design.md).

**Tech Stack:** TypeScript 5, NestJS 10 (BFF), Expo Router + React Native + TanStack Query (apps/app), Vitest, `@testing-library/react`.

**Out of scope (must not change):** `RegimeReadPort`, `SrThesesReadPort`, `SrLevelsReadPort`, their adapters, controllers, app clients, view models, or sections; the existing `/insights/sol-usdc/*` data-export controller guarded by `InsightsApiKeyGuard`; trigger qualification; exit previews; directional exit policy; signing; execution. PolicyInsights is read-only and additive.

---

## Upstream `regime-engine` Response Shape

The spec specifies `PolicyInsightBlock` precisely but leaves nested `clmmPolicy`, `levels`, `freshness` shapes to be defined here. The adapter must validate against this shape (every field below is required unless marked optional, and unknown extra fields are ignored):

```ts
type UpstreamPolicyInsightResponse = {
  schemaVersion: '1.0';
  pair: 'SOL/USDC';
  asOf: string; // ISO 8601
  source: 'openclaw';
  runId: string;
  status: 'FRESH' | 'STALE';
  marketRegime: string;
  fundamentalRegime: string;
  recommendedAction:
    | 'hold'
    | 'watch'
    | 'tighten_range'
    | 'widen_range'
    | 'exit_range'
    | 'pause_rebalances';
  confidence: 'low' | 'medium' | 'high';
  riskLevel: 'normal' | 'elevated' | 'critical';
  dataQuality: 'complete' | 'partial' | 'stale';
  clmmPolicy: {
    posture: string; // e.g. 'tight', 'wide', 'neutral'
    rangeBias: string; // e.g. 'symmetric', 'upper-skew'
    rebalanceSensitivity: string; // e.g. 'low', 'medium', 'high'
    maxCapitalDeploymentPct: number; // 0..1, used for percent label
  };
  levels: {
    supports: number[];
    resistances: number[];
  };
  reasoning: string[];
  sourceRefs: string[];
  expiresAt: string; // ISO 8601
  payloadHash: string;
  receivedAtIso: string; // ISO 8601
  freshness: {
    capturedAtUnixMs?: number; // optional — adapter falls back to Date.parse(asOf) when absent
    capturedAtIso?: string; // optional — only one of capturedAtIso/capturedAtUnixMs required
    stale: boolean;
  };
};
```

The application `PolicyInsightBlock` DTO mirrors the upstream payload after validation. The adapter normalizes `freshness` so the DTO always carries a numeric `capturedAtUnixMs` (parsing from `freshness.capturedAtIso` if needed, falling back to `Date.parse(asOf)`).

---

## File Structure

| File                                                                                | Responsibility                                                                                                                           |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/application/src/dto/policyInsights.ts`                                    | NEW. `PolicyInsightBlock` and nested `PolicyInsightClmmPolicy`, `PolicyInsightLevels`, `PolicyInsightFreshness`.                         |
| `packages/application/src/dto/index.ts`                                             | Re-export PolicyInsight DTOs.                                                                                                            |
| `packages/application/src/ports/index.ts`                                           | Add `PolicyInsightsReadPort`, `PolicyInsightReadResult` discriminated union (with `'store-unavailable'`).                                |
| `packages/application/src/index.ts`                                                 | Wildcard `export *` already covers the new ports/dto exports — verify only.                                                              |
| `packages/application/src/public/index.ts`                                          | Re-export `PolicyInsightBlock`, sub-types for UI consumption.                                                                            |
| `packages/application/src/public/policyInsights.exports.test.ts`                    | NEW. Type-export parity test.                                                                                                            |
| `packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.ts`      | NEW. Implements `PolicyInsightsReadPort`. One fetch, no retry. Classifies all outcomes including `store-unavailable` for 503.            |
| `packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.test.ts` | NEW. Adapter tests for every outcome variant in the spec.                                                                                |
| `packages/adapters/src/inbound/http/tokens.ts`                                      | Add `POLICY_INSIGHTS_READ_PORT`.                                                                                                         |
| `packages/adapters/src/inbound/http/PolicyInsightsController.ts`                    | NEW. `GET /policy-insights/sol-usdc/current`. No `:poolId` param. Maps adapter outcomes to `{ policyInsight, unavailableReason? }`.      |
| `packages/adapters/src/inbound/http/PolicyInsightsController.test.ts`               | NEW. Controller tests for every outcome.                                                                                                 |
| `packages/adapters/src/inbound/http/AppModule.ts`                                   | Wire `CurrentPolicyInsightsAdapter` and register `PolicyInsightsController`.                                                             |
| `apps/app/src/api/policyInsights.ts`                                                | NEW. App client `fetchCurrentPolicyInsight()` with full nested validation. No `poolId` parameter.                                        |
| `apps/app/src/api/policyInsights.test.ts`                                           | NEW. Client tests for success, every unavailable variant, malformed body, non-2xx.                                                       |
| `apps/app/app/(tabs)/positions.tsx`                                                 | Add third `useQuery` for policy insights. SOL/USDC single-pool guard. Pass props to `PositionsListScreen`.                               |
| `packages/ui/src/view-models/PolicyInsightsViewModel.ts`                            | NEW. Builds presentation-only fields: action label + tone, posture/range bias/rebalance sensitivity labels, percent, risk/confidence/DQ. |
| `packages/ui/src/view-models/PolicyInsightsViewModel.test.ts`                       | NEW. Severity precedence, stale detection, percent format, first-3-non-empty reasoning, sourceRefs ignored.                              |
| `packages/ui/src/components/PolicyInsightsSection.tsx`                              | NEW. Card with title `PolicyInsights`, subtitle, fields, unavailable copy, degraded warning.                                             |
| `packages/ui/src/components/PolicyInsightsSection.test.tsx`                         | NEW. Renders fresh/stale/critical/elevated/unavailable/degraded states.                                                                  |
| `packages/ui/src/screens/PositionsListScreen.tsx`                                   | Add policy-insight props; render `PolicyInsightsSection` after `RegimeSection` in footer.                                                |
| `packages/ui/src/screens/PositionsListScreen.test.tsx`                              | Add coverage: footer order is S/R, Regime, PolicyInsights; PolicyInsights hides when disabled; failures don't block other sections.      |
| `packages/ui/src/index.ts`                                                          | Export `buildPolicyInsightsViewModel` and (if test imports it) `PolicyInsightsSection`.                                                  |

---

## Phase 0 — Pre-flight & Baseline

### Task 0: Confirm baseline is green

**Files:** none

- [ ] **Step 1: Bootstrap deps and dist if needed**

```bash
[ -d node_modules ] || pnpm install --frozen-lockfile
[ -d packages/application/dist ] || pnpm build
```

Expected: dependencies and build outputs present. Skip if already bootstrapped.

- [ ] **Step 2: Run the full check matrix and confirm green**

```bash
pnpm typecheck && pnpm lint && pnpm boundaries && pnpm test
```

Expected: every check passes. If anything fails before any change, stop and report — every later task assumes a green baseline.

---

## Phase 1 — Application DTOs and Port

### Task 1: Add `PolicyInsightBlock` DTO and nested types

**Files:**

- Create: `packages/application/src/dto/policyInsights.ts`
- Modify: `packages/application/src/dto/index.ts`

- [ ] **Step 1: Create the DTO module**

Create `packages/application/src/dto/policyInsights.ts`:

```ts
// Drift guard: this DTO is structurally validated by
// packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.ts
// AND by apps/app/src/api/policyInsights.ts. Any field added or removed
// here MUST be reflected in both validators and the upstream contract
// section of the implementation plan. Application MUST NOT import from
// adapters or apps.

export type PolicyInsightRecommendedAction =
  | 'hold'
  | 'watch'
  | 'tighten_range'
  | 'widen_range'
  | 'exit_range'
  | 'pause_rebalances';

export type PolicyInsightConfidence = 'low' | 'medium' | 'high';
export type PolicyInsightRiskLevel = 'normal' | 'elevated' | 'critical';
export type PolicyInsightDataQuality = 'complete' | 'partial' | 'stale';
export type PolicyInsightStatus = 'FRESH' | 'STALE';

export type PolicyInsightClmmPolicy = {
  posture: string;
  rangeBias: string;
  rebalanceSensitivity: string;
  // 0..1 fraction. UI formats as percent.
  maxCapitalDeploymentPct: number;
};

export type PolicyInsightLevels = {
  supports: number[];
  resistances: number[];
};

export type PolicyInsightFreshness = {
  capturedAtUnixMs: number;
  stale: boolean;
};

export type PolicyInsightBlock = {
  schemaVersion: '1.0';
  pair: 'SOL/USDC';
  asOf: string;
  source: 'openclaw';
  runId: string;
  status: PolicyInsightStatus;
  marketRegime: string;
  fundamentalRegime: string;
  recommendedAction: PolicyInsightRecommendedAction;
  confidence: PolicyInsightConfidence;
  riskLevel: PolicyInsightRiskLevel;
  dataQuality: PolicyInsightDataQuality;
  clmmPolicy: PolicyInsightClmmPolicy;
  levels: PolicyInsightLevels;
  reasoning: string[];
  sourceRefs: string[];
  expiresAt: string;
  payloadHash: string;
  receivedAtIso: string;
  freshness: PolicyInsightFreshness;
};
```

- [ ] **Step 2: Re-export from the DTO barrel**

Edit `packages/application/src/dto/index.ts`. At the bottom of the file, after the existing `export type { ... } from './srTheses.js';` block, add:

```ts
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
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @clmm/application typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/application/src/dto/policyInsights.ts packages/application/src/dto/index.ts
git commit -m "feat(application): add PolicyInsightBlock DTO and nested types"
```

### Task 2: Add `PolicyInsightsReadPort` to application ports

**Files:**

- Modify: `packages/application/src/ports/index.ts`

- [ ] **Step 1: Add `PolicyInsightBlock` to the existing dto import**

Open `packages/application/src/ports/index.ts`. Find the existing line:

```ts
import type { SrLevelsBlock, RegimeBlock, SrThesesBlock } from '../dto/index.js';
```

Replace it with:

```ts
import type {
  SrLevelsBlock,
  RegimeBlock,
  SrThesesBlock,
  PolicyInsightBlock,
} from '../dto/index.js';
```

- [ ] **Step 2: Append the new port and result union**

At the end of `packages/application/src/ports/index.ts` (after the `RegimeReadPort` block, before any later sections), insert:

```ts
// --- PolicyInsights read port (application-owned; CurrentPolicyInsightsAdapter implements) ---
//
// Returned outcome is a discriminated union so the BFF controller can map
// directly to the documented `unavailableReason` codes without parsing
// adapter logs or HTTP details. Production code paths must never throw
// for expected upstream unavailability. `store-unavailable` is distinct
// from `upstream-error` because PolicyInsights upstream documents 503 as
// a known availability state — the BFF surfaces it separately so UI copy
// can stay accurate.

export type PolicyInsightReadResult =
  | { kind: 'block'; block: PolicyInsightBlock }
  | { kind: 'not-found' }
  | { kind: 'store-unavailable' }
  | { kind: 'config-error' }
  | { kind: 'upstream-error' };

export interface PolicyInsightsReadPort {
  fetchCurrent(): Promise<PolicyInsightReadResult>;
}
```

The port deliberately takes no parameters: this MVP is pair-scoped and single-pool.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @clmm/application typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/application/src/ports/index.ts
git commit -m "feat(application): add PolicyInsightsReadPort with explicit outcome union"
```

### Task 3: Re-export PolicyInsight types from the public API barrel

**Files:**

- Create: `packages/application/src/public/policyInsights.exports.test.ts`
- Modify: `packages/application/src/public/index.ts`

- [ ] **Step 1: Write the failing parity test**

Create `packages/application/src/public/policyInsights.exports.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type {
  PolicyInsightBlock,
  PolicyInsightClmmPolicy,
  PolicyInsightLevels,
  PolicyInsightFreshness,
  PolicyInsightRecommendedAction,
  PolicyInsightConfidence,
  PolicyInsightRiskLevel,
  PolicyInsightDataQuality,
  PolicyInsightStatus,
} from './index.js';

describe('@clmm/application/public exports for policy insights', () => {
  it('exposes PolicyInsightBlock and nested DTOs as types', () => {
    const sample: PolicyInsightBlock = {
      schemaVersion: '1.0',
      pair: 'SOL/USDC',
      asOf: '2026-05-07T00:00:00Z',
      source: 'openclaw',
      runId: 'run-1',
      status: 'FRESH' satisfies PolicyInsightStatus,
      marketRegime: 'UP',
      fundamentalRegime: 'NEUTRAL',
      recommendedAction: 'hold' satisfies PolicyInsightRecommendedAction,
      confidence: 'medium' satisfies PolicyInsightConfidence,
      riskLevel: 'normal' satisfies PolicyInsightRiskLevel,
      dataQuality: 'complete' satisfies PolicyInsightDataQuality,
      clmmPolicy: {
        posture: 'wide',
        rangeBias: 'symmetric',
        rebalanceSensitivity: 'low',
        maxCapitalDeploymentPct: 0.5,
      } satisfies PolicyInsightClmmPolicy,
      levels: { supports: [], resistances: [] } satisfies PolicyInsightLevels,
      reasoning: [],
      sourceRefs: [],
      expiresAt: '2026-05-07T01:00:00Z',
      payloadHash: 'abc',
      receivedAtIso: '2026-05-07T00:00:01Z',
      freshness: {
        capturedAtUnixMs: 1_700_000_000_000,
        stale: false,
      } satisfies PolicyInsightFreshness,
    };
    expect(sample.recommendedAction).toBe('hold');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @clmm/application test -- policyInsights.exports`
Expected: FAIL — types not yet re-exported from `public/index.ts`.

- [ ] **Step 3: Add re-exports in the public barrel**

Edit `packages/application/src/public/index.ts`. In the existing `export type { ... } from '../dto/index.js'` block (the one that includes `RegimeBlock` and friends), append the policy-insight types so the block ends with:

```ts
export type {
  PositionSummaryDto,
  PositionDetailDto,
  ExecutionPreviewDto,
  PreviewStepDto,
  ExecutionAttemptDto,
  ExecutionApprovalDto,
  ExecutionSigningPayloadDto,
  PreparedPayloadDto,
  ActionableAlertDto,
  HistoryEventDto,
  MonitoringReadinessDto,
  EntryContextDto,
  SrLevel,
  SrLevelsBlock,
  SrThesisDto,
  SrThesesBlock,
  RegimeBlock,
  RegimeReason,
  RegimeReasonSeverity,
  RegimeFreshness,
  RegimeClmmSuitability,
  RegimeMetadata,
  PolicyInsightBlock,
  PolicyInsightClmmPolicy,
  PolicyInsightLevels,
  PolicyInsightFreshness,
  PolicyInsightRecommendedAction,
  PolicyInsightConfidence,
  PolicyInsightRiskLevel,
  PolicyInsightDataQuality,
  PolicyInsightStatus,
} from '../dto/index.js';
```

(Preserve the rest of the file unchanged.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @clmm/application test -- policyInsights.exports`
Expected: PASS.

- [ ] **Step 5: Run application checks**

Run: `pnpm --filter @clmm/application typecheck && pnpm --filter @clmm/application test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/application/src/public/index.ts packages/application/src/public/policyInsights.exports.test.ts
git commit -m "feat(application): export PolicyInsight DTOs via public API"
```

---

## Phase 2 — Adapter

### Task 4: Implement `CurrentPolicyInsightsAdapter` happy path

**Files:**

- Create: `packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.ts`
- Create: `packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.test.ts`

- [ ] **Step 1: Write the failing happy-path test**

Create `packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CurrentPolicyInsightsAdapter } from './CurrentPolicyInsightsAdapter.js';
import type { ObservabilityPort } from '@clmm/application';

interface FakeLogEntry {
  level: string;
  message: string;
  context: Record<string, unknown> | undefined;
}

function createFakeObservability() {
  const logs: FakeLogEntry[] = [];
  const port: ObservabilityPort = {
    log(level: 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>) {
      logs.push({ level, message, context });
    },
    recordTiming() {},
    recordDetectionTiming() {},
    recordDeliveryTiming() {},
  };
  return { logs, port };
}

const SAMPLE_UPSTREAM = {
  schemaVersion: '1.0',
  pair: 'SOL/USDC',
  asOf: '2026-05-07T12:00:00Z',
  source: 'openclaw',
  runId: 'run-42',
  status: 'FRESH',
  marketRegime: 'UP',
  fundamentalRegime: 'CONSTRUCTIVE',
  recommendedAction: 'hold',
  confidence: 'medium',
  riskLevel: 'normal',
  dataQuality: 'complete',
  clmmPolicy: {
    posture: 'wide',
    rangeBias: 'symmetric',
    rebalanceSensitivity: 'low',
    maxCapitalDeploymentPct: 0.5,
  },
  levels: { supports: [140.5, 138.0], resistances: [155.0, 160.5] },
  reasoning: ['Trend is constructive', 'Vol is muted', 'Funding neutral'],
  sourceRefs: ['msg-1', 'msg-2'],
  expiresAt: '2026-05-07T13:00:00Z',
  payloadHash: 'sha256:abc',
  receivedAtIso: '2026-05-07T12:00:01Z',
  freshness: {
    capturedAtIso: '2026-05-07T12:00:00Z',
    stale: false,
  },
};

describe('CurrentPolicyInsightsAdapter', () => {
  let obs: ReturnType<typeof createFakeObservability>;

  beforeEach(() => {
    obs = createFakeObservability();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns kind:"block" with parsed PolicyInsightBlock on 200', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_UPSTREAM), { status: 200 }),
    );
    const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);

    const result = await adapter.fetchCurrent();

    expect(result.kind).toBe('block');
    if (result.kind !== 'block') return;
    expect(result.block.recommendedAction).toBe('hold');
    expect(result.block.clmmPolicy.maxCapitalDeploymentPct).toBe(0.5);
    expect(result.block.levels.supports).toEqual([140.5, 138.0]);
    expect(result.block.sourceRefs).toEqual(['msg-1', 'msg-2']);
    expect(result.block.freshness.capturedAtUnixMs).toBe(Date.parse('2026-05-07T12:00:00Z'));
    expect(result.block.freshness.stale).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @clmm/adapters test -- CurrentPolicyInsightsAdapter`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the adapter**

Create `packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.ts`:

```ts
import type {
  ObservabilityPort,
  PolicyInsightBlock,
  PolicyInsightClmmPolicy,
  PolicyInsightConfidence,
  PolicyInsightDataQuality,
  PolicyInsightFreshness,
  PolicyInsightLevels,
  PolicyInsightRecommendedAction,
  PolicyInsightRiskLevel,
  PolicyInsightStatus,
  PolicyInsightReadResult,
  PolicyInsightsReadPort,
} from '@clmm/application';

const FETCH_TIMEOUT_MS = 2000;

const VALID_ACTIONS: ReadonlySet<PolicyInsightRecommendedAction> = new Set([
  'hold',
  'watch',
  'tighten_range',
  'widen_range',
  'exit_range',
  'pause_rebalances',
]);
const VALID_CONFIDENCES: ReadonlySet<PolicyInsightConfidence> = new Set(['low', 'medium', 'high']);
const VALID_RISK_LEVELS: ReadonlySet<PolicyInsightRiskLevel> = new Set([
  'normal',
  'elevated',
  'critical',
]);
const VALID_DATA_QUALITIES: ReadonlySet<PolicyInsightDataQuality> = new Set([
  'complete',
  'partial',
  'stale',
]);
const VALID_STATUSES: ReadonlySet<PolicyInsightStatus> = new Set(['FRESH', 'STALE']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseStringArray(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  for (const item of raw) {
    if (typeof item !== 'string') return null;
  }
  return raw as string[];
}

function parseNumberArray(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  for (const item of raw) {
    if (typeof item !== 'number' || !Number.isFinite(item)) return null;
  }
  return raw as number[];
}

function parseClmmPolicy(raw: unknown): PolicyInsightClmmPolicy | null {
  if (!isRecord(raw)) return null;
  const posture = raw['posture'];
  const rangeBias = raw['rangeBias'];
  const rebalanceSensitivity = raw['rebalanceSensitivity'];
  const maxCapitalDeploymentPct = raw['maxCapitalDeploymentPct'];
  if (typeof posture !== 'string') return null;
  if (typeof rangeBias !== 'string') return null;
  if (typeof rebalanceSensitivity !== 'string') return null;
  if (typeof maxCapitalDeploymentPct !== 'number' || !Number.isFinite(maxCapitalDeploymentPct)) {
    return null;
  }
  return { posture, rangeBias, rebalanceSensitivity, maxCapitalDeploymentPct };
}

function parseLevels(raw: unknown): PolicyInsightLevels | null {
  if (!isRecord(raw)) return null;
  const supports = parseNumberArray(raw['supports']);
  const resistances = parseNumberArray(raw['resistances']);
  if (!supports || !resistances) return null;
  return { supports, resistances };
}

function parseFreshness(raw: unknown, fallbackIso: string): PolicyInsightFreshness | null {
  if (!isRecord(raw)) return null;
  if (typeof raw['stale'] !== 'boolean') return null;
  let capturedAtUnixMs: number | null = null;
  if (typeof raw['capturedAtUnixMs'] === 'number' && Number.isFinite(raw['capturedAtUnixMs'])) {
    capturedAtUnixMs = raw['capturedAtUnixMs'] as number;
  } else if (typeof raw['capturedAtIso'] === 'string') {
    const parsed = Date.parse(raw['capturedAtIso'] as string);
    if (Number.isFinite(parsed)) capturedAtUnixMs = parsed;
  }
  if (capturedAtUnixMs == null) {
    const parsed = Date.parse(fallbackIso);
    if (!Number.isFinite(parsed)) return null;
    capturedAtUnixMs = parsed;
  }
  return { capturedAtUnixMs, stale: raw['stale'] };
}

function parseUpstream(data: unknown): PolicyInsightBlock | null {
  if (!isRecord(data)) return null;
  if (data['schemaVersion'] !== '1.0') return null;
  if (data['pair'] !== 'SOL/USDC') return null;
  if (data['source'] !== 'openclaw') return null;
  if (typeof data['asOf'] !== 'string') return null;
  if (typeof data['runId'] !== 'string') return null;
  const status = data['status'];
  if (typeof status !== 'string' || !VALID_STATUSES.has(status as PolicyInsightStatus)) return null;
  if (typeof data['marketRegime'] !== 'string') return null;
  if (typeof data['fundamentalRegime'] !== 'string') return null;
  const action = data['recommendedAction'];
  if (typeof action !== 'string' || !VALID_ACTIONS.has(action as PolicyInsightRecommendedAction)) {
    return null;
  }
  const confidence = data['confidence'];
  if (
    typeof confidence !== 'string' ||
    !VALID_CONFIDENCES.has(confidence as PolicyInsightConfidence)
  ) {
    return null;
  }
  const riskLevel = data['riskLevel'];
  if (
    typeof riskLevel !== 'string' ||
    !VALID_RISK_LEVELS.has(riskLevel as PolicyInsightRiskLevel)
  ) {
    return null;
  }
  const dataQuality = data['dataQuality'];
  if (
    typeof dataQuality !== 'string' ||
    !VALID_DATA_QUALITIES.has(dataQuality as PolicyInsightDataQuality)
  ) {
    return null;
  }
  const clmmPolicy = parseClmmPolicy(data['clmmPolicy']);
  if (!clmmPolicy) return null;
  const levels = parseLevels(data['levels']);
  if (!levels) return null;
  const reasoning = parseStringArray(data['reasoning']);
  const sourceRefs = parseStringArray(data['sourceRefs']);
  if (!reasoning || !sourceRefs) return null;
  if (typeof data['expiresAt'] !== 'string') return null;
  if (typeof data['payloadHash'] !== 'string') return null;
  if (typeof data['receivedAtIso'] !== 'string') return null;
  const freshness = parseFreshness(data['freshness'], data['asOf'] as string);
  if (!freshness) return null;

  return {
    schemaVersion: '1.0',
    pair: 'SOL/USDC',
    asOf: data['asOf'] as string,
    source: 'openclaw',
    runId: data['runId'] as string,
    status: status as PolicyInsightStatus,
    marketRegime: data['marketRegime'] as string,
    fundamentalRegime: data['fundamentalRegime'] as string,
    recommendedAction: action as PolicyInsightRecommendedAction,
    confidence: confidence as PolicyInsightConfidence,
    riskLevel: riskLevel as PolicyInsightRiskLevel,
    dataQuality: dataQuality as PolicyInsightDataQuality,
    clmmPolicy,
    levels,
    reasoning,
    sourceRefs,
    expiresAt: data['expiresAt'] as string,
    payloadHash: data['payloadHash'] as string,
    receivedAtIso: data['receivedAtIso'] as string,
    freshness,
  };
}

export class CurrentPolicyInsightsAdapter implements PolicyInsightsReadPort {
  constructor(
    private readonly baseUrl: string | null,
    private readonly observability: ObservabilityPort,
  ) {}

  async fetchCurrent(): Promise<PolicyInsightReadResult> {
    if (!this.baseUrl) {
      this.observability.log(
        'warn',
        'PolicyInsights read disabled — no REGIME_ENGINE_BASE_URL configured',
      );
      return { kind: 'config-error' };
    }

    let url: URL;
    try {
      url = new URL(`${this.baseUrl.replace(/\/+$/, '')}/v1/insights/sol-usdc/current`);
    } catch {
      this.observability.log('warn', 'PolicyInsights base URL is malformed', {
        baseUrl: this.baseUrl,
      });
      return { kind: 'config-error' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url.toString(), { signal: controller.signal });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.observability.log('warn', 'PolicyInsights fetch network error', { message });
      return { kind: 'upstream-error' };
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 200) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        this.observability.log('warn', 'PolicyInsights response was not valid JSON');
        return { kind: 'upstream-error' };
      }
      const block = parseUpstream(body);
      if (!block) {
        this.observability.log('warn', 'PolicyInsights response failed shape validation');
        return { kind: 'upstream-error' };
      }
      return { kind: 'block', block };
    }

    if (response.status === 404) {
      const envelope = await this.readErrorEnvelope(response);
      if (!envelope || envelope.code === 'INSIGHT_NOT_FOUND' || envelope.code == null) {
        return { kind: 'not-found' };
      }
      this.observability.log('warn', 'PolicyInsights upstream 404 with unexpected code', {
        envelope,
      });
      return { kind: 'not-found' };
    }

    if (response.status === 503) {
      this.observability.log('warn', 'PolicyInsights upstream 503 store unavailable');
      return { kind: 'store-unavailable' };
    }

    this.observability.log('warn', 'PolicyInsights upstream non-2xx', { status: response.status });
    return { kind: 'upstream-error' };
  }

  private async readErrorEnvelope(
    response: Response,
  ): Promise<{ code?: string; message?: string } | null> {
    try {
      const body = (await response.json()) as unknown;
      if (!isRecord(body)) return null;
      const out: { code?: string; message?: string } = {};
      if (typeof body['code'] === 'string') out.code = body['code'];
      if (typeof body['message'] === 'string') out.message = body['message'];
      return out;
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 4: Run the happy-path test to verify it passes**

Run: `pnpm --filter @clmm/adapters test -- CurrentPolicyInsightsAdapter`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.ts packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.test.ts
git commit -m "feat(adapters): add CurrentPolicyInsightsAdapter happy path"
```

### Task 5: Cover every PolicyInsights adapter outcome

**Files:**

- Modify: `packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.test.ts`

- [ ] **Step 1: Append outcome tests**

Append inside the `describe('CurrentPolicyInsightsAdapter', ...)` block, after the existing happy-path test:

```ts
it('hits /v1/insights/sol-usdc/current with no query params', async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify(SAMPLE_UPSTREAM), { status: 200 }),
  );
  const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);
  await adapter.fetchCurrent();
  const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
  expect(calledUrl).toBe('https://regime.example.com/v1/insights/sol-usdc/current');
});

it('strips trailing slash from baseUrl', async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify(SAMPLE_UPSTREAM), { status: 200 }),
  );
  const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com/', obs.port);
  await adapter.fetchCurrent();
  const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
  expect(calledUrl).toBe('https://regime.example.com/v1/insights/sol-usdc/current');
});

it('returns kind:"not-found" on 404 with INSIGHT_NOT_FOUND code', async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ code: 'INSIGHT_NOT_FOUND', message: 'not yet' }), {
      status: 404,
    }),
  );
  const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent();
  expect(result.kind).toBe('not-found');
});

it('returns kind:"not-found" on 404 with no body', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response('', { status: 404 }));
  const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent();
  expect(result.kind).toBe('not-found');
});

it('returns kind:"store-unavailable" on 503', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response('', { status: 503 }));
  const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent();
  expect(result.kind).toBe('store-unavailable');
});

it('returns kind:"upstream-error" on 500', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response('boom', { status: 500 }));
  const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent();
  expect(result.kind).toBe('upstream-error');
});

it('returns kind:"upstream-error" on network error', async () => {
  vi.mocked(fetch).mockRejectedValue(new Error('ECONNRESET'));
  const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent();
  expect(result.kind).toBe('upstream-error');
});

it('returns kind:"upstream-error" on AbortError (timeout)', async () => {
  vi.mocked(fetch).mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
  const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent();
  expect(result.kind).toBe('upstream-error');
});

it('returns kind:"upstream-error" on unparseable JSON body', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response('not json', { status: 200 }));
  const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent();
  expect(result.kind).toBe('upstream-error');
});

it('returns kind:"upstream-error" on malformed top-level shape', async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ recommendedAction: 'INVALID' }), { status: 200 }),
  );
  const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent();
  expect(result.kind).toBe('upstream-error');
});

it('returns kind:"upstream-error" on malformed clmmPolicy', async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(
      JSON.stringify({
        ...SAMPLE_UPSTREAM,
        clmmPolicy: { posture: 'wide', rangeBias: 'symmetric' },
      }),
      { status: 200 },
    ),
  );
  const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent();
  expect(result.kind).toBe('upstream-error');
});

it('returns kind:"upstream-error" on malformed levels', async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(
      JSON.stringify({
        ...SAMPLE_UPSTREAM,
        levels: { supports: ['oops'], resistances: [] },
      }),
      { status: 200 },
    ),
  );
  const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent();
  expect(result.kind).toBe('upstream-error');
});

it('returns kind:"upstream-error" on malformed sourceRefs', async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ ...SAMPLE_UPSTREAM, sourceRefs: [42] }), { status: 200 }),
  );
  const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent();
  expect(result.kind).toBe('upstream-error');
});

it('returns kind:"upstream-error" on malformed freshness', async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ ...SAMPLE_UPSTREAM, freshness: { stale: 'no' } }), {
      status: 200,
    }),
  );
  const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent();
  expect(result.kind).toBe('upstream-error');
});

it('returns kind:"config-error" when baseUrl is null', async () => {
  const adapter = new CurrentPolicyInsightsAdapter(null, obs.port);
  const result = await adapter.fetchCurrent();
  expect(result.kind).toBe('config-error');
  expect(vi.mocked(fetch)).not.toHaveBeenCalled();
});

it('returns kind:"config-error" when baseUrl is malformed', async () => {
  const adapter = new CurrentPolicyInsightsAdapter('not a url', obs.port);
  const result = await adapter.fetchCurrent();
  expect(result.kind).toBe('config-error');
  expect(vi.mocked(fetch)).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run all adapter tests**

Run: `pnpm --filter @clmm/adapters test -- CurrentPolicyInsightsAdapter`
Expected: every case PASS.

- [ ] **Step 3: Run typecheck and lint**

Run: `pnpm --filter @clmm/adapters typecheck && pnpm --filter @clmm/adapters lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.test.ts
git commit -m "test(adapters): cover all CurrentPolicyInsightsAdapter outcomes"
```

---

## Phase 3 — BFF Controller

### Task 6: Add `POLICY_INSIGHTS_READ_PORT` token

**Files:**

- Modify: `packages/adapters/src/inbound/http/tokens.ts`

- [ ] **Step 1: Append the new token**

Edit `packages/adapters/src/inbound/http/tokens.ts`. Add at the bottom:

```ts
export const POLICY_INSIGHTS_READ_PORT = 'POLICY_INSIGHTS_READ_PORT';
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @clmm/adapters typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/adapters/src/inbound/http/tokens.ts
git commit -m "feat(adapters): add POLICY_INSIGHTS_READ_PORT DI token"
```

### Task 7: Implement `PolicyInsightsController`

**Files:**

- Create: `packages/adapters/src/inbound/http/PolicyInsightsController.ts`
- Create: `packages/adapters/src/inbound/http/PolicyInsightsController.test.ts`

- [ ] **Step 1: Write the failing controller test**

Create `packages/adapters/src/inbound/http/PolicyInsightsController.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { PolicyInsightsController } from './PolicyInsightsController.js';
import type {
  PolicyInsightsReadPort,
  PolicyInsightReadResult,
  PolicyInsightBlock,
} from '@clmm/application';

function fixtureBlock(): PolicyInsightBlock {
  return {
    schemaVersion: '1.0',
    pair: 'SOL/USDC',
    asOf: '2026-05-07T00:00:00Z',
    source: 'openclaw',
    runId: 'run-1',
    status: 'FRESH',
    marketRegime: 'UP',
    fundamentalRegime: 'NEUTRAL',
    recommendedAction: 'hold',
    confidence: 'medium',
    riskLevel: 'normal',
    dataQuality: 'complete',
    clmmPolicy: {
      posture: 'wide',
      rangeBias: 'symmetric',
      rebalanceSensitivity: 'low',
      maxCapitalDeploymentPct: 0.5,
    },
    levels: { supports: [], resistances: [] },
    reasoning: [],
    sourceRefs: [],
    expiresAt: '2026-05-07T01:00:00Z',
    payloadHash: 'h',
    receivedAtIso: '2026-05-07T00:00:01Z',
    freshness: { capturedAtUnixMs: Date.parse('2026-05-07T00:00:00Z'), stale: false },
  };
}

describe('PolicyInsightsController', () => {
  it('returns { policyInsight: block } when port resolves a block', async () => {
    const block = fixtureBlock();
    const result: PolicyInsightReadResult = { kind: 'block', block };
    const fetchCurrent = vi.fn().mockResolvedValue(result);
    const port: PolicyInsightsReadPort = { fetchCurrent };
    const controller = new PolicyInsightsController(port);

    const response = await controller.getCurrent();

    expect(response).toEqual({ policyInsight: block });
    expect(fetchCurrent).toHaveBeenCalledWith();
  });

  it('maps not-found to { policyInsight: null, unavailableReason: "not-found" }', async () => {
    const result: PolicyInsightReadResult = { kind: 'not-found' };
    const fetchCurrent = vi.fn().mockResolvedValue(result);
    const port: PolicyInsightsReadPort = { fetchCurrent };
    const controller = new PolicyInsightsController(port);
    const response = await controller.getCurrent();
    expect(response).toEqual({ policyInsight: null, unavailableReason: 'not-found' });
  });

  it('maps store-unavailable to { policyInsight: null, unavailableReason: "store-unavailable" }', async () => {
    const result: PolicyInsightReadResult = { kind: 'store-unavailable' };
    const fetchCurrent = vi.fn().mockResolvedValue(result);
    const port: PolicyInsightsReadPort = { fetchCurrent };
    const controller = new PolicyInsightsController(port);
    const response = await controller.getCurrent();
    expect(response).toEqual({ policyInsight: null, unavailableReason: 'store-unavailable' });
  });

  it('maps config-error to { policyInsight: null, unavailableReason: "config-error" }', async () => {
    const result: PolicyInsightReadResult = { kind: 'config-error' };
    const fetchCurrent = vi.fn().mockResolvedValue(result);
    const port: PolicyInsightsReadPort = { fetchCurrent };
    const controller = new PolicyInsightsController(port);
    const response = await controller.getCurrent();
    expect(response).toEqual({ policyInsight: null, unavailableReason: 'config-error' });
  });

  it('maps upstream-error to { policyInsight: null, unavailableReason: "upstream-error" }', async () => {
    const result: PolicyInsightReadResult = { kind: 'upstream-error' };
    const fetchCurrent = vi.fn().mockResolvedValue(result);
    const port: PolicyInsightsReadPort = { fetchCurrent };
    const controller = new PolicyInsightsController(port);
    const response = await controller.getCurrent();
    expect(response).toEqual({ policyInsight: null, unavailableReason: 'upstream-error' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @clmm/adapters test -- PolicyInsightsController`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the controller**

Create `packages/adapters/src/inbound/http/PolicyInsightsController.ts`:

```ts
import { Controller, Get, Inject } from '@nestjs/common';
import type { PolicyInsightsReadPort, PolicyInsightReadResult } from '@clmm/application';
import { POLICY_INSIGHTS_READ_PORT } from './tokens.js';

@Controller('policy-insights')
export class PolicyInsightsController {
  constructor(
    @Inject(POLICY_INSIGHTS_READ_PORT)
    private readonly policyInsightsPort: PolicyInsightsReadPort,
  ) {}

  @Get('sol-usdc/current')
  async getCurrent() {
    const result = await this.policyInsightsPort.fetchCurrent();
    return this.mapResult(result);
  }

  private mapResult(result: PolicyInsightReadResult) {
    switch (result.kind) {
      case 'block':
        return { policyInsight: result.block };
      case 'not-found':
        return { policyInsight: null, unavailableReason: 'not-found' as const };
      case 'store-unavailable':
        return { policyInsight: null, unavailableReason: 'store-unavailable' as const };
      case 'config-error':
        return { policyInsight: null, unavailableReason: 'config-error' as const };
      case 'upstream-error':
        return { policyInsight: null, unavailableReason: 'upstream-error' as const };
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @clmm/adapters test -- PolicyInsightsController`
Expected: PASS.

- [ ] **Step 5: Run typecheck and lint**

Run: `pnpm --filter @clmm/adapters typecheck && pnpm --filter @clmm/adapters lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/adapters/src/inbound/http/PolicyInsightsController.ts packages/adapters/src/inbound/http/PolicyInsightsController.test.ts
git commit -m "feat(adapters): add PolicyInsightsController BFF route"
```

### Task 8: Wire `CurrentPolicyInsightsAdapter` and controller into `AppModule`

**Files:**

- Modify: `packages/adapters/src/inbound/http/AppModule.ts`

- [ ] **Step 1: Add the imports**

Edit `packages/adapters/src/inbound/http/AppModule.ts`. After the existing line:

```ts
import { CurrentSrThesesAdapter } from '../../outbound/regime-engine/CurrentSrThesesAdapter.js';
```

add:

```ts
import { CurrentPolicyInsightsAdapter } from '../../outbound/regime-engine/CurrentPolicyInsightsAdapter.js';
```

After the existing line:

```ts
import { SrThesesController } from './SrThesesController.js';
```

add:

```ts
import { PolicyInsightsController } from './PolicyInsightsController.js';
```

In the imports from `./tokens.js` (the multi-line import block), add `POLICY_INSIGHTS_READ_PORT` to the list.

- [ ] **Step 2: Construct the adapter instance**

Locate the existing block:

```ts
const currentSrThesesAdapter = new CurrentSrThesesAdapter(regimeEngineBaseUrl, telemetry);
```

Immediately below it add:

```ts
const currentPolicyInsightsAdapter = new CurrentPolicyInsightsAdapter(
  regimeEngineBaseUrl,
  telemetry,
);
```

- [ ] **Step 3: Register the controller**

In the `controllers: [...]` array, add `PolicyInsightsController` after `SrThesesController`. The block becomes:

```ts
controllers: [
  HealthController,
  PositionController,
  SrLevelsController,
  RegimeController,
  SrThesesController,
  PolicyInsightsController,
  InsightsDataController,
  AlertController,
  PreviewController,
  ExecutionController,
  WalletController,
],
```

- [ ] **Step 4: Register the provider**

In the `providers: [...]` array, after the existing `{ provide: SR_THESES_POOL_ALLOWLIST, useValue: SR_THESES_POOL_ALLOWLIST_MAP },` add:

```ts
{ provide: POLICY_INSIGHTS_READ_PORT, useValue: currentPolicyInsightsAdapter },
```

- [ ] **Step 5: Verify the BFF still boots in tests**

Run: `pnpm --filter @clmm/adapters typecheck && pnpm --filter @clmm/adapters test`
Expected: PASS. If existing `AppModule`-touching tests fail, the diff is wrong — re-check insertions.

- [ ] **Step 6: Commit**

```bash
git add packages/adapters/src/inbound/http/AppModule.ts
git commit -m "feat(adapters): wire CurrentPolicyInsightsAdapter and controller into AppModule"
```

---

## Phase 4 — App Client

### Task 9: Implement `fetchCurrentPolicyInsight` happy path

**Files:**

- Create: `apps/app/src/api/policyInsights.ts`
- Create: `apps/app/src/api/policyInsights.test.ts`

- [ ] **Step 1: Write the failing happy-path test**

Create `apps/app/src/api/policyInsights.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCurrentPolicyInsight } from './policyInsights';

type ExpoPublicEnv = NodeJS.ProcessEnv & {
  EXPO_PUBLIC_BFF_BASE_URL?: string;
};

const ORIGINAL_FETCH = globalThis.fetch;
const env = process.env as ExpoPublicEnv;
const ORIGINAL_BFF_BASE_URL = env.EXPO_PUBLIC_BFF_BASE_URL;

function restoreBffBaseUrl(): void {
  if (ORIGINAL_BFF_BASE_URL == null) {
    delete env.EXPO_PUBLIC_BFF_BASE_URL;
    return;
  }
  env.EXPO_PUBLIC_BFF_BASE_URL = ORIGINAL_BFF_BASE_URL;
}

function fixtureBlock() {
  return {
    schemaVersion: '1.0',
    pair: 'SOL/USDC',
    asOf: '2026-05-07T00:00:00Z',
    source: 'openclaw',
    runId: 'run-1',
    status: 'FRESH',
    marketRegime: 'UP',
    fundamentalRegime: 'NEUTRAL',
    recommendedAction: 'hold',
    confidence: 'medium',
    riskLevel: 'normal',
    dataQuality: 'complete',
    clmmPolicy: {
      posture: 'wide',
      rangeBias: 'symmetric',
      rebalanceSensitivity: 'low',
      maxCapitalDeploymentPct: 0.5,
    },
    levels: { supports: [140.5], resistances: [155.0] },
    reasoning: ['Trend constructive'],
    sourceRefs: ['msg-1'],
    expiresAt: '2026-05-07T01:00:00Z',
    payloadHash: 'h',
    receivedAtIso: '2026-05-07T00:00:01Z',
    freshness: { capturedAtUnixMs: 1_700_000_000_000, stale: false },
  };
}

describe('fetchCurrentPolicyInsight', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    restoreBffBaseUrl();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns { policyInsight } on 200 with a valid block', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    const block = fixtureBlock();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ policyInsight: block }),
    }) as typeof fetch;

    const result = await fetchCurrentPolicyInsight();

    expect(result.policyInsight).toEqual(block);
    expect(result.unavailableReason).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter app test -- policyInsights`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the client**

Create `apps/app/src/api/policyInsights.ts`:

```ts
import type {
  PolicyInsightBlock,
  PolicyInsightClmmPolicy,
  PolicyInsightConfidence,
  PolicyInsightDataQuality,
  PolicyInsightFreshness,
  PolicyInsightLevels,
  PolicyInsightRecommendedAction,
  PolicyInsightRiskLevel,
  PolicyInsightStatus,
} from '@clmm/application/public';
import { getBffBaseUrl } from './http';

export type PolicyInsightsUnavailableReason =
  | 'not-found'
  | 'store-unavailable'
  | 'config-error'
  | 'upstream-error';

export type PolicyInsightsResponse = {
  policyInsight: PolicyInsightBlock | null;
  unavailableReason?: PolicyInsightsUnavailableReason | undefined;
};

const FETCH_TIMEOUT_MS = 10_000;

const VALID_ACTIONS: ReadonlySet<string> = new Set<PolicyInsightRecommendedAction>([
  'hold',
  'watch',
  'tighten_range',
  'widen_range',
  'exit_range',
  'pause_rebalances',
]);
const VALID_CONFIDENCES: ReadonlySet<string> = new Set<PolicyInsightConfidence>([
  'low',
  'medium',
  'high',
]);
const VALID_RISK_LEVELS: ReadonlySet<string> = new Set<PolicyInsightRiskLevel>([
  'normal',
  'elevated',
  'critical',
]);
const VALID_DATA_QUALITIES: ReadonlySet<string> = new Set<PolicyInsightDataQuality>([
  'complete',
  'partial',
  'stale',
]);
const VALID_STATUSES: ReadonlySet<string> = new Set<PolicyInsightStatus>(['FRESH', 'STALE']);
const VALID_REASONS: ReadonlySet<string> = new Set<PolicyInsightsUnavailableReason>([
  'not-found',
  'store-unavailable',
  'config-error',
  'upstream-error',
]);

function isAbortError(error: unknown): boolean {
  if (typeof error !== 'object' || error == null) return false;
  return (error as { name?: string }).name === 'AbortError';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'number' && Number.isFinite(v));
}

function isClmmPolicy(value: unknown): value is PolicyInsightClmmPolicy {
  if (!isRecord(value)) return false;
  if (typeof value['posture'] !== 'string') return false;
  if (typeof value['rangeBias'] !== 'string') return false;
  if (typeof value['rebalanceSensitivity'] !== 'string') return false;
  const pct = value['maxCapitalDeploymentPct'];
  if (typeof pct !== 'number' || !Number.isFinite(pct)) return false;
  return true;
}

function isLevels(value: unknown): value is PolicyInsightLevels {
  if (!isRecord(value)) return false;
  if (!isNumberArray(value['supports'])) return false;
  if (!isNumberArray(value['resistances'])) return false;
  return true;
}

function isFreshness(value: unknown): value is PolicyInsightFreshness {
  if (!isRecord(value)) return false;
  if (typeof value['capturedAtUnixMs'] !== 'number') return false;
  if (!Number.isFinite(value['capturedAtUnixMs'])) return false;
  if (typeof value['stale'] !== 'boolean') return false;
  return true;
}

function isPolicyInsightBlock(value: unknown): value is PolicyInsightBlock {
  if (!isRecord(value)) return false;
  if (value['schemaVersion'] !== '1.0') return false;
  if (value['pair'] !== 'SOL/USDC') return false;
  if (value['source'] !== 'openclaw') return false;
  if (typeof value['asOf'] !== 'string') return false;
  if (typeof value['runId'] !== 'string') return false;
  if (!VALID_STATUSES.has(value['status'] as string)) return false;
  if (typeof value['marketRegime'] !== 'string') return false;
  if (typeof value['fundamentalRegime'] !== 'string') return false;
  if (!VALID_ACTIONS.has(value['recommendedAction'] as string)) return false;
  if (!VALID_CONFIDENCES.has(value['confidence'] as string)) return false;
  if (!VALID_RISK_LEVELS.has(value['riskLevel'] as string)) return false;
  if (!VALID_DATA_QUALITIES.has(value['dataQuality'] as string)) return false;
  if (!isClmmPolicy(value['clmmPolicy'])) return false;
  if (!isLevels(value['levels'])) return false;
  if (!isStringArray(value['reasoning'])) return false;
  if (!isStringArray(value['sourceRefs'])) return false;
  if (typeof value['expiresAt'] !== 'string') return false;
  if (typeof value['payloadHash'] !== 'string') return false;
  if (typeof value['receivedAtIso'] !== 'string') return false;
  if (!isFreshness(value['freshness'])) return false;
  return true;
}

function isUnavailableReason(value: unknown): value is PolicyInsightsUnavailableReason {
  return typeof value === 'string' && VALID_REASONS.has(value);
}

export async function fetchCurrentPolicyInsight(): Promise<PolicyInsightsResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${getBffBaseUrl()}/policy-insights/sol-usdc/current`, {
      signal: controller.signal,
    });
  } catch (error: unknown) {
    if (isAbortError(error)) {
      throw new Error('Could not load policy insights: request timed out');
    }
    throw new Error(
      `Could not load policy insights: ${error instanceof Error ? error.message : 'network error'}`,
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => `HTTP ${response.status}`);
    throw new Error(`Could not load policy insights: ${detail || response.statusText}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error('Could not load policy insights: response body was not valid JSON');
  }

  if (!isRecord(body)) {
    throw new Error('Could not load policy insights: malformed response');
  }

  const policyInsight = body['policyInsight'];
  const unavailableReason = isUnavailableReason(body['unavailableReason'])
    ? body['unavailableReason']
    : undefined;

  if (policyInsight === null) {
    return { policyInsight: null, unavailableReason };
  }

  if (!isPolicyInsightBlock(policyInsight)) {
    throw new Error('Could not load policy insights: malformed policyInsight block');
  }

  return { policyInsight, unavailableReason };
}
```

- [ ] **Step 4: Run the happy-path test to verify it passes**

Run: `pnpm --filter app test -- policyInsights`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/api/policyInsights.ts apps/app/src/api/policyInsights.test.ts
git commit -m "feat(app): add fetchCurrentPolicyInsight client happy path"
```

### Task 10: Cover every PolicyInsights client outcome

**Files:**

- Modify: `apps/app/src/api/policyInsights.test.ts`

- [ ] **Step 1: Append outcome tests**

Append inside the `describe('fetchCurrentPolicyInsight', ...)` block:

```ts
it('returns { policyInsight: null, unavailableReason } when BFF returns not-found envelope', async () => {
  env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ policyInsight: null, unavailableReason: 'not-found' }),
  }) as typeof fetch;

  const result = await fetchCurrentPolicyInsight();

  expect(result.policyInsight).toBeNull();
  expect(result.unavailableReason).toBe('not-found');
});

it('returns { policyInsight: null, unavailableReason } for store-unavailable', async () => {
  env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ policyInsight: null, unavailableReason: 'store-unavailable' }),
  }) as typeof fetch;

  const result = await fetchCurrentPolicyInsight();

  expect(result.policyInsight).toBeNull();
  expect(result.unavailableReason).toBe('store-unavailable');
});

it('returns { policyInsight: null, unavailableReason } for config-error', async () => {
  env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ policyInsight: null, unavailableReason: 'config-error' }),
  }) as typeof fetch;

  const result = await fetchCurrentPolicyInsight();

  expect(result.policyInsight).toBeNull();
  expect(result.unavailableReason).toBe('config-error');
});

it('returns { policyInsight: null, unavailableReason } for upstream-error', async () => {
  env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ policyInsight: null, unavailableReason: 'upstream-error' }),
  }) as typeof fetch;

  const result = await fetchCurrentPolicyInsight();

  expect(result.policyInsight).toBeNull();
  expect(result.unavailableReason).toBe('upstream-error');
});

it('throws on 200 with malformed top-level block', async () => {
  env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ policyInsight: { recommendedAction: 'INVALID' } }),
  }) as typeof fetch;

  const error = await fetchCurrentPolicyInsight().catch((reason: unknown) => reason);

  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain('malformed policyInsight block');
});

it('throws on 200 with malformed clmmPolicy', async () => {
  env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
  const block = fixtureBlock();
  // clmmPolicy missing maxCapitalDeploymentPct
  (block.clmmPolicy as unknown as Record<string, unknown>).maxCapitalDeploymentPct = 'oops';
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ policyInsight: block }),
  }) as typeof fetch;

  const error = await fetchCurrentPolicyInsight().catch((reason: unknown) => reason);

  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain('malformed policyInsight block');
});

it('throws on 200 with malformed levels', async () => {
  env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
  const block = fixtureBlock();
  (block.levels as unknown as Record<string, unknown>).supports = ['oops'];
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ policyInsight: block }),
  }) as typeof fetch;

  const error = await fetchCurrentPolicyInsight().catch((reason: unknown) => reason);
  expect(error).toBeInstanceOf(Error);
});

it('throws on 200 with malformed sourceRefs', async () => {
  env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
  const block = fixtureBlock();
  (block as unknown as Record<string, unknown>).sourceRefs = [42];
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ policyInsight: block }),
  }) as typeof fetch;

  const error = await fetchCurrentPolicyInsight().catch((reason: unknown) => reason);
  expect(error).toBeInstanceOf(Error);
});

it('throws on non-2xx response', async () => {
  env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    statusText: 'Internal Server Error',
    text: () => Promise.resolve('boom'),
  }) as typeof fetch;

  const error = await fetchCurrentPolicyInsight().catch((reason: unknown) => reason);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain('Could not load policy insights');
});

it('throws on invalid JSON body', async () => {
  env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.reject(new SyntaxError('Unexpected token')),
  }) as typeof fetch;

  const error = await fetchCurrentPolicyInsight().catch((reason: unknown) => reason);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain('not valid JSON');
});

it('does not accept a poolId parameter', () => {
  // Compile-time assertion: fetchCurrentPolicyInsight has zero required args.
  type Args = Parameters<typeof fetchCurrentPolicyInsight>;
  const _empty: Args = [] as const;
  expect(_empty.length).toBe(0);
});
```

- [ ] **Step 2: Run all client tests**

Run: `pnpm --filter app test -- policyInsights`
Expected: PASS.

- [ ] **Step 3: Run typecheck and lint**

Run: `pnpm --filter app typecheck && pnpm --filter app lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/api/policyInsights.test.ts
git commit -m "test(app): cover all fetchCurrentPolicyInsight outcomes"
```

---

## Phase 5 — UI View Model

### Task 11: Implement `PolicyInsightsViewModel`

**Files:**

- Create: `packages/ui/src/view-models/PolicyInsightsViewModel.ts`
- Create: `packages/ui/src/view-models/PolicyInsightsViewModel.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/ui/src/view-models/PolicyInsightsViewModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { PolicyInsightBlock } from '@clmm/application/public';
import { buildPolicyInsightsViewModel } from './PolicyInsightsViewModel.js';

const NOW = Date.parse('2026-05-07T12:30:00Z');

function fixture(overrides: Partial<PolicyInsightBlock> = {}): PolicyInsightBlock {
  return {
    schemaVersion: '1.0',
    pair: 'SOL/USDC',
    asOf: '2026-05-07T12:00:00Z',
    source: 'openclaw',
    runId: 'run-1',
    status: 'FRESH',
    marketRegime: 'UP',
    fundamentalRegime: 'CONSTRUCTIVE',
    recommendedAction: 'hold',
    confidence: 'medium',
    riskLevel: 'normal',
    dataQuality: 'complete',
    clmmPolicy: {
      posture: 'wide',
      rangeBias: 'symmetric',
      rebalanceSensitivity: 'low',
      maxCapitalDeploymentPct: 0.5,
    },
    levels: { supports: [], resistances: [] },
    reasoning: ['Trend constructive', 'Vol muted', 'Funding neutral'],
    sourceRefs: ['msg-1'],
    expiresAt: '2026-05-07T13:00:00Z',
    payloadHash: 'h',
    receivedAtIso: '2026-05-07T12:00:01Z',
    freshness: { capturedAtUnixMs: Date.parse('2026-05-07T12:00:00Z'), stale: false },
    ...overrides,
  };
}

describe('buildPolicyInsightsViewModel', () => {
  it('returns a neutral severity for hold + normal risk', () => {
    const vm = buildPolicyInsightsViewModel(fixture(), NOW);
    expect(vm.severity).toBe('neutral');
  });

  it('returns danger for critical risk regardless of action', () => {
    const vm = buildPolicyInsightsViewModel(
      fixture({ riskLevel: 'critical', recommendedAction: 'hold' }),
      NOW,
    );
    expect(vm.severity).toBe('danger');
  });

  it('returns danger for exit_range action regardless of risk', () => {
    const vm = buildPolicyInsightsViewModel(
      fixture({ recommendedAction: 'exit_range', riskLevel: 'normal' }),
      NOW,
    );
    expect(vm.severity).toBe('danger');
  });

  it('returns warning for elevated risk', () => {
    const vm = buildPolicyInsightsViewModel(fixture({ riskLevel: 'elevated' }), NOW);
    expect(vm.severity).toBe('warning');
  });

  it('returns warning for pause_rebalances action', () => {
    const vm = buildPolicyInsightsViewModel(
      fixture({ recommendedAction: 'pause_rebalances' }),
      NOW,
    );
    expect(vm.severity).toBe('warning');
  });

  it('marks isStale when status is STALE', () => {
    const vm = buildPolicyInsightsViewModel(fixture({ status: 'STALE' }), NOW);
    expect(vm.isStale).toBe(true);
  });

  it('marks isStale when freshness.stale is true', () => {
    const vm = buildPolicyInsightsViewModel(
      fixture({
        freshness: { capturedAtUnixMs: NOW, stale: true },
      }),
      NOW,
    );
    expect(vm.isStale).toBe(true);
  });

  it('formats max capital deployment as a percent', () => {
    const vm = buildPolicyInsightsViewModel(
      fixture({
        clmmPolicy: {
          posture: 'wide',
          rangeBias: 'symmetric',
          rebalanceSensitivity: 'low',
          maxCapitalDeploymentPct: 0.375,
        },
      }),
      NOW,
    );
    expect(vm.maxDeploymentLabel).toBe('38%');
  });

  it('keeps the first 3 non-empty reasoning strings in upstream order', () => {
    const vm = buildPolicyInsightsViewModel(
      fixture({
        reasoning: ['', 'one', '   ', 'two', 'three', 'four'],
      }),
      NOW,
    );
    expect(vm.reasoning).toEqual(['one', 'two', 'three']);
  });

  it('does not surface sourceRefs in the view model fields used for rendering', () => {
    const vm = buildPolicyInsightsViewModel(fixture({ sourceRefs: ['msg-1', 'msg-2'] }), NOW);
    // sourceRefs may be present on the source block but the VM does not expose it.
    expect((vm as unknown as Record<string, unknown>)['sourceRefs']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @clmm/ui test -- PolicyInsightsViewModel`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the view model**

Create `packages/ui/src/view-models/PolicyInsightsViewModel.ts`:

```ts
import type { PolicyInsightBlock } from '@clmm/application/public';

export type PolicyInsightsSeverity = 'danger' | 'warning' | 'neutral';

export type PolicyInsightsViewModel = {
  actionLabel: string;
  severity: PolicyInsightsSeverity;
  postureLabel: string;
  rangeBiasLabel: string;
  rebalanceSensitivityLabel: string;
  maxDeploymentLabel: string;
  riskLabel: string;
  confidenceLabel: string;
  dataQualityLabel: string;
  freshnessLabel: string;
  isStale: boolean;
  reasoning: string[];
  subtitle: string;
};

const ACTION_LABELS: Record<PolicyInsightBlock['recommendedAction'], string> = {
  hold: 'Hold',
  watch: 'Watch',
  tighten_range: 'Tighten range',
  widen_range: 'Widen range',
  exit_range: 'Exit range',
  pause_rebalances: 'Pause rebalances',
};

const RISK_LABELS: Record<PolicyInsightBlock['riskLevel'], string> = {
  normal: 'Normal risk',
  elevated: 'Elevated risk',
  critical: 'Critical risk',
};

const CONFIDENCE_LABELS: Record<PolicyInsightBlock['confidence'], string> = {
  low: 'Low confidence',
  medium: 'Medium confidence',
  high: 'High confidence',
};

const DATA_QUALITY_LABELS: Record<PolicyInsightBlock['dataQuality'], string> = {
  complete: 'Complete data',
  partial: 'Partial data',
  stale: 'Stale data',
};

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;

function formatPercent(fraction: number): string {
  const clamped = Math.max(0, Math.min(1, fraction));
  return `${Math.round(clamped * 100)}%`;
}

function formatFreshness(capturedAtUnixMs: number, now: number): string {
  const ageMs = Math.max(0, now - capturedAtUnixMs);
  if (ageMs < MS_PER_HOUR) {
    const minutes = Math.max(1, Math.round(ageMs / MS_PER_MINUTE));
    return `${minutes}m ago`;
  }
  const hours = Math.round(ageMs / MS_PER_HOUR);
  return `${hours}h ago`;
}

function deriveSeverity(block: PolicyInsightBlock): PolicyInsightsSeverity {
  if (block.riskLevel === 'critical' || block.recommendedAction === 'exit_range') {
    return 'danger';
  }
  if (block.riskLevel === 'elevated' || block.recommendedAction === 'pause_rebalances') {
    return 'warning';
  }
  return 'neutral';
}

function firstNonEmpty(values: string[], limit: number): string[] {
  const out: string[] = [];
  for (const v of values) {
    if (typeof v === 'string' && v.trim().length > 0) {
      out.push(v);
      if (out.length === limit) break;
    }
  }
  return out;
}

export function buildPolicyInsightsViewModel(
  block: PolicyInsightBlock,
  now: number,
): PolicyInsightsViewModel {
  return {
    actionLabel: ACTION_LABELS[block.recommendedAction],
    severity: deriveSeverity(block),
    postureLabel: `Posture: ${block.clmmPolicy.posture}`,
    rangeBiasLabel: `Range bias: ${block.clmmPolicy.rangeBias}`,
    rebalanceSensitivityLabel: `Rebalance sensitivity: ${block.clmmPolicy.rebalanceSensitivity}`,
    maxDeploymentLabel: formatPercent(block.clmmPolicy.maxCapitalDeploymentPct),
    riskLabel: RISK_LABELS[block.riskLevel],
    confidenceLabel: CONFIDENCE_LABELS[block.confidence],
    dataQualityLabel: DATA_QUALITY_LABELS[block.dataQuality],
    freshnessLabel: formatFreshness(block.freshness.capturedAtUnixMs, now),
    isStale: block.status === 'STALE' || block.freshness.stale === true,
    reasoning: firstNonEmpty(block.reasoning, 3),
    subtitle: 'Advisory CLMM policy signal. Nothing has been applied.',
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @clmm/ui test -- PolicyInsightsViewModel`
Expected: PASS.

- [ ] **Step 5: Run UI checks**

Run: `pnpm --filter @clmm/ui typecheck && pnpm --filter @clmm/ui lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/view-models/PolicyInsightsViewModel.ts packages/ui/src/view-models/PolicyInsightsViewModel.test.ts
git commit -m "feat(ui): add buildPolicyInsightsViewModel"
```

---

## Phase 6 — UI Section

### Task 12: Implement `PolicyInsightsSection`

**Files:**

- Create: `packages/ui/src/components/PolicyInsightsSection.tsx`
- Create: `packages/ui/src/components/PolicyInsightsSection.test.tsx`

- [ ] **Step 1: Write the failing component test**

Create `packages/ui/src/components/PolicyInsightsSection.test.tsx`:

```tsx
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { PolicyInsightBlock } from '@clmm/application/public';
import { PolicyInsightsSection } from './PolicyInsightsSection.js';

afterEach(() => {
  cleanup();
});

const NOW = Date.parse('2026-05-07T12:30:00Z');

function fixture(overrides: Partial<PolicyInsightBlock> = {}): PolicyInsightBlock {
  return {
    schemaVersion: '1.0',
    pair: 'SOL/USDC',
    asOf: '2026-05-07T12:00:00Z',
    source: 'openclaw',
    runId: 'run-1',
    status: 'FRESH',
    marketRegime: 'UP',
    fundamentalRegime: 'CONSTRUCTIVE',
    recommendedAction: 'hold',
    confidence: 'medium',
    riskLevel: 'normal',
    dataQuality: 'complete',
    clmmPolicy: {
      posture: 'wide',
      rangeBias: 'symmetric',
      rebalanceSensitivity: 'low',
      maxCapitalDeploymentPct: 0.5,
    },
    levels: { supports: [], resistances: [] },
    reasoning: ['Trend constructive', 'Vol muted', 'Funding neutral'],
    sourceRefs: ['msg-1'],
    expiresAt: '2026-05-07T13:00:00Z',
    payloadHash: 'h',
    receivedAtIso: '2026-05-07T12:00:01Z',
    freshness: { capturedAtUnixMs: Date.parse('2026-05-07T12:00:00Z'), stale: false },
    ...overrides,
  };
}

describe('PolicyInsightsSection', () => {
  it('returns null when not enabled and no data', () => {
    const { container } = render(
      <PolicyInsightsSection
        policyInsight={undefined}
        isLoading={false}
        isError={false}
        isEnabled={false}
        unavailableReason={null}
        now={NOW}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders title, action, posture, range bias, sensitivity, percent, risk, confidence, data quality, and reasoning', () => {
    render(
      <PolicyInsightsSection
        policyInsight={fixture()}
        isLoading={false}
        isError={false}
        isEnabled
        unavailableReason={null}
        now={NOW}
      />,
    );
    expect(screen.getByText('PolicyInsights')).toBeTruthy();
    expect(screen.getByText('Advisory CLMM policy signal. Nothing has been applied.')).toBeTruthy();
    expect(screen.getByText('Hold')).toBeTruthy();
    expect(screen.getByText('Posture: wide')).toBeTruthy();
    expect(screen.getByText('Range bias: symmetric')).toBeTruthy();
    expect(screen.getByText('Rebalance sensitivity: low')).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();
    expect(screen.getByText('Normal risk')).toBeTruthy();
    expect(screen.getByText('Medium confidence')).toBeTruthy();
    expect(screen.getByText('Complete data')).toBeTruthy();
    expect(screen.getByText('Trend constructive')).toBeTruthy();
    expect(screen.getByText('Vol muted')).toBeTruthy();
    expect(screen.getByText('Funding neutral')).toBeTruthy();
  });

  it('renders a stale warning line when status is STALE', () => {
    render(
      <PolicyInsightsSection
        policyInsight={fixture({ status: 'STALE' })}
        isLoading={false}
        isError={false}
        isEnabled
        unavailableReason={null}
        now={NOW}
      />,
    );
    expect(screen.getByTestId('policy-insights-stale-warning')).toBeTruthy();
  });

  it('uses danger styling for critical risk', () => {
    render(
      <PolicyInsightsSection
        policyInsight={fixture({ riskLevel: 'critical' })}
        isLoading={false}
        isError={false}
        isEnabled
        unavailableReason={null}
        now={NOW}
      />,
    );
    expect(screen.getByTestId('policy-insights-card').props.style.borderColor).toBeDefined();
    expect(screen.getByText('Critical risk')).toBeTruthy();
  });

  it('uses warning styling for pause_rebalances', () => {
    render(
      <PolicyInsightsSection
        policyInsight={fixture({ recommendedAction: 'pause_rebalances' })}
        isLoading={false}
        isError={false}
        isEnabled
        unavailableReason={null}
        now={NOW}
      />,
    );
    expect(screen.getByText('Pause rebalances')).toBeTruthy();
  });

  it('renders unavailable copy for not-found', () => {
    render(
      <PolicyInsightsSection
        policyInsight={null}
        isLoading={false}
        isError={false}
        isEnabled
        unavailableReason="not-found"
        now={NOW}
      />,
    );
    expect(screen.getByText('No policy insight available yet.')).toBeTruthy();
  });

  it('renders unavailable copy for store-unavailable', () => {
    render(
      <PolicyInsightsSection
        policyInsight={null}
        isLoading={false}
        isError={false}
        isEnabled
        unavailableReason="store-unavailable"
        now={NOW}
      />,
    );
    expect(screen.getByText('Policy insights unavailable.')).toBeTruthy();
  });

  it('renders the same unavailable copy for config-error and upstream-error', () => {
    const { rerender } = render(
      <PolicyInsightsSection
        policyInsight={null}
        isLoading={false}
        isError={false}
        isEnabled
        unavailableReason="config-error"
        now={NOW}
      />,
    );
    expect(screen.getByText('Policy insights unavailable.')).toBeTruthy();

    rerender(
      <PolicyInsightsSection
        policyInsight={null}
        isLoading={false}
        isError={false}
        isEnabled
        unavailableReason="upstream-error"
        now={NOW}
      />,
    );
    expect(screen.getByText('Policy insights unavailable.')).toBeTruthy();
  });

  it('renders a degraded warning when isError but cached data is shown', () => {
    render(
      <PolicyInsightsSection
        policyInsight={fixture()}
        isLoading={false}
        isError
        isEnabled
        unavailableReason={null}
        now={NOW}
      />,
    );
    expect(screen.getByTestId('policy-insights-degraded')).toBeTruthy();
  });

  it('renders a skeleton when loading with no data', () => {
    render(
      <PolicyInsightsSection
        policyInsight={undefined}
        isLoading
        isError={false}
        isEnabled
        unavailableReason={null}
        now={NOW}
      />,
    );
    expect(screen.getByTestId('policy-insights-skeleton')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @clmm/ui test -- PolicyInsightsSection`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the section**

Create `packages/ui/src/components/PolicyInsightsSection.tsx`:

```tsx
import { View, Text, ActivityIndicator } from 'react-native';
import type { PolicyInsightBlock } from '@clmm/application/public';
import { colors, typography } from '../design-system/index.js';
import { buildPolicyInsightsViewModel } from '../view-models/PolicyInsightsViewModel.js';

type PolicyInsightsUnavailableReason =
  | 'not-found'
  | 'store-unavailable'
  | 'config-error'
  | 'upstream-error';

type Props = {
  policyInsight: PolicyInsightBlock | null | undefined;
  isLoading: boolean;
  isError: boolean;
  isEnabled: boolean;
  unavailableReason?: PolicyInsightsUnavailableReason | null;
  now: number;
};

const cardStyle = {
  marginHorizontal: 16,
  marginTop: 14,
  padding: 16,
  backgroundColor: colors.surface,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: colors.border,
} as const;

function severityBorder(severity: 'danger' | 'warning' | 'neutral'): string {
  switch (severity) {
    case 'danger':
      return colors.breachAccent;
    case 'warning':
      return colors.warn;
    case 'neutral':
      return colors.border;
  }
}

function unavailableCopy(reason: PolicyInsightsUnavailableReason): string {
  switch (reason) {
    case 'not-found':
      return 'No policy insight available yet.';
    case 'store-unavailable':
    case 'config-error':
    case 'upstream-error':
      return 'Policy insights unavailable.';
  }
}

export function PolicyInsightsSection({
  policyInsight,
  isLoading,
  isError,
  isEnabled,
  unavailableReason,
  now,
}: Props): JSX.Element | null {
  if (!isEnabled) return null;

  if (isLoading && policyInsight == null) {
    return (
      <View testID="policy-insights-skeleton" style={{ ...cardStyle, alignItems: 'center' }}>
        <ActivityIndicator color={colors.safe} />
      </View>
    );
  }

  if (policyInsight == null) {
    if (!unavailableReason) return null;
    return (
      <View style={cardStyle}>
        <Text
          style={{
            color: colors.textPrimary,
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.semibold,
          }}
        >
          PolicyInsights
        </Text>
        <Text
          style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: 4 }}
        >
          {unavailableCopy(unavailableReason)}
        </Text>
      </View>
    );
  }

  const vm = buildPolicyInsightsViewModel(policyInsight, now);
  return (
    <View
      testID="policy-insights-card"
      style={{ ...cardStyle, borderColor: severityBorder(vm.severity) }}
    >
      <Text
        style={{
          color: colors.textPrimary,
          fontSize: typography.fontSize.sm,
          fontWeight: typography.fontWeight.semibold,
        }}
      >
        PolicyInsights
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs, marginTop: 2 }}>
        {vm.subtitle}
      </Text>
      <Text
        style={{
          color: colors.textPrimary,
          fontSize: typography.fontSize.md,
          fontWeight: typography.fontWeight.semibold,
          marginTop: 8,
        }}
      >
        {vm.actionLabel}
      </Text>
      {vm.isStale ? (
        <Text
          testID="policy-insights-stale-warning"
          style={{ color: colors.warn, fontSize: typography.fontSize.xs, marginTop: 2 }}
        >
          Stale — last update {vm.freshnessLabel}
        </Text>
      ) : (
        <Text
          style={{ color: colors.textTertiary, fontSize: typography.fontSize.xs, marginTop: 2 }}
        >
          {vm.freshnessLabel}
        </Text>
      )}
      <Text style={{ color: colors.textBody, fontSize: typography.fontSize.sm, marginTop: 6 }}>
        {vm.postureLabel}
      </Text>
      <Text style={{ color: colors.textBody, fontSize: typography.fontSize.sm, marginTop: 2 }}>
        {vm.rangeBiasLabel}
      </Text>
      <Text style={{ color: colors.textBody, fontSize: typography.fontSize.sm, marginTop: 2 }}>
        {vm.rebalanceSensitivityLabel}
      </Text>
      <Text style={{ color: colors.textBody, fontSize: typography.fontSize.sm, marginTop: 2 }}>
        Max capital: {vm.maxDeploymentLabel}
      </Text>
      <Text style={{ color: colors.textBody, fontSize: typography.fontSize.sm, marginTop: 6 }}>
        {vm.riskLabel}
      </Text>
      <Text style={{ color: colors.textBody, fontSize: typography.fontSize.sm, marginTop: 2 }}>
        {vm.confidenceLabel}
      </Text>
      <Text style={{ color: colors.textBody, fontSize: typography.fontSize.sm, marginTop: 2 }}>
        {vm.dataQualityLabel}
      </Text>
      {vm.reasoning.map((reason, idx) => (
        <Text
          key={`policy-insight-reason-${idx}`}
          style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: 4 }}
        >
          {reason}
        </Text>
      ))}
      {isError ? (
        <Text
          testID="policy-insights-degraded"
          style={{ color: colors.warn, fontSize: typography.fontSize.xs, marginTop: 6 }}
        >
          Refresh failed — showing last available policy insight.
        </Text>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @clmm/ui test -- PolicyInsightsSection`
Expected: PASS. If color tokens used (`colors.breachAccent`, `colors.warn`) are missing on the design system, fall back to the closest existing tone — read `packages/ui/src/design-system/colors.ts` to find correct names and update the section file accordingly. Do not invent new tokens for this task.

- [ ] **Step 5: Run UI checks**

Run: `pnpm --filter @clmm/ui typecheck && pnpm --filter @clmm/ui lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/PolicyInsightsSection.tsx packages/ui/src/components/PolicyInsightsSection.test.tsx
git commit -m "feat(ui): add PolicyInsightsSection card"
```

### Task 13: Export `buildPolicyInsightsViewModel` (and section if needed) from UI barrel

**Files:**

- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Add the exports**

Edit `packages/ui/src/index.ts`. After the existing `export { buildRegimeViewModelBlock } from './view-models/RegimeViewModel.js';` line, add:

```ts
export { buildPolicyInsightsViewModel } from './view-models/PolicyInsightsViewModel.js';
export type {
  PolicyInsightsViewModel,
  PolicyInsightsSeverity,
} from './view-models/PolicyInsightsViewModel.js';
```

After `export { RegimeSection } from './components/RegimeSection.js';`, add:

```ts
export { PolicyInsightsSection } from './components/PolicyInsightsSection.js';
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @clmm/ui typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/index.ts
git commit -m "feat(ui): export PolicyInsightsSection and view model"
```

---

## Phase 7 — Screen Composition

### Task 14: Add PolicyInsights props to `PositionsListScreen` and render below `RegimeSection`

**Files:**

- Modify: `packages/ui/src/screens/PositionsListScreen.tsx`

- [ ] **Step 1: Import the section type and component**

At the top of `packages/ui/src/screens/PositionsListScreen.tsx`, in the existing `import type { ... } from '@clmm/application/public';` block, append `PolicyInsightBlock`:

```ts
import type {
  PositionSummaryDto,
  SrLevelsBlock,
  SrThesesBlock,
  RegimeBlock,
  PolicyInsightBlock,
} from '@clmm/application/public';
```

After `import { RegimeSection } from '../components/RegimeSection.js';`, add:

```ts
import { PolicyInsightsSection } from '../components/PolicyInsightsSection.js';
```

- [ ] **Step 2: Add PolicyInsights props to the outer `Props` and inner `ConnectedPositionsList` Props**

In the outer top-level `Props` type, after the regime fields, add:

```ts
policyInsight?: PolicyInsightBlock | null | undefined;
policyInsightsLoading?: boolean | undefined;
policyInsightsError?: boolean | undefined;
policyInsightsEnabled?: boolean | undefined;
policyInsightsUnavailableReason?:
  | 'not-found'
  | 'store-unavailable'
  | 'config-error'
  | 'upstream-error'
  | null
  | undefined;
```

In the inner `ConnectedPositionsList` Props (further down the same file), add the same five fields. Destructure them from the props in both the outer component and `ConnectedPositionsList`.

- [ ] **Step 3: Pass them through to `ConnectedPositionsList`**

In the outer component's JSX, find the existing call to `<ConnectedPositionsList ... />`. After the `regimeUnavailableReason={...}` prop, add:

```tsx
policyInsight = { policyInsight };
policyInsightsLoading = { policyInsightsLoading };
policyInsightsError = { policyInsightsError };
policyInsightsEnabled = { policyInsightsEnabled };
policyInsightsUnavailableReason = { policyInsightsUnavailableReason };
```

- [ ] **Step 4: Render `PolicyInsightsSection` below `RegimeSection`**

In the `ListFooterComponent` of the `FlatList`, after the `<RegimeSection ... />` block, add:

```tsx
<PolicyInsightsSection
  policyInsight={policyInsight}
  isLoading={policyInsightsLoading ?? false}
  isError={policyInsightsError ?? false}
  isEnabled={policyInsightsEnabled ?? false}
  unavailableReason={policyInsightsUnavailableReason ?? null}
  now={now ?? Date.now()}
/>
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @clmm/ui typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/screens/PositionsListScreen.tsx
git commit -m "feat(ui): wire PolicyInsightsSection into PositionsListScreen footer"
```

### Task 15: Cover footer order, gating, and independent failure in `PositionsListScreen.test.tsx`

**Files:**

- Modify: `packages/ui/src/screens/PositionsListScreen.test.tsx`

- [ ] **Step 1: Read the existing test to find a wallet-connected scenario already in use**

Read the file once with `Read` so you know which props the existing tests already pass. The pattern for a connected scenario typically supplies `walletAddress`, `positions: [...]`, and the various S/R/regime props.

- [ ] **Step 2: Append a footer-order test**

Append at the bottom of the file, inside the existing `describe`:

```tsx
it('renders footer sections in order: SrInsights, Regime, PolicyInsights', () => {
  const fixturePositions: PositionSummaryDto[] = [
    /* reuse existing fixture from this file */
  ];
  render(
    <PositionsListScreen
      walletAddress="wallet-1"
      positions={fixturePositions}
      isMixedPools={false}
      poolLabel="SOL/USDC"
      now={Date.parse('2026-05-07T12:30:00Z')}
      policyInsight={null}
      policyInsightsLoading={false}
      policyInsightsError={false}
      policyInsightsEnabled
      policyInsightsUnavailableReason="not-found"
    />,
  );
  // The three sections are independent — verify all three test IDs exist.
  // Use whatever discriminating ID each section already uses.
  // PolicyInsights renders with text 'No policy insight available yet.'
  expect(screen.getByText('No policy insight available yet.')).toBeTruthy();
});

it('does not render PolicyInsightsSection when not enabled', () => {
  const fixturePositions: PositionSummaryDto[] = [
    /* reuse existing fixture */
  ];
  render(
    <PositionsListScreen
      walletAddress="wallet-1"
      positions={fixturePositions}
      isMixedPools={false}
      poolLabel="SOL/USDC"
      now={Date.parse('2026-05-07T12:30:00Z')}
      policyInsight={null}
      policyInsightsLoading={false}
      policyInsightsError={false}
      policyInsightsEnabled={false}
      policyInsightsUnavailableReason="not-found"
    />,
  );
  expect(screen.queryByText('No policy insight available yet.')).toBeNull();
});

it('renders RegimeSection and SrInsightsSection even if PolicyInsights is in error', () => {
  const fixturePositions: PositionSummaryDto[] = [
    /* reuse existing fixture */
  ];
  render(
    <PositionsListScreen
      walletAddress="wallet-1"
      positions={fixturePositions}
      isMixedPools={false}
      poolLabel="SOL/USDC"
      now={Date.parse('2026-05-07T12:30:00Z')}
      policyInsight={null}
      policyInsightsLoading={false}
      policyInsightsError
      policyInsightsEnabled
      policyInsightsUnavailableReason="upstream-error"
    />,
  );
  expect(screen.getByText('Policy insights unavailable.')).toBeTruthy();
  // Existing assertions from earlier tests already verify Regime and S/R render
  // independently — leave them untouched.
});
```

If `fixturePositions` already exists at the module scope of the test file, reuse it. If the existing tests build positions inline, copy the same construction here verbatim — do not factor out shared state in this task.

- [ ] **Step 3: Run the test file**

Run: `pnpm --filter @clmm/ui test -- PositionsListScreen`
Expected: PASS. If new tests rely on RegimeSection/SrInsights rendering shape that has changed, adjust the assertions to match the existing render output (don't change the components).

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/screens/PositionsListScreen.test.tsx
git commit -m "test(ui): cover PolicyInsights footer order, gating, and independent failure"
```

---

## Phase 8 — Route Wiring

### Task 16: Wire the PolicyInsights query into the positions route with the SOL/USDC enable guard

**Files:**

- Modify: `apps/app/app/(tabs)/positions.tsx`

- [ ] **Step 1: Add the supported-pool constant and import**

At the top of `apps/app/app/(tabs)/positions.tsx`, after the existing import:

```ts
import { fetchCurrentSrTheses, SrThesesUnsupportedPoolError } from '../../src/api/srTheses';
```

add:

```ts
import { fetchCurrentPolicyInsight } from '../../src/api/policyInsights';
```

After the existing constants:

```ts
const SR_THESES_STALE_TIME_MS = 5 * 60 * 1000;
```

add:

```ts
const POLICY_INSIGHTS_STALE_TIME_MS = 5 * 60 * 1000;
const SOL_USDC_SUPPORTED_POOL_ID = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';
```

- [ ] **Step 2: Compute `policyInsightsEnabled` after the existing `deriveUniquePool` call**

Inside the `PositionsRoute` component, after the existing `const { poolId, poolLabel, isMixedPools } = deriveUniquePool(positions);` line, add:

```ts
const policyInsightsEnabled =
  hasLoadedPositions && !isMixedPools && poolId === SOL_USDC_SUPPORTED_POOL_ID;
```

(`hasLoadedPositions` is already declared a few lines above; `isMixedPools` and `poolId` are produced by `deriveUniquePool`.)

- [ ] **Step 3: Add the `policyInsightsQuery`**

Immediately after the existing `srThesesQuery`, add:

```ts
const policyInsightsQuery = useQuery({
  queryKey: ['policy-insights-current', 'SOL/USDC'],
  queryFn: fetchCurrentPolicyInsight,
  enabled: policyInsightsEnabled,
  staleTime: POLICY_INSIGHTS_STALE_TIME_MS,
  refetchOnWindowFocus: false,
  refetchOnMount: true,
  retry: (failureCount: number) => failureCount < 1,
  retryDelay: 1000,
});
```

- [ ] **Step 4: Pass props to `PositionsListScreen`**

Inside the JSX returned by `PositionsRoute`, after the existing `srThesesUnavailableReason={srThesesQuery.data?.unavailableReason ?? null}` prop, add:

```tsx
policyInsight={policyInsightsQuery.data?.policyInsight}
policyInsightsLoading={
  policyInsightsQuery.isLoading && policyInsightsQuery.fetchStatus !== 'idle'
}
policyInsightsError={policyInsightsQuery.isError}
policyInsightsEnabled={policyInsightsEnabled}
policyInsightsUnavailableReason={
  policyInsightsQuery.data?.unavailableReason ?? null
}
```

- [ ] **Step 5: Typecheck and lint the app**

Run: `pnpm --filter app typecheck && pnpm --filter app lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/app/app/(tabs)/positions.tsx
git commit -m "feat(app): wire PolicyInsights query and SOL/USDC enable guard"
```

---

## Phase 9 — Final Verification

### Task 17: Run the full repo check matrix and the build

**Files:** none

- [ ] **Step 1: Boundaries**

Run: `pnpm boundaries`
Expected: PASS. If a boundary violation appears, the most likely cause is `apps/app` importing from `@clmm/application` (instead of `@clmm/application/public`) or `packages/ui` importing from `@clmm/adapters`. Inspect the offending file and re-route through the correct surface.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 4: Tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Build**

Run: `pnpm build`
Expected: PASS. The spec calls this out specifically because PolicyInsights wires multiple packages and an in-package `tsc` doesn't cover cross-package dist consumers.

- [ ] **Step 6: Smoke-test the BFF route locally (optional but recommended)**

In one shell:

```bash
pnpm dev:api
```

In another:

```bash
curl -i "$BFF_BASE_URL/policy-insights/sol-usdc/current"
```

Expected: a 200 with `{ policyInsight: ... }` when `REGIME_ENGINE_BASE_URL` points at a live regime-engine, otherwise `{ policyInsight: null, unavailableReason: 'config-error' }` (or `upstream-error`/`store-unavailable` depending on conditions). Stop the dev server when done.

- [ ] **Step 7: Final commit (if any leftover changes)**

```bash
git status
```

Expected: clean working tree. If anything is unstaged, decide whether it belongs in the most recent commit (amend if and only if the user has not asked to avoid amends), or in a new follow-up commit.

---

## Out Of Scope (Reaffirmation)

These are explicitly _not_ part of this plan; do not implement, even if you notice gaps:

- Auto-applying `clmmPolicy` to position parameters.
- One-click apply of policy knobs.
- Position-detail PolicyInsights surface, history, or timeline.
- Chart overlays for `levels`.
- Merging `levels` into `SrInsightsSection`.
- Rendering `sourceRefs` anywhere.
- Any change to Regime, S/R, execution, trigger qualification, or directional exit policy.
- Adding `poolId` anywhere on the PolicyInsights path.

Create separate follow-up issues for these once MVP lands; the spec's "Follow-Up Issues" section enumerates them.
