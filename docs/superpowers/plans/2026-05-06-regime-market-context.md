# Regime Market Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface regime-engine `GET /v1/regime/current` data on the positions list as informational market context, parallel to (not nested under) the existing S/R section, via a pool-scoped BFF route `GET /regime/pools/:poolId/current`.

**Architecture:** Mirrors the existing S/R read path — separate `RegimeReadPort` + `RegimeBlock` DTO in `packages/application`, a `CurrentRegimeAdapter` in `packages/adapters/src/outbound/regime-engine/`, a NestJS `RegimeController` in `packages/adapters/src/inbound/http/`, an Expo client in `apps/app/src/api/regime.ts`, and a presentational `RegimeSection` in `packages/ui`. `MarketContextPanel` is renamed to `SrInsightsSection`. `RegimeSection` is rendered immediately below it in the positions list footer. Pure value types (`MarketRegime`, `ClmmSuitabilityStatus`) live in `packages/domain`.

**Tech Stack:** TypeScript 5, NestJS 10 (BFF), `@solana/kit`-free read path, Expo Router + React Native + TanStack Query (apps/app), Vitest. Source of truth: [`docs/superpowers/specs/2026-05-06-regime-market-context-design.md`](../specs/2026-05-06-regime-market-context-design.md).

**Out of scope (do not change):** `DirectionalExitPolicyService`, exit pipeline, trigger qualification, signing, execution, position-detail/preview/signing screens, `SR_LEVELS_POOL_ALLOWLIST_MAP`. Regime is read-only and informational.

---

## Upstream `regime-engine` Response Shape (assumed)

The spec documents the BFF and UI contracts but not the upstream JSON. The adapter must validate against this shape (every field below is required unless marked optional, and unknown extra fields are ignored):

```ts
type UpstreamRegimeResponse = {
  regime: 'UP' | 'DOWN' | 'CHOP';
  trendStrength: number;
  volRatio: number;
  clmmSuitability: {
    status: 'ALLOWED' | 'CAUTION' | 'BLOCKED' | 'UNKNOWN';
    reasons: Array<{ severity: 'ERROR' | 'WARN' | 'INFO'; text: string; code?: string }>;
  };
  marketReasons: Array<{ severity: 'ERROR' | 'WARN' | 'INFO'; text: string; code?: string }>;
  freshness: {
    capturedAtIso: string; // ISO 8601 timestamp
    softStale: boolean;
    hardStale: boolean;
  };
  metadata?: {
    source?: string; // e.g. 'geckoterminal'
    network?: string; // e.g. 'solana'
    symbol?: string; // e.g. 'SOL/USDC'
    timeframe?: string; // e.g. '1h'
  };
};
```

Upstream error envelope (used by 4xx classification):

```ts
type UpstreamErrorEnvelope = { code?: string; message?: string };
// 404 with code === 'CANDLES_NOT_FOUND'  -> not-found
// 400 with code === 'VALIDATION_ERROR'   -> config-error
```

The application `RegimeBlock` DTO mirrors this shape but stores `freshness.capturedAtUnixMs: number` (already-parsed UNIX ms) instead of `capturedAtIso`. The adapter performs the ISO→ms conversion. UI never sees the upstream shape.

---

## File Structure

| File                                                                        | Responsibility                                                                                                                     |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `packages/domain/src/regime/index.ts`                                       | NEW. Pure value types: `MarketRegime`, `ClmmSuitabilityStatus`.                                                                    |
| `packages/domain/src/index.ts`                                              | Re-export `regime/`.                                                                                                               |
| `packages/application/src/dto/regime.ts`                                    | NEW. `RegimeBlock`, `RegimeReason`, `RegimeReasonSeverity`, `RegimeFreshness`, `RegimeClmmSuitability`, `RegimeMetadata`.          |
| `packages/application/src/dto/index.ts`                                     | Re-export regime DTOs (drift guard pattern, like `SrLevelsBlock`).                                                                 |
| `packages/application/src/ports/index.ts`                                   | Add `RegimeReadPort` and the `RegimeReadResult` discriminated union.                                                               |
| `packages/application/src/index.ts`                                         | Re-export new types from internal API.                                                                                             |
| `packages/application/src/public/index.ts`                                  | Re-export `RegimeBlock`, sub-types, `MarketRegime`, `ClmmSuitabilityStatus` for UI consumption.                                    |
| `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.ts`      | NEW. Implements `RegimeReadPort`. Five required upstream params. Classifies outcomes.                                              |
| `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.test.ts` | NEW. Adapter test cases for happy path, 404, 400, 5xx, timeout, network error, malformed body.                                     |
| `packages/adapters/src/inbound/http/tokens.ts`                              | Add `REGIME_READ_PORT`, `REGIME_FEED_CONFIG_RESOLVER`, `REGIME_POOL_ALLOWLIST`.                                                    |
| `packages/adapters/src/inbound/http/RegimeFeedConfig.ts`                    | NEW. Resolves the five env vars at request time and returns `RegimeFeedConfigResult`.                                              |
| `packages/adapters/src/inbound/http/RegimeFeedConfig.test.ts`               | NEW. Validates env-var resolution, missing-config detection.                                                                       |
| `packages/adapters/src/inbound/http/RegimeController.ts`                    | NEW. `GET /regime/pools/:poolId/current`. Maps adapter outcomes to BFF contract.                                                   |
| `packages/adapters/src/inbound/http/RegimeController.test.ts`               | NEW. Controller test cases for unsupported pool, every outcome path.                                                               |
| `packages/adapters/src/inbound/http/AppModule.ts`                           | Wire `CurrentRegimeAdapter`, allowlist, config resolver, register `RegimeController`.                                              |
| `apps/app/src/api/regime.ts`                                                | NEW. App API client with `RegimeUnsupportedPoolError`.                                                                             |
| `apps/app/src/api/regime.test.ts`                                           | NEW. Validates 404 mapping, 200 happy path, malformed-body rejection.                                                              |
| `apps/app/app/(tabs)/positions.tsx`                                         | Add second non-blocking `useQuery` for regime; pass props to `PositionsListScreen`.                                                |
| `packages/ui/src/view-models/RegimeViewModel.ts`                            | NEW. Maps `RegimeBlock` to view-model: badge tones, telemetry strings, freshness label, top reasons.                               |
| `packages/ui/src/view-models/RegimeViewModel.test.ts`                       | NEW. Tests for severity sort + source-order tie-break, freshness, stale flags.                                                     |
| `packages/ui/src/components/SrInsightsSection.tsx`                          | RENAMED from `MarketContextPanel.tsx`. Identical logic; only class/file name + display string change.                              |
| `packages/ui/src/components/SrInsightsSection.test.tsx`                     | RENAMED from `MarketContextPanel.test.tsx`. Same assertions.                                                                       |
| `packages/ui/src/components/RegimeSection.tsx`                              | NEW. Compact non-interactive section: badges, top reasons, telemetry, freshness, unavailable copy.                                 |
| `packages/ui/src/components/RegimeSection.test.tsx`                         | NEW. Renders all states from `unavailableReason`.                                                                                  |
| `packages/ui/src/screens/PositionsListScreen.tsx`                           | Replace `MarketContextPanel` with `SrInsightsSection`; render `RegimeSection` directly below it. Add regime props.                 |
| `packages/ui/src/screens/PositionsListScreen.test.tsx`                      | Add coverage: order, independent degradation, mixed-pool/regime-disabled.                                                          |
| `packages/ui/src/index.ts`                                                  | Replace `MarketContextPanel` export (was not exported anyway — verify) and add `RegimeSection` if needed for tests; export new VM. |

---

## Phase 0 — Pre-flight & Baseline

### Task 0: Confirm baseline is green

**Files:** none

- [ ] **Step 1: Bootstrap the worktree if needed**

```bash
[ -d node_modules ] || pnpm install --frozen-lockfile
[ -d packages/application/dist ] || pnpm build
```

Expected: deps and build outputs present. Skip if already bootstrapped.

- [ ] **Step 2: Run the full check matrix and confirm green**

```bash
pnpm typecheck && pnpm lint && pnpm boundaries && pnpm test
```

Expected: all pass. If anything fails before any change, stop and report — every later task assumes a green baseline.

---

## Phase 1 — Domain Value Types

### Task 1: Add `MarketRegime` and `ClmmSuitabilityStatus` pure value types

**Files:**

- Create: `packages/domain/src/regime/index.ts`
- Create: `packages/domain/src/regime/index.test.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/domain/src/regime/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { MarketRegime, ClmmSuitabilityStatus } from './index.js';

describe('domain/regime value types', () => {
  it('accepts each MarketRegime literal at compile time', () => {
    const up: MarketRegime = 'UP';
    const down: MarketRegime = 'DOWN';
    const chop: MarketRegime = 'CHOP';
    expect([up, down, chop]).toEqual(['UP', 'DOWN', 'CHOP']);
  });

  it('accepts each ClmmSuitabilityStatus literal at compile time', () => {
    const allowed: ClmmSuitabilityStatus = 'ALLOWED';
    const caution: ClmmSuitabilityStatus = 'CAUTION';
    const blocked: ClmmSuitabilityStatus = 'BLOCKED';
    const unknown: ClmmSuitabilityStatus = 'UNKNOWN';
    expect([allowed, caution, blocked, unknown]).toEqual([
      'ALLOWED',
      'CAUTION',
      'BLOCKED',
      'UNKNOWN',
    ]);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --filter @clmm/domain test -- regime`
Expected: FAIL with module-not-found for `./index.js`.

- [ ] **Step 3: Create the value-type module**

Create `packages/domain/src/regime/index.ts`:

```ts
// Pure value types. No external SDKs. Mirrors the regime-engine wire types
// for use by the application port.
export type MarketRegime = 'UP' | 'DOWN' | 'CHOP';
export type ClmmSuitabilityStatus = 'ALLOWED' | 'CAUTION' | 'BLOCKED' | 'UNKNOWN';
```

- [ ] **Step 4: Re-export from domain barrel**

Edit `packages/domain/src/index.ts`. Append at the bottom:

```ts
// Regime value types (used by application RegimeReadPort)
export * from './regime/index.js';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @clmm/domain test -- regime`
Expected: PASS.

- [ ] **Step 6: Run typecheck and lint**

Run: `pnpm --filter @clmm/domain typecheck && pnpm --filter @clmm/domain lint`
Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/regime/index.ts packages/domain/src/regime/index.test.ts packages/domain/src/index.ts
git commit -m "feat(domain): add MarketRegime and ClmmSuitabilityStatus value types"
```

---

## Phase 2 — Application Port and DTOs

### Task 2: Add `RegimeBlock` DTO and nested types

**Files:**

- Create: `packages/application/src/dto/regime.ts`
- Modify: `packages/application/src/dto/index.ts`

- [ ] **Step 1: Create the DTO module**

Create `packages/application/src/dto/regime.ts`:

```ts
import type { MarketRegime, ClmmSuitabilityStatus } from '@clmm/domain';

// Drift guard: this DTO is structurally validated by
// packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.ts.
// Any field added or removed here MUST be reflected in the adapter
// validator and the upstream contract section of the implementation
// plan. Application MUST NOT import from adapters.

export type RegimeReasonSeverity = 'ERROR' | 'WARN' | 'INFO';

export type RegimeReason = {
  // Source order is preserved by both the upstream and the adapter.
  // The view-model uses array index as the source-order tie-breaker.
  severity: RegimeReasonSeverity;
  text: string;
  code?: string;
};

export type RegimeFreshness = {
  capturedAtUnixMs: number;
  softStale: boolean;
  hardStale: boolean;
};

export type RegimeClmmSuitability = {
  status: ClmmSuitabilityStatus;
  reasons: RegimeReason[];
};

export type RegimeMetadata = {
  source?: string;
  network?: string;
  symbol?: string;
  timeframe?: string;
};

export type RegimeBlock = {
  regime: MarketRegime;
  trendStrength: number;
  volRatio: number;
  clmmSuitability: RegimeClmmSuitability;
  marketReasons: RegimeReason[];
  freshness: RegimeFreshness;
  metadata?: RegimeMetadata;
};
```

- [ ] **Step 2: Re-export from the DTO barrel**

Edit `packages/application/src/dto/index.ts`. Add at the end of the file (after the existing exports):

```ts
export type {
  RegimeReasonSeverity,
  RegimeReason,
  RegimeFreshness,
  RegimeClmmSuitability,
  RegimeMetadata,
  RegimeBlock,
} from './regime.js';
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @clmm/application typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/application/src/dto/regime.ts packages/application/src/dto/index.ts
git commit -m "feat(application): add RegimeBlock DTO and nested types"
```

### Task 3: Add `RegimeReadPort` to application ports

**Files:**

- Modify: `packages/application/src/ports/index.ts`

- [ ] **Step 1: Edit the ports module**

Open `packages/application/src/ports/index.ts`. Locate the `// --- S/R levels read port ---` block (around line 264). Immediately after the closing of `SrLevelsReadPort`, add:

```ts
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
```

- [ ] **Step 2: Add the import for `RegimeBlock`**

In the import block at the top of `packages/application/src/ports/index.ts` (the line that already imports `SrLevelsBlock` from `'../dto/index.js'`), append `RegimeBlock`:

```ts
import type { SrLevelsBlock, RegimeBlock } from '../dto/index.js';
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @clmm/application typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/application/src/ports/index.ts
git commit -m "feat(application): add RegimeReadPort with explicit outcome union"
```

### Task 4: Re-export regime types from application internal and public barrels

**Files:**

- Modify: `packages/application/src/index.ts`
- Modify: `packages/application/src/public/index.ts`

- [ ] **Step 1: Write the failing parity test**

Create `packages/application/src/public/regime.exports.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type {
  RegimeBlock,
  RegimeReason,
  RegimeReasonSeverity,
  RegimeFreshness,
  RegimeClmmSuitability,
  RegimeMetadata,
  MarketRegime,
  ClmmSuitabilityStatus,
} from './index.js';

describe('@clmm/application/public exports for regime', () => {
  it('exposes RegimeBlock and nested DTOs as types', () => {
    const sample: RegimeBlock = {
      regime: 'UP' as MarketRegime,
      trendStrength: 0.4,
      volRatio: 1.1,
      clmmSuitability: {
        status: 'ALLOWED' as ClmmSuitabilityStatus,
        reasons: [{ severity: 'INFO' as RegimeReasonSeverity, text: 'ok' }],
      } satisfies RegimeClmmSuitability,
      marketReasons: [] as RegimeReason[],
      freshness: {
        capturedAtUnixMs: 0,
        softStale: false,
        hardStale: false,
      } satisfies RegimeFreshness,
      metadata: {} satisfies RegimeMetadata,
    };
    expect(sample.regime).toBe('UP');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @clmm/application test -- regime.exports`
Expected: FAIL — types not exported from `public/index.ts`.

- [ ] **Step 3: Add re-exports in the internal barrel**

Edit `packages/application/src/index.ts`. The file currently runs `export * from './ports/index.js'` and `export * from './dto/index.js'`, so the new types are already available through the wildcard exports — verify by reading the file. No edit required if those wildcards exist. If not, add explicit `export type { ... } from '../dto/regime.js'` and the port types from `../ports/index.js`.

- [ ] **Step 4: Add re-exports in the public barrel**

Edit `packages/application/src/public/index.ts`. In the existing `export type { ... } from '../dto/index.js'` block (the one that lists `SrLevel, SrLevelsBlock`), append the regime types so the block reads:

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
  RegimeBlock,
  RegimeReason,
  RegimeReasonSeverity,
  RegimeFreshness,
  RegimeClmmSuitability,
  RegimeMetadata,
} from '../dto/index.js';
```

In the same file, locate the existing block of domain re-exports (the one that exports `BreachDirection` etc.) and add the two new value types:

```ts
export type {
  BreachDirection,
  ExecutionLifecycleState,
  DirectionalExitPolicyResult,
  MarketRegime,
  ClmmSuitabilityStatus,
} from '@clmm/domain';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @clmm/application test -- regime.exports`
Expected: PASS.

- [ ] **Step 6: Run application checks**

Run: `pnpm --filter @clmm/application typecheck && pnpm --filter @clmm/application test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/application/src/public/index.ts packages/application/src/public/regime.exports.test.ts packages/application/src/index.ts
git commit -m "feat(application): export regime DTOs and value types via public API"
```

---

## Phase 3 — Adapter

### Task 5: Implement `CurrentRegimeAdapter` with full outcome classification

**Files:**

- Create: `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.ts`
- Create: `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.test.ts`

- [ ] **Step 1: Write the failing test for the happy path**

Create `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CurrentRegimeAdapter } from './CurrentRegimeAdapter.js';
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

const PARAMS = {
  symbol: 'SOL/USDC',
  source: 'geckoterminal',
  network: 'solana',
  poolAddress: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
  timeframe: '1h',
};

const SAMPLE_UPSTREAM = {
  regime: 'UP',
  trendStrength: 0.62,
  volRatio: 1.08,
  clmmSuitability: {
    status: 'ALLOWED',
    reasons: [{ severity: 'INFO', text: 'Trend supports range LP', code: 'CLMM_OK' }],
  },
  marketReasons: [{ severity: 'INFO', text: 'Constructive trend', code: 'TREND_OK' }],
  freshness: {
    capturedAtIso: '2026-05-06T12:00:00Z',
    softStale: false,
    hardStale: false,
  },
  metadata: {
    source: 'geckoterminal',
    network: 'solana',
    symbol: 'SOL/USDC',
    timeframe: '1h',
  },
};

describe('CurrentRegimeAdapter', () => {
  let obs: ReturnType<typeof createFakeObservability>;

  beforeEach(() => {
    obs = createFakeObservability();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns kind:"block" with parsed RegimeBlock on 200', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_UPSTREAM), { status: 200 }),
    );
    const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);

    const result = await adapter.fetchCurrent(PARAMS);

    expect(result.kind).toBe('block');
    if (result.kind !== 'block') return;
    expect(result.block.regime).toBe('UP');
    expect(result.block.trendStrength).toBe(0.62);
    expect(result.block.volRatio).toBe(1.08);
    expect(result.block.clmmSuitability.status).toBe('ALLOWED');
    expect(result.block.freshness.capturedAtUnixMs).toBe(Date.parse('2026-05-06T12:00:00Z'));
    expect(result.block.freshness.softStale).toBe(false);
    expect(result.block.freshness.hardStale).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @clmm/adapters test -- CurrentRegimeAdapter`
Expected: FAIL — module not found.

- [ ] **Step 3: Create a minimal adapter that passes the happy-path test**

Create `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.ts`:

```ts
import type {
  ObservabilityPort,
  RegimeReadPort,
  RegimeReadResult,
  RegimeBlock,
  RegimeReason,
  RegimeReasonSeverity,
} from '@clmm/application';
import type { MarketRegime, ClmmSuitabilityStatus } from '@clmm/domain';

const FETCH_TIMEOUT_MS = 2000;

const VALID_REGIMES: ReadonlySet<MarketRegime> = new Set(['UP', 'DOWN', 'CHOP']);
const VALID_STATUSES: ReadonlySet<ClmmSuitabilityStatus> = new Set([
  'ALLOWED',
  'CAUTION',
  'BLOCKED',
  'UNKNOWN',
]);
const VALID_SEVERITIES: ReadonlySet<RegimeReasonSeverity> = new Set(['ERROR', 'WARN', 'INFO']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseReasons(raw: unknown): RegimeReason[] | null {
  if (!Array.isArray(raw)) return null;
  const out: RegimeReason[] = [];
  for (const item of raw) {
    if (!isRecord(item)) return null;
    const sev = item['severity'];
    const text = item['text'];
    if (typeof sev !== 'string' || !VALID_SEVERITIES.has(sev as RegimeReasonSeverity)) return null;
    if (typeof text !== 'string') return null;
    const code = item['code'];
    out.push({
      severity: sev as RegimeReasonSeverity,
      text,
      ...(typeof code === 'string' ? { code } : {}),
    });
  }
  return out;
}

function parseUpstream(data: unknown): RegimeBlock | null {
  if (!isRecord(data)) return null;

  const regime = data['regime'];
  if (typeof regime !== 'string' || !VALID_REGIMES.has(regime as MarketRegime)) return null;

  const trendStrength = data['trendStrength'];
  const volRatio = data['volRatio'];
  if (typeof trendStrength !== 'number' || !Number.isFinite(trendStrength)) return null;
  if (typeof volRatio !== 'number' || !Number.isFinite(volRatio)) return null;

  const suit = data['clmmSuitability'];
  if (!isRecord(suit)) return null;
  const status = suit['status'];
  if (typeof status !== 'string' || !VALID_STATUSES.has(status as ClmmSuitabilityStatus))
    return null;
  const suitReasons = parseReasons(suit['reasons']);
  if (!suitReasons) return null;

  const marketReasons = parseReasons(data['marketReasons']);
  if (!marketReasons) return null;

  const freshness = data['freshness'];
  if (!isRecord(freshness)) return null;
  const capturedAtIso = freshness['capturedAtIso'];
  const softStale = freshness['softStale'];
  const hardStale = freshness['hardStale'];
  if (typeof capturedAtIso !== 'string') return null;
  if (typeof softStale !== 'boolean' || typeof hardStale !== 'boolean') return null;
  const capturedAtUnixMs = Date.parse(capturedAtIso);
  if (!Number.isFinite(capturedAtUnixMs)) return null;

  const metadataRaw = data['metadata'];
  const metadata = isRecord(metadataRaw)
    ? {
        ...(typeof metadataRaw['source'] === 'string' ? { source: metadataRaw['source'] } : {}),
        ...(typeof metadataRaw['network'] === 'string' ? { network: metadataRaw['network'] } : {}),
        ...(typeof metadataRaw['symbol'] === 'string' ? { symbol: metadataRaw['symbol'] } : {}),
        ...(typeof metadataRaw['timeframe'] === 'string'
          ? { timeframe: metadataRaw['timeframe'] }
          : {}),
      }
    : undefined;

  return {
    regime: regime as MarketRegime,
    trendStrength,
    volRatio,
    clmmSuitability: { status: status as ClmmSuitabilityStatus, reasons: suitReasons },
    marketReasons,
    freshness: { capturedAtUnixMs, softStale, hardStale },
    ...(metadata ? { metadata } : {}),
  };
}

export class CurrentRegimeAdapter implements RegimeReadPort {
  constructor(
    private readonly baseUrl: string | null,
    private readonly observability: ObservabilityPort,
  ) {}

  async fetchCurrent(params: {
    symbol: string;
    source: string;
    network: string;
    poolAddress: string;
    timeframe: string;
  }): Promise<RegimeReadResult> {
    if (!this.baseUrl) {
      this.observability.log('warn', 'Regime read disabled — no REGIME_ENGINE_BASE_URL configured');
      return { kind: 'config-error' };
    }

    const url = new URL(`${this.baseUrl.replace(/\/+$/, '')}/v1/regime/current`);
    url.searchParams.set('symbol', params.symbol);
    url.searchParams.set('source', params.source);
    url.searchParams.set('network', params.network);
    url.searchParams.set('poolAddress', params.poolAddress);
    url.searchParams.set('timeframe', params.timeframe);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url.toString(), { signal: controller.signal });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.observability.log('warn', 'Regime fetch network error', { message });
      return { kind: 'upstream-error' };
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 200) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        this.observability.log('warn', 'Regime response was not valid JSON');
        return { kind: 'upstream-error' };
      }
      const block = parseUpstream(body);
      if (!block) {
        this.observability.log('warn', 'Regime response failed shape validation');
        return { kind: 'upstream-error' };
      }
      return { kind: 'block', block };
    }

    if (response.status === 404) {
      const envelope = await this.readErrorEnvelope(response);
      if (envelope?.code === 'CANDLES_NOT_FOUND') {
        return { kind: 'not-found' };
      }
      this.observability.log('warn', 'Regime upstream 404 with unexpected code', { envelope });
      return { kind: 'upstream-error' };
    }

    if (response.status === 400) {
      const envelope = await this.readErrorEnvelope(response);
      if (envelope?.code === 'VALIDATION_ERROR') {
        this.observability.log('warn', 'Regime upstream rejected request as VALIDATION_ERROR', {
          envelope,
        });
        return { kind: 'config-error' };
      }
      this.observability.log('warn', 'Regime upstream 400 with unexpected code', { envelope });
      return { kind: 'upstream-error' };
    }

    this.observability.log('warn', 'Regime upstream non-2xx', { status: response.status });
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

Run: `pnpm --filter @clmm/adapters test -- CurrentRegimeAdapter`
Expected: PASS.

- [ ] **Step 5: Add tests for every other outcome path**

Append to `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.test.ts` (inside the same `describe` block):

```ts
it('sends all five required upstream query params', async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify(SAMPLE_UPSTREAM), { status: 200 }),
  );
  const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
  await adapter.fetchCurrent(PARAMS);
  const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
  expect(calledUrl).toContain('symbol=SOL%2FUSDC');
  expect(calledUrl).toContain('source=geckoterminal');
  expect(calledUrl).toContain('network=solana');
  expect(calledUrl).toContain('poolAddress=Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE');
  expect(calledUrl).toContain('timeframe=1h');
});

it('returns kind:"not-found" when upstream returns 404 CANDLES_NOT_FOUND', async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ code: 'CANDLES_NOT_FOUND', message: 'no candles' }), {
      status: 404,
    }),
  );
  const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent(PARAMS);
  expect(result.kind).toBe('not-found');
});

it('returns kind:"config-error" when upstream returns 400 VALIDATION_ERROR', async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ code: 'VALIDATION_ERROR', message: 'bad symbol' }), {
      status: 400,
    }),
  );
  const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent(PARAMS);
  expect(result.kind).toBe('config-error');
  expect(obs.logs.some((l) => l.message.includes('VALIDATION_ERROR'))).toBe(true);
});

it('returns kind:"upstream-error" on 5xx', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response('Bad gateway', { status: 502 }));
  const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent(PARAMS);
  expect(result.kind).toBe('upstream-error');
});

it('returns kind:"upstream-error" on network error', async () => {
  vi.mocked(fetch).mockRejectedValue(new Error('ECONNRESET'));
  const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent(PARAMS);
  expect(result.kind).toBe('upstream-error');
});

it('returns kind:"upstream-error" on malformed body shape', async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ regime: 'INVALID', trendStrength: 'oops' }), { status: 200 }),
  );
  const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent(PARAMS);
  expect(result.kind).toBe('upstream-error');
});

it('returns kind:"upstream-error" on unparseable JSON body', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response('not json', { status: 200 }));
  const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent(PARAMS);
  expect(result.kind).toBe('upstream-error');
});

it('returns kind:"config-error" when baseUrl is null', async () => {
  const adapter = new CurrentRegimeAdapter(null, obs.port);
  const result = await adapter.fetchCurrent(PARAMS);
  expect(result.kind).toBe('config-error');
  expect(vi.mocked(fetch)).not.toHaveBeenCalled();
});

it('strips trailing slash from baseUrl', async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify(SAMPLE_UPSTREAM), { status: 200 }),
  );
  const adapter = new CurrentRegimeAdapter('https://regime.example.com/', obs.port);
  await adapter.fetchCurrent(PARAMS);
  const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
  expect(calledUrl).toMatch(/^https:\/\/regime\.example\.com\/v1\/regime\/current\?/);
});
```

- [ ] **Step 6: Run all adapter tests**

Run: `pnpm --filter @clmm/adapters test -- CurrentRegimeAdapter`
Expected: PASS for every case above.

- [ ] **Step 7: Run typecheck and lint**

Run: `pnpm --filter @clmm/adapters typecheck && pnpm --filter @clmm/adapters lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.ts packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.test.ts
git commit -m "feat(adapters): add CurrentRegimeAdapter with explicit outcome classification"
```

---

## Phase 4 — BFF Config + DI Tokens

### Task 6: Add `RegimeFeedConfig` resolver

**Files:**

- Create: `packages/adapters/src/inbound/http/RegimeFeedConfig.ts`
- Create: `packages/adapters/src/inbound/http/RegimeFeedConfig.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/adapters/src/inbound/http/RegimeFeedConfig.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveRegimeFeedConfig } from './RegimeFeedConfig.js';

describe('resolveRegimeFeedConfig', () => {
  it('returns kind:"ok" when every required env var is present', () => {
    const result = resolveRegimeFeedConfig({
      REGIME_ENGINE_SYMBOL: 'SOL/USDC',
      REGIME_ENGINE_SOURCE: 'geckoterminal',
      REGIME_ENGINE_NETWORK: 'solana',
      REGIME_ENGINE_POOL_ADDRESS: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
      REGIME_ENGINE_TIMEFRAME: '1h',
    });

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.config).toEqual({
      symbol: 'SOL/USDC',
      source: 'geckoterminal',
      network: 'solana',
      poolAddress: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
      timeframe: '1h',
    });
  });

  it('returns kind:"missing" listing every missing var', () => {
    const result = resolveRegimeFeedConfig({});
    expect(result.kind).toBe('missing');
    if (result.kind !== 'missing') return;
    expect(result.missing.sort()).toEqual(
      [
        'REGIME_ENGINE_NETWORK',
        'REGIME_ENGINE_POOL_ADDRESS',
        'REGIME_ENGINE_SOURCE',
        'REGIME_ENGINE_SYMBOL',
        'REGIME_ENGINE_TIMEFRAME',
      ].sort(),
    );
  });

  it('treats empty strings as missing', () => {
    const result = resolveRegimeFeedConfig({
      REGIME_ENGINE_SYMBOL: '',
      REGIME_ENGINE_SOURCE: 'geckoterminal',
      REGIME_ENGINE_NETWORK: 'solana',
      REGIME_ENGINE_POOL_ADDRESS: 'pool',
      REGIME_ENGINE_TIMEFRAME: '1h',
    });
    expect(result.kind).toBe('missing');
    if (result.kind !== 'missing') return;
    expect(result.missing).toEqual(['REGIME_ENGINE_SYMBOL']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @clmm/adapters test -- RegimeFeedConfig`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the resolver**

Create `packages/adapters/src/inbound/http/RegimeFeedConfig.ts`:

```ts
export type RegimeFeedConfig = {
  symbol: string;
  source: string;
  network: string;
  poolAddress: string;
  timeframe: string;
};

export type RegimeFeedConfigResult =
  | { kind: 'ok'; config: RegimeFeedConfig }
  | { kind: 'missing'; missing: string[] };

const REQUIRED_VARS: ReadonlyArray<{ env: string; field: keyof RegimeFeedConfig }> = [
  { env: 'REGIME_ENGINE_SYMBOL', field: 'symbol' },
  { env: 'REGIME_ENGINE_SOURCE', field: 'source' },
  { env: 'REGIME_ENGINE_NETWORK', field: 'network' },
  { env: 'REGIME_ENGINE_POOL_ADDRESS', field: 'poolAddress' },
  { env: 'REGIME_ENGINE_TIMEFRAME', field: 'timeframe' },
];

export function resolveRegimeFeedConfig(
  env: Record<string, string | undefined>,
): RegimeFeedConfigResult {
  const missing: string[] = [];
  const partial: Partial<RegimeFeedConfig> = {};
  for (const { env: name, field } of REQUIRED_VARS) {
    const raw = env[name];
    if (typeof raw !== 'string' || raw.length === 0) {
      missing.push(name);
      continue;
    }
    partial[field] = raw;
  }
  if (missing.length > 0) {
    return { kind: 'missing', missing };
  }
  return { kind: 'ok', config: partial as RegimeFeedConfig };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @clmm/adapters test -- RegimeFeedConfig`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/inbound/http/RegimeFeedConfig.ts packages/adapters/src/inbound/http/RegimeFeedConfig.test.ts
git commit -m "feat(bff): add regime feed config resolver"
```

### Task 7: Add DI tokens for the regime path

**Files:**

- Modify: `packages/adapters/src/inbound/http/tokens.ts`

- [ ] **Step 1: Append three new tokens**

Edit `packages/adapters/src/inbound/http/tokens.ts`. After the last `export const ... = '...';` line, append:

```ts
export const REGIME_READ_PORT = 'REGIME_READ_PORT';
export const REGIME_FEED_CONFIG_RESOLVER = 'REGIME_FEED_CONFIG_RESOLVER';
export const REGIME_POOL_ALLOWLIST = 'REGIME_POOL_ALLOWLIST';
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @clmm/adapters typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/adapters/src/inbound/http/tokens.ts
git commit -m "feat(bff): add regime DI tokens"
```

---

## Phase 5 — BFF Controller

### Task 8: Implement `RegimeController`

**Files:**

- Create: `packages/adapters/src/inbound/http/RegimeController.ts`
- Create: `packages/adapters/src/inbound/http/RegimeController.test.ts`

- [ ] **Step 1: Write the failing controller tests**

Create `packages/adapters/src/inbound/http/RegimeController.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { RegimeController } from './RegimeController.js';
import type { RegimeReadPort, RegimeReadResult, RegimeBlock } from '@clmm/application';
import type { RegimeFeedConfigResult } from './RegimeFeedConfig.js';

const SUPPORTED_POOL = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';
const UNSUPPORTED_POOL = 'Pool111111111111111111111111111111111111111';

const FEED = {
  symbol: 'SOL/USDC',
  source: 'geckoterminal',
  network: 'solana',
  poolAddress: SUPPORTED_POOL,
  timeframe: '1h',
};

function fixtureBlock(): RegimeBlock {
  return {
    regime: 'UP',
    trendStrength: 0.6,
    volRatio: 1.0,
    clmmSuitability: { status: 'ALLOWED', reasons: [] },
    marketReasons: [],
    freshness: { capturedAtUnixMs: 1_745_712_000_000, softStale: false, hardStale: false },
  };
}

function makeAllowlist(entries: string[] = [SUPPORTED_POOL]): Set<string> {
  return new Set(entries);
}

function makeResolver(result: RegimeFeedConfigResult) {
  return { resolve: vi.fn().mockReturnValue(result) };
}

function fakePort(result: RegimeReadResult): RegimeReadPort {
  return { fetchCurrent: vi.fn().mockResolvedValue(result) };
}

describe('RegimeController', () => {
  it('throws NotFoundException for unsupported pool ids', async () => {
    const port = fakePort({ kind: 'block', block: fixtureBlock() });
    const resolver = makeResolver({ kind: 'ok', config: FEED });
    const controller = new RegimeController(port, resolver, makeAllowlist());

    await expect(controller.getCurrent(UNSUPPORTED_POOL)).rejects.toBeInstanceOf(NotFoundException);
    expect(port.fetchCurrent).not.toHaveBeenCalled();
  });

  it('returns regime block + null unavailableReason on success', async () => {
    const block = fixtureBlock();
    const port = fakePort({ kind: 'block', block });
    const resolver = makeResolver({ kind: 'ok', config: FEED });
    const controller = new RegimeController(port, resolver, makeAllowlist());

    const result = await controller.getCurrent(SUPPORTED_POOL);
    expect(result).toEqual({ regime: block, unavailableReason: null });
    expect(port.fetchCurrent).toHaveBeenCalledWith(FEED);
  });

  it('returns null + "not-found" when adapter reports not-found', async () => {
    const port = fakePort({ kind: 'not-found' });
    const resolver = makeResolver({ kind: 'ok', config: FEED });
    const controller = new RegimeController(port, resolver, makeAllowlist());

    const result = await controller.getCurrent(SUPPORTED_POOL);
    expect(result).toEqual({ regime: null, unavailableReason: 'not-found' });
  });

  it('returns null + "config-error" when adapter reports config-error', async () => {
    const port = fakePort({ kind: 'config-error' });
    const resolver = makeResolver({ kind: 'ok', config: FEED });
    const controller = new RegimeController(port, resolver, makeAllowlist());

    const result = await controller.getCurrent(SUPPORTED_POOL);
    expect(result).toEqual({ regime: null, unavailableReason: 'config-error' });
  });

  it('returns null + "upstream-error" when adapter reports upstream-error', async () => {
    const port = fakePort({ kind: 'upstream-error' });
    const resolver = makeResolver({ kind: 'ok', config: FEED });
    const controller = new RegimeController(port, resolver, makeAllowlist());

    const result = await controller.getCurrent(SUPPORTED_POOL);
    expect(result).toEqual({ regime: null, unavailableReason: 'upstream-error' });
  });

  it('short-circuits to "config-error" without calling adapter when feed config is missing', async () => {
    const port = fakePort({ kind: 'block', block: fixtureBlock() });
    const resolver = makeResolver({ kind: 'missing', missing: ['REGIME_ENGINE_SYMBOL'] });
    const controller = new RegimeController(port, resolver, makeAllowlist());

    const result = await controller.getCurrent(SUPPORTED_POOL);
    expect(result).toEqual({ regime: null, unavailableReason: 'config-error' });
    expect(port.fetchCurrent).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --filter @clmm/adapters test -- RegimeController`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the controller**

Create `packages/adapters/src/inbound/http/RegimeController.ts`:

```ts
import { Controller, Get, Inject, NotFoundException, Param } from '@nestjs/common';
import type { RegimeReadPort, RegimeBlock } from '@clmm/application';
import { REGIME_READ_PORT, REGIME_FEED_CONFIG_RESOLVER, REGIME_POOL_ALLOWLIST } from './tokens.js';
import type { RegimeFeedConfigResult } from './RegimeFeedConfig.js';

export type RegimeUnavailableReason = 'not-found' | 'upstream-error' | 'config-error';

export type CurrentRegimeResponse = {
  regime: RegimeBlock | null;
  unavailableReason: RegimeUnavailableReason | null;
};

export interface RegimeFeedConfigResolver {
  resolve(): RegimeFeedConfigResult;
}

@Controller('regime')
export class RegimeController {
  constructor(
    @Inject(REGIME_READ_PORT)
    private readonly regimeReadPort: RegimeReadPort,
    @Inject(REGIME_FEED_CONFIG_RESOLVER)
    private readonly configResolver: RegimeFeedConfigResolver,
    @Inject(REGIME_POOL_ALLOWLIST)
    private readonly allowlist: Set<string>,
  ) {}

  @Get('pools/:poolId/current')
  async getCurrent(@Param('poolId') poolId: string): Promise<CurrentRegimeResponse> {
    if (!this.allowlist.has(poolId)) {
      throw new NotFoundException(`Pool not supported: ${poolId}`);
    }

    const config = this.configResolver.resolve();
    if (config.kind !== 'ok') {
      return { regime: null, unavailableReason: 'config-error' };
    }

    const result = await this.regimeReadPort.fetchCurrent(config.config);
    switch (result.kind) {
      case 'block':
        return { regime: result.block, unavailableReason: null };
      case 'not-found':
        return { regime: null, unavailableReason: 'not-found' };
      case 'config-error':
        return { regime: null, unavailableReason: 'config-error' };
      case 'upstream-error':
        return { regime: null, unavailableReason: 'upstream-error' };
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @clmm/adapters test -- RegimeController`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/inbound/http/RegimeController.ts packages/adapters/src/inbound/http/RegimeController.test.ts
git commit -m "feat(bff): add RegimeController with explicit unavailable mapping"
```

### Task 9: Wire `RegimeController`, adapter, allowlist, and resolver in `AppModule`

**Files:**

- Modify: `packages/adapters/src/inbound/http/AppModule.ts`

- [ ] **Step 1: Add imports**

Open `packages/adapters/src/inbound/http/AppModule.ts`. Add to the top-level import block:

```ts
import { RegimeController } from './RegimeController.js';
import { CurrentRegimeAdapter } from '../../outbound/regime-engine/CurrentRegimeAdapter.js';
import { resolveRegimeFeedConfig } from './RegimeFeedConfig.js';
```

Update the `tokens.js` import to include the three new tokens:

```ts
import {
  TRIGGER_REPOSITORY,
  EXECUTION_REPOSITORY,
  EXECUTION_HISTORY_REPOSITORY,
  EXECUTION_PREPARATION_PORT,
  EXECUTION_SUBMISSION_PORT,
  SUPPORTED_POSITION_READ_PORT,
  SWAP_QUOTE_PORT,
  CLOCK_PORT,
  ID_GENERATOR_PORT,
  MONITORED_WALLET_REPOSITORY,
  WALLET_CHALLENGE_REPOSITORY,
  REGIME_ENGINE_EVENT_PORT,
  CURRENT_SR_LEVELS_PORT,
  OBSERVABILITY_PORT,
  PG_BOSS_INSTANCE,
  RECONCILIATION_JOB_PORT,
  SR_LEVELS_POOL_ALLOWLIST,
  PRICE_PORT,
  SR_LEVELS_READ_PORT,
  INSIGHTS_API_KEY,
  REGIME_READ_PORT,
  REGIME_FEED_CONFIG_RESOLVER,
  REGIME_POOL_ALLOWLIST,
  DB,
} from './tokens.js';
```

- [ ] **Step 2: Construct the regime adapter, allowlist, and resolver**

After the existing `const currentSrLevelsAdapter = new CurrentSrLevelsAdapter(regimeEngineBaseUrl, telemetry);` line, add:

```ts
const currentRegimeAdapter = new CurrentRegimeAdapter(regimeEngineBaseUrl, telemetry);

// Regime allowlist is intentionally separate from SR_LEVELS_POOL_ALLOWLIST_MAP.
// SR uses (symbol, source='mco'); regime requires (symbol, source='geckoterminal')
// plus four other params, all supplied by env. Mixing the two would couple
// upstream sources that are not interchangeable.
export const REGIME_POOL_ALLOWLIST_SET = new Set<string>([
  'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
]);

const regimeFeedConfigResolver = {
  resolve() {
    return resolveRegimeFeedConfig(process.env as Record<string, string | undefined>);
  },
};
```

- [ ] **Step 3: Register the controller and providers**

In the `@Module({...})` decorator, add `RegimeController` to the `controllers` array (alongside `SrLevelsController`). In the `providers` array, add three entries (place them next to the existing SR providers):

```ts
{ provide: REGIME_READ_PORT, useValue: currentRegimeAdapter },
{ provide: REGIME_FEED_CONFIG_RESOLVER, useValue: regimeFeedConfigResolver },
{ provide: REGIME_POOL_ALLOWLIST, useValue: REGIME_POOL_ALLOWLIST_SET },
```

- [ ] **Step 4: Run adapter package tests and typecheck**

Run: `pnpm --filter @clmm/adapters typecheck && pnpm --filter @clmm/adapters test`
Expected: PASS.

- [ ] **Step 5: Run the boundaries check**

Run: `pnpm boundaries`
Expected: PASS — no new forbidden imports.

- [ ] **Step 6: Commit**

```bash
git add packages/adapters/src/inbound/http/AppModule.ts
git commit -m "feat(bff): register regime controller, adapter, allowlist, and config resolver"
```

### Task 10: Add an allowlist parity test for the regime route

**Files:**

- Create: `packages/adapters/src/inbound/http/RegimeAllowlist.test.ts`

- [ ] **Step 1: Write the test**

Create `packages/adapters/src/inbound/http/RegimeAllowlist.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makePoolId } from '@clmm/domain';
import { REGIME_POOL_ALLOWLIST_SET } from './AppModule.js';

const ORCA_SOL_USDC_004_WHIRLPOOL = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';

describe('REGIME_POOL_ALLOWLIST_SET production wiring', () => {
  it('has at least one entry so the regime route is active in production', () => {
    expect(REGIME_POOL_ALLOWLIST_SET.size).toBeGreaterThan(0);
  });

  it('contains the Orca SOL/USDC 0.04% whirlpool pool id', () => {
    const poolId = makePoolId(ORCA_SOL_USDC_004_WHIRLPOOL);
    expect(REGIME_POOL_ALLOWLIST_SET.has(poolId)).toBe(true);
  });

  it('uses valid Solana base58 public keys (32-44 chars)', () => {
    const base58 = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;
    for (const poolId of REGIME_POOL_ALLOWLIST_SET) {
      expect(poolId.length).toBeGreaterThanOrEqual(32);
      expect(poolId.length).toBeLessThanOrEqual(44);
      expect(base58.test(poolId)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm --filter @clmm/adapters test -- RegimeAllowlist`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/adapters/src/inbound/http/RegimeAllowlist.test.ts
git commit -m "test(bff): regime allowlist contains the supported SOL/USDC pool"
```

---

## Phase 6 — App API Client

### Task 11: Implement `apps/app/src/api/regime.ts`

**Files:**

- Create: `apps/app/src/api/regime.ts`
- Create: `apps/app/src/api/regime.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/app/src/api/regime.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchCurrentRegime,
  RegimeUnsupportedPoolError,
  isRegimeUnsupportedPoolError,
} from './regime';

type ExpoPublicEnv = NodeJS.ProcessEnv & { EXPO_PUBLIC_BFF_BASE_URL?: string };
const ORIGINAL_FETCH = globalThis.fetch;
const env = process.env as ExpoPublicEnv;
const ORIGINAL_BFF = env.EXPO_PUBLIC_BFF_BASE_URL;

function restoreEnv(): void {
  if (ORIGINAL_BFF == null) {
    delete env.EXPO_PUBLIC_BFF_BASE_URL;
  } else {
    env.EXPO_PUBLIC_BFF_BASE_URL = ORIGINAL_BFF;
  }
}

function block() {
  return {
    regime: 'UP',
    trendStrength: 0.6,
    volRatio: 1.05,
    clmmSuitability: { status: 'ALLOWED', reasons: [] },
    marketReasons: [],
    freshness: { capturedAtUnixMs: 1_745_712_000_000, softStale: false, hardStale: false },
  };
}

describe('fetchCurrentRegime', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    restoreEnv();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns { regime, unavailableReason: null } on a populated 200', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ regime: block(), unavailableReason: null }),
    }) as typeof fetch;

    const result = await fetchCurrentRegime('Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE');
    expect(result.regime?.regime).toBe('UP');
    expect(result.unavailableReason).toBeNull();
  });

  it('returns { regime: null, unavailableReason } for each documented BFF reason', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    for (const reason of ['not-found', 'upstream-error', 'config-error'] as const) {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ regime: null, unavailableReason: reason }),
      }) as typeof fetch;
      const result = await fetchCurrentRegime('Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE');
      expect(result).toEqual({ regime: null, unavailableReason: reason });
    }
  });

  it('throws RegimeUnsupportedPoolError on 404', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ message: 'Pool not supported: BadPool' }),
      text: () => Promise.resolve(''),
    }) as typeof fetch;

    await expect(fetchCurrentRegime('BadPool')).rejects.toBeInstanceOf(RegimeUnsupportedPoolError);
  });

  it('isRegimeUnsupportedPoolError narrows correctly', () => {
    expect(isRegimeUnsupportedPoolError(new RegimeUnsupportedPoolError('p'))).toBe(true);
    expect(isRegimeUnsupportedPoolError(new Error('other'))).toBe(false);
  });

  it('rejects malformed body shape', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ regime: { regime: 'INVALID' } }),
    }) as typeof fetch;
    await expect(
      fetchCurrentRegime('Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE'),
    ).rejects.toThrow(/malformed/i);
  });

  it('rejects when unavailableReason is an unknown string', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ regime: null, unavailableReason: 'not-a-reason' }),
    }) as typeof fetch;
    await expect(
      fetchCurrentRegime('Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE'),
    ).rejects.toThrow(/malformed/i);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm --filter app test -- regime`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the client**

Create `apps/app/src/api/regime.ts`:

```ts
import type {
  RegimeBlock,
  RegimeReason,
  RegimeReasonSeverity,
  ClmmSuitabilityStatus,
  MarketRegime,
} from '@clmm/application/public';
import { getBffBaseUrl } from './http';

export type RegimeUnavailableReason = 'not-found' | 'upstream-error' | 'config-error';

export type CurrentRegimeResponse = {
  regime: RegimeBlock | null;
  unavailableReason: RegimeUnavailableReason | null;
};

export class RegimeUnsupportedPoolError extends Error {
  constructor(poolId: string) {
    super(`Regime not available: pool ${poolId} is not supported`);
    this.name = 'RegimeUnsupportedPoolError';
  }
}

export function isRegimeUnsupportedPoolError(error: unknown): error is RegimeUnsupportedPoolError {
  return error instanceof RegimeUnsupportedPoolError;
}

const FETCH_TIMEOUT_MS = 10_000;
const VALID_REASONS: ReadonlySet<RegimeUnavailableReason> = new Set([
  'not-found',
  'upstream-error',
  'config-error',
]);
const VALID_REGIMES: ReadonlySet<MarketRegime> = new Set(['UP', 'DOWN', 'CHOP']);
const VALID_STATUSES: ReadonlySet<ClmmSuitabilityStatus> = new Set([
  'ALLOWED',
  'CAUTION',
  'BLOCKED',
  'UNKNOWN',
]);
const VALID_SEVERITIES: ReadonlySet<RegimeReasonSeverity> = new Set(['ERROR', 'WARN', 'INFO']);

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string }).name === 'AbortError'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isReasonArray(value: unknown): value is RegimeReason[] {
  if (!Array.isArray(value)) return false;
  return value.every((item) => {
    if (!isRecord(item)) return false;
    if (typeof item['severity'] !== 'string') return false;
    if (!VALID_SEVERITIES.has(item['severity'] as RegimeReasonSeverity)) return false;
    if (typeof item['text'] !== 'string') return false;
    if (item['code'] != null && typeof item['code'] !== 'string') return false;
    return true;
  });
}

function isRegimeBlock(value: unknown): value is RegimeBlock {
  if (!isRecord(value)) return false;
  if (typeof value['regime'] !== 'string' || !VALID_REGIMES.has(value['regime'] as MarketRegime)) {
    return false;
  }
  if (typeof value['trendStrength'] !== 'number' || !Number.isFinite(value['trendStrength'])) {
    return false;
  }
  if (typeof value['volRatio'] !== 'number' || !Number.isFinite(value['volRatio'])) return false;
  const suit = value['clmmSuitability'];
  if (!isRecord(suit)) return false;
  if (
    typeof suit['status'] !== 'string' ||
    !VALID_STATUSES.has(suit['status'] as ClmmSuitabilityStatus)
  ) {
    return false;
  }
  if (!isReasonArray(suit['reasons'])) return false;
  if (!isReasonArray(value['marketReasons'])) return false;
  const fresh = value['freshness'];
  if (!isRecord(fresh)) return false;
  if (
    typeof fresh['capturedAtUnixMs'] !== 'number' ||
    !Number.isFinite(fresh['capturedAtUnixMs'])
  ) {
    return false;
  }
  if (typeof fresh['softStale'] !== 'boolean' || typeof fresh['hardStale'] !== 'boolean') {
    return false;
  }
  return true;
}

async function classify404(poolId: string, response: Response): Promise<Error> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return new Error('Could not load market regime: unexpected 404');
  }
  if (
    isRecord(body) &&
    typeof body['message'] === 'string' &&
    body['message'].includes('not supported')
  ) {
    return new RegimeUnsupportedPoolError(poolId);
  }
  return new Error('Could not load market regime: endpoint not found');
}

export async function fetchCurrentRegime(poolId: string): Promise<CurrentRegimeResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(
      `${getBffBaseUrl()}/regime/pools/${encodeURIComponent(poolId)}/current`,
      { signal: controller.signal },
    );
  } catch (error: unknown) {
    if (isAbortError(error)) {
      throw new Error('Could not load market regime: request timed out');
    }
    throw new Error(
      `Could not load market regime: ${error instanceof Error ? error.message : 'network error'}`,
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 404) {
    throw await classify404(poolId, response);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => `HTTP ${response.status}`);
    throw new Error(`Could not load market regime: ${detail || response.statusText}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error('Could not load market regime: response body was not valid JSON');
  }

  if (!isRecord(body)) {
    throw new Error('Could not load market regime: malformed response');
  }

  const reason = body['unavailableReason'];
  const regime = body['regime'];

  if (regime === null) {
    if (typeof reason !== 'string' || !VALID_REASONS.has(reason as RegimeUnavailableReason)) {
      throw new Error('Could not load market regime: malformed unavailableReason');
    }
    return { regime: null, unavailableReason: reason as RegimeUnavailableReason };
  }

  if (!isRegimeBlock(regime)) {
    throw new Error('Could not load market regime: malformed regime block');
  }

  if (reason !== null && reason !== undefined) {
    throw new Error(
      'Could not load market regime: unavailableReason must be null when regime is present',
    );
  }

  return { regime, unavailableReason: null };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter app test -- regime`
Expected: PASS.

- [ ] **Step 5: Run typecheck and lint**

Run: `pnpm --filter app typecheck && pnpm --filter app lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/api/regime.ts apps/app/src/api/regime.test.ts
git commit -m "feat(app): add regime BFF client with explicit unavailable mapping"
```

---

## Phase 7 — UI: View-Model

### Task 12: Implement `RegimeViewModel`

**Files:**

- Create: `packages/ui/src/view-models/RegimeViewModel.ts`
- Create: `packages/ui/src/view-models/RegimeViewModel.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/src/view-models/RegimeViewModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { RegimeBlock } from '@clmm/application/public';
import { buildRegimeViewModel } from './RegimeViewModel.js';

function block(overrides: Partial<RegimeBlock> = {}): RegimeBlock {
  return {
    regime: 'UP',
    trendStrength: 0.62,
    volRatio: 1.08,
    clmmSuitability: {
      status: 'CAUTION',
      reasons: [
        { severity: 'INFO', text: 'first info' },
        { severity: 'ERROR', text: 'top error' },
        { severity: 'WARN', text: 'middle warn' },
        { severity: 'ERROR', text: 'second error' },
      ],
    },
    marketReasons: [
      { severity: 'WARN', text: 'first warn' },
      { severity: 'WARN', text: 'second warn' },
      { severity: 'INFO', text: 'first info' },
    ],
    freshness: { capturedAtUnixMs: 1_745_712_000_000, softStale: false, hardStale: false },
    ...overrides,
  };
}

describe('buildRegimeViewModel', () => {
  it('selects the highest-severity suitability reason; preserves source order on ties', () => {
    const vm = buildRegimeViewModel(block(), block().freshness.capturedAtUnixMs + 5 * 60_000);
    // Top error appears at index 1; source order tie-breaks among ERRORs.
    expect(vm.topSuitabilityReason?.text).toBe('top error');
  });

  it('selects the highest-severity market reason; falls back to first WARN if no ERROR', () => {
    const vm = buildRegimeViewModel(block(), block().freshness.capturedAtUnixMs + 5 * 60_000);
    expect(vm.topMarketReason?.text).toBe('first warn');
  });

  it('returns null top reasons when reason arrays are empty', () => {
    const empty = block({
      clmmSuitability: { status: 'ALLOWED', reasons: [] },
      marketReasons: [],
    });
    const vm = buildRegimeViewModel(empty, empty.freshness.capturedAtUnixMs + 60_000);
    expect(vm.topSuitabilityReason).toBeNull();
    expect(vm.topMarketReason).toBeNull();
  });

  it('formats freshness as relative time and reflects staleness', () => {
    const fresh = block({
      freshness: { capturedAtUnixMs: 1_000_000, softStale: false, hardStale: false },
    });
    const vmFresh = buildRegimeViewModel(fresh, fresh.freshness.capturedAtUnixMs + 5 * 60_000);
    expect(vmFresh.freshnessLabel).toMatch(/5m ago/);
    expect(vmFresh.isStale).toBe(false);

    const soft = block({
      freshness: { capturedAtUnixMs: 1_000_000, softStale: true, hardStale: false },
    });
    const vmSoft = buildRegimeViewModel(soft, soft.freshness.capturedAtUnixMs + 60 * 60_000);
    expect(vmSoft.isStale).toBe(true);

    const hard = block({
      freshness: { capturedAtUnixMs: 1_000_000, softStale: false, hardStale: true },
    });
    const vmHard = buildRegimeViewModel(hard, hard.freshness.capturedAtUnixMs + 4 * 60 * 60_000);
    expect(vmHard.isStale).toBe(true);
  });

  it('maps regime to a tone for the badge', () => {
    expect(buildRegimeViewModel(block({ regime: 'UP' }), Date.now()).regimeBadge.tone).toBe('safe');
    expect(buildRegimeViewModel(block({ regime: 'DOWN' }), Date.now()).regimeBadge.tone).toBe(
      'breach',
    );
    expect(buildRegimeViewModel(block({ regime: 'CHOP' }), Date.now()).regimeBadge.tone).toBe(
      'warn',
    );
  });

  it('maps clmm suitability status to a tone for the badge', () => {
    const allowed = buildRegimeViewModel(
      block({ clmmSuitability: { status: 'ALLOWED', reasons: [] } }),
      Date.now(),
    );
    expect(allowed.suitabilityBadge.tone).toBe('safe');

    const caution = buildRegimeViewModel(
      block({ clmmSuitability: { status: 'CAUTION', reasons: [] } }),
      Date.now(),
    );
    expect(caution.suitabilityBadge.tone).toBe('warn');

    const blocked = buildRegimeViewModel(
      block({ clmmSuitability: { status: 'BLOCKED', reasons: [] } }),
      Date.now(),
    );
    expect(blocked.suitabilityBadge.tone).toBe('breach');

    const unknown = buildRegimeViewModel(
      block({ clmmSuitability: { status: 'UNKNOWN', reasons: [] } }),
      Date.now(),
    );
    expect(unknown.suitabilityBadge.tone).toBe('muted');
  });

  it('formats trendStrength and volRatio as fixed-precision strings', () => {
    const vm = buildRegimeViewModel(
      block({ trendStrength: 0.6234, volRatio: 1.0789 }),
      block().freshness.capturedAtUnixMs + 60_000,
    );
    expect(vm.trendStrengthLabel).toBe('0.62');
    expect(vm.volRatioLabel).toBe('1.08');
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm --filter @clmm/ui test -- RegimeViewModel`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the view-model**

Create `packages/ui/src/view-models/RegimeViewModel.ts`:

```ts
import type {
  RegimeBlock,
  RegimeReason,
  RegimeReasonSeverity,
  MarketRegime,
  ClmmSuitabilityStatus,
} from '@clmm/application/public';

export type RegimeBadgeTone = 'safe' | 'warn' | 'breach' | 'muted';

export type RegimeBadgeViewModel = {
  label: string;
  tone: RegimeBadgeTone;
};

export type RegimeReasonViewModel = {
  severity: RegimeReasonSeverity;
  text: string;
};

export type RegimeViewModel = {
  regimeBadge: RegimeBadgeViewModel;
  suitabilityBadge: RegimeBadgeViewModel;
  topSuitabilityReason: RegimeReasonViewModel | null;
  topMarketReason: RegimeReasonViewModel | null;
  trendStrengthLabel: string;
  volRatioLabel: string;
  freshnessLabel: string;
  isStale: boolean;
};

const SEVERITY_RANK: Record<RegimeReasonSeverity, number> = { ERROR: 3, WARN: 2, INFO: 1 };

const REGIME_TONE: Record<MarketRegime, RegimeBadgeTone> = {
  UP: 'safe',
  DOWN: 'breach',
  CHOP: 'warn',
};

const STATUS_TONE: Record<ClmmSuitabilityStatus, RegimeBadgeTone> = {
  ALLOWED: 'safe',
  CAUTION: 'warn',
  BLOCKED: 'breach',
  UNKNOWN: 'muted',
};

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;

function selectTopReason(reasons: ReadonlyArray<RegimeReason>): RegimeReasonViewModel | null {
  if (reasons.length === 0) return null;
  let bestIndex = 0;
  let bestRank = SEVERITY_RANK[reasons[0]!.severity];
  for (let i = 1; i < reasons.length; i++) {
    const rank = SEVERITY_RANK[reasons[i]!.severity];
    if (rank > bestRank) {
      bestRank = rank;
      bestIndex = i;
    }
    // ties preserve the earlier source-order index (already lower)
  }
  const top = reasons[bestIndex]!;
  return { severity: top.severity, text: top.text };
}

function formatFreshness(
  capturedAtUnixMs: number,
  now: number,
  softStale: boolean,
  hardStale: boolean,
): { freshnessLabel: string; isStale: boolean } {
  const ageMs = Math.max(0, now - capturedAtUnixMs);
  let label: string;
  if (ageMs < MS_PER_HOUR) {
    const minutes = Math.max(1, Math.round(ageMs / MS_PER_MINUTE));
    label = `${minutes}m ago`;
  } else {
    const hours = Math.round(ageMs / MS_PER_HOUR);
    label = `${hours}h ago`;
  }
  const isStale = softStale || hardStale;
  if (isStale) label += ' · stale';
  return { freshnessLabel: label, isStale };
}

export function buildRegimeViewModel(block: RegimeBlock, now: number): RegimeViewModel {
  const { freshnessLabel, isStale } = formatFreshness(
    block.freshness.capturedAtUnixMs,
    now,
    block.freshness.softStale,
    block.freshness.hardStale,
  );

  return {
    regimeBadge: { label: block.regime, tone: REGIME_TONE[block.regime] },
    suitabilityBadge: {
      label: block.clmmSuitability.status,
      tone: STATUS_TONE[block.clmmSuitability.status],
    },
    topSuitabilityReason: selectTopReason(block.clmmSuitability.reasons),
    topMarketReason: selectTopReason(block.marketReasons),
    trendStrengthLabel: block.trendStrength.toFixed(2),
    volRatioLabel: block.volRatio.toFixed(2),
    freshnessLabel,
    isStale,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @clmm/ui test -- RegimeViewModel`
Expected: PASS for every case.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/view-models/RegimeViewModel.ts packages/ui/src/view-models/RegimeViewModel.test.ts
git commit -m "feat(ui): add buildRegimeViewModel with severity-sorted top reasons"
```

---

## Phase 8 — UI: Rename `MarketContextPanel` to `SrInsightsSection`

### Task 13: Rename component file and test file

**Files:**

- Move (rename + edit): `packages/ui/src/components/MarketContextPanel.tsx` → `packages/ui/src/components/SrInsightsSection.tsx`
- Move (rename + edit): `packages/ui/src/components/MarketContextPanel.test.tsx` → `packages/ui/src/components/SrInsightsSection.test.tsx`
- Modify: `packages/ui/src/screens/PositionsListScreen.tsx`

- [ ] **Step 1: Rename via git mv**

Run:

```bash
git mv packages/ui/src/components/MarketContextPanel.tsx packages/ui/src/components/SrInsightsSection.tsx
git mv packages/ui/src/components/MarketContextPanel.test.tsx packages/ui/src/components/SrInsightsSection.test.tsx
```

- [ ] **Step 2: Replace the component name inside the renamed source**

Edit `packages/ui/src/components/SrInsightsSection.tsx`. Change the function name on the `export function MarketContextPanel({` line to `export function SrInsightsSection({`. The body is unchanged.

- [ ] **Step 3: Replace usages in the renamed test**

Edit `packages/ui/src/components/SrInsightsSection.test.tsx`. Replace every `MarketContextPanel` literal with `SrInsightsSection` (component import, JSX usages, and the `describe('MarketContextPanel', ...)` label).

- [ ] **Step 4: Update `PositionsListScreen` import and usage**

Edit `packages/ui/src/screens/PositionsListScreen.tsx`. Change the import:

```ts
import { SrInsightsSection } from '../components/SrInsightsSection.js';
```

Replace the single `<MarketContextPanel ... />` JSX usage in the `ListFooterComponent` with `<SrInsightsSection ... />` (props unchanged for now — they are wired up in Task 16).

- [ ] **Step 5: Run UI tests to verify nothing else referenced the old name**

Run: `pnpm --filter @clmm/ui test`
Expected: PASS. If a test file or barrel import references `MarketContextPanel`, fix it now (the file is intentionally not exported via the public barrel — see `packages/ui/src/index.ts` — so there should be no re-export to update).

- [ ] **Step 6: Run typecheck and boundaries**

Run: `pnpm --filter @clmm/ui typecheck && pnpm boundaries`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/components/SrInsightsSection.tsx packages/ui/src/components/SrInsightsSection.test.tsx packages/ui/src/screens/PositionsListScreen.tsx
git commit -m "refactor(ui): rename MarketContextPanel to SrInsightsSection"
```

---

## Phase 9 — UI: `RegimeSection`

### Task 14: Implement `RegimeSection` component

**Files:**

- Create: `packages/ui/src/components/RegimeSection.tsx`
- Create: `packages/ui/src/components/RegimeSection.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/src/components/RegimeSection.test.tsx`:

```tsx
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { RegimeBlock } from '@clmm/application/public';
import { RegimeSection } from './RegimeSection.js';

afterEach(() => cleanup());

function fixture(): RegimeBlock {
  return {
    regime: 'UP',
    trendStrength: 0.62,
    volRatio: 1.08,
    clmmSuitability: {
      status: 'CAUTION',
      reasons: [
        { severity: 'WARN', text: 'Spread widening' },
        { severity: 'ERROR', text: 'Vol spike beyond bound' },
      ],
    },
    marketReasons: [{ severity: 'INFO', text: 'Trend constructive' }],
    freshness: { capturedAtUnixMs: 1_745_712_000_000, softStale: false, hardStale: false },
  };
}

describe('RegimeSection', () => {
  it('renders nothing when isMixedPools (positions list shows S/R mixed message instead)', () => {
    const { container } = render(
      <RegimeSection
        regime={undefined}
        unavailableReason={null}
        isLoading={false}
        isUnsupported={false}
        isMixedPools
        now={1_745_712_000_000}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the loading skeleton when loading without cached data', () => {
    render(
      <RegimeSection
        regime={undefined}
        unavailableReason={null}
        isLoading
        isUnsupported={false}
        isMixedPools={false}
        now={1_745_712_000_000}
      />,
    );
    expect(screen.getByTestId('regime-section-skeleton')).toBeTruthy();
  });

  it('renders "Market data not available yet" when unavailableReason is not-found', () => {
    render(
      <RegimeSection
        regime={null}
        unavailableReason="not-found"
        isLoading={false}
        isUnsupported={false}
        isMixedPools={false}
        now={1_745_712_000_000}
      />,
    );
    expect(screen.getByText('Market data not available yet')).toBeTruthy();
  });

  it('renders "Market context unavailable" for upstream-error and config-error', () => {
    for (const reason of ['upstream-error', 'config-error'] as const) {
      cleanup();
      render(
        <RegimeSection
          regime={null}
          unavailableReason={reason}
          isLoading={false}
          isUnsupported={false}
          isMixedPools={false}
          now={1_745_712_000_000}
        />,
      );
      expect(screen.getByText('Market context unavailable')).toBeTruthy();
    }
  });

  it('renders "Market context unavailable" when isUnsupported regardless of regime/reason', () => {
    render(
      <RegimeSection
        regime={undefined}
        unavailableReason={null}
        isLoading={false}
        isUnsupported
        isMixedPools={false}
        now={1_745_712_000_000}
      />,
    );
    expect(screen.getByText('Market context unavailable')).toBeTruthy();
  });

  it('renders badges, top reasons, telemetry, and freshness when block is present', () => {
    const block = fixture();
    render(
      <RegimeSection
        regime={block}
        unavailableReason={null}
        isLoading={false}
        isUnsupported={false}
        isMixedPools={false}
        now={block.freshness.capturedAtUnixMs + 5 * 60_000}
      />,
    );
    expect(screen.getByText('UP')).toBeTruthy();
    expect(screen.getByText('CAUTION')).toBeTruthy();
    expect(screen.getByText('Vol spike beyond bound')).toBeTruthy();
    expect(screen.getByText('Trend constructive')).toBeTruthy();
    expect(screen.getByText(/5m ago/)).toBeTruthy();
    expect(screen.getByText('0.62')).toBeTruthy();
    expect(screen.getByText('1.08')).toBeTruthy();
  });

  it('renders nothing when fully idle (no regime, no reason, not loading, not errored)', () => {
    const { container } = render(
      <RegimeSection
        regime={undefined}
        unavailableReason={null}
        isLoading={false}
        isUnsupported={false}
        isMixedPools={false}
        now={1_745_712_000_000}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run: `pnpm --filter @clmm/ui test -- RegimeSection`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `packages/ui/src/components/RegimeSection.tsx`:

```tsx
import { View, Text, ActivityIndicator } from 'react-native';
import type { RegimeBlock } from '@clmm/application/public';
import { colors, typography } from '../design-system/index.js';
import { buildRegimeViewModel, type RegimeBadgeTone } from '../view-models/RegimeViewModel.js';

export type RegimeUnavailableReason = 'not-found' | 'upstream-error' | 'config-error';

type Props = {
  regime: RegimeBlock | null | undefined;
  unavailableReason: RegimeUnavailableReason | null;
  isLoading: boolean;
  isUnsupported: boolean;
  isMixedPools: boolean;
  now: number;
};

const TONE_TEXT: Record<RegimeBadgeTone, string> = {
  safe: colors.safe,
  warn: colors.warn,
  breach: colors.breachAccent,
  muted: colors.textSecondary,
};

const TONE_BORDER: Record<RegimeBadgeTone, string> = {
  safe: 'rgba(158,236,209,0.30)',
  warn: 'rgba(244,201,122,0.30)',
  breach: 'rgba(245,148,132,0.30)',
  muted: colors.borderLight,
};

const TONE_BG: Record<RegimeBadgeTone, string> = {
  safe: 'rgba(158,236,209,0.08)',
  warn: 'rgba(244,201,122,0.08)',
  breach: 'rgba(245,148,132,0.08)',
  muted: 'rgba(148,163,184,0.06)',
};

function unavailableCopy(reason: RegimeUnavailableReason): string {
  return reason === 'not-found' ? 'Market data not available yet' : 'Market context unavailable';
}

function CompactUnavailable({ message }: { message: string }) {
  return (
    <View
      style={{
        marginHorizontal: 16,
        marginTop: 14,
        padding: 16,
        backgroundColor: colors.surface,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
        {message}
      </Text>
    </View>
  );
}

function Badge({ label, tone }: { label: string; tone: RegimeBadgeTone }) {
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: TONE_BORDER[tone],
        backgroundColor: TONE_BG[tone],
        alignSelf: 'flex-start',
      }}
    >
      <Text
        style={{
          color: TONE_TEXT[tone],
          fontSize: typography.fontSize.micro,
          fontWeight: typography.fontWeight.semibold,
          letterSpacing: 0.08,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export function RegimeSection({
  regime,
  unavailableReason,
  isLoading,
  isUnsupported,
  isMixedPools,
  now,
}: Props): JSX.Element | null {
  if (isMixedPools) {
    return null;
  }

  if (isUnsupported) {
    return <CompactUnavailable message="Market context unavailable" />;
  }

  if (isLoading && regime == null && unavailableReason == null) {
    return (
      <View
        testID="regime-section-skeleton"
        style={{
          marginHorizontal: 16,
          marginTop: 14,
          padding: 16,
          backgroundColor: colors.surface,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
        }}
      >
        <ActivityIndicator color={colors.safe} />
      </View>
    );
  }

  if (regime == null) {
    if (unavailableReason == null) {
      return null; // fully idle
    }
    return <CompactUnavailable message={unavailableCopy(unavailableReason)} />;
  }

  const vm = buildRegimeViewModel(regime, now);

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginTop: 14,
        padding: 16,
        backgroundColor: colors.surface,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Badge label={vm.regimeBadge.label} tone={vm.regimeBadge.tone} />
        <Badge label={vm.suitabilityBadge.label} tone={vm.suitabilityBadge.tone} />
      </View>

      {vm.topSuitabilityReason ? (
        <Text style={{ color: colors.textPrimary, fontSize: typography.fontSize.sm }}>
          {vm.topSuitabilityReason.text}
        </Text>
      ) : null}
      {vm.topMarketReason ? (
        <Text style={{ color: colors.textBody, fontSize: typography.fontSize.sm }}>
          {vm.topMarketReason.text}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 16 }}>
        <View>
          <Text style={{ color: colors.textTertiary, fontSize: typography.fontSize.micro }}>
            Trend
          </Text>
          <Text style={{ color: colors.textPrimary, fontSize: typography.fontSize.sm }}>
            {vm.trendStrengthLabel}
          </Text>
        </View>
        <View>
          <Text style={{ color: colors.textTertiary, fontSize: typography.fontSize.micro }}>
            Vol ratio
          </Text>
          <Text style={{ color: colors.textPrimary, fontSize: typography.fontSize.sm }}>
            {vm.volRatioLabel}
          </Text>
        </View>
      </View>

      <Text
        style={{
          color: vm.isStale ? colors.warn : colors.textTertiary,
          fontSize: typography.fontSize.xs,
        }}
      >
        {vm.freshnessLabel}
      </Text>
    </View>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @clmm/ui test -- RegimeSection`
Expected: PASS for every case.

- [ ] **Step 5: Run typecheck**

Run: `pnpm --filter @clmm/ui typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/RegimeSection.tsx packages/ui/src/components/RegimeSection.test.tsx
git commit -m "feat(ui): add RegimeSection with badges, top reasons, and unavailable copy"
```

---

## Phase 10 — UI: Compose into `PositionsListScreen`

### Task 15: Add regime props to `PositionsListScreen` and render `RegimeSection` below `SrInsightsSection`

**Files:**

- Modify: `packages/ui/src/screens/PositionsListScreen.tsx`
- Modify: `packages/ui/src/screens/PositionsListScreen.test.tsx`

- [ ] **Step 1: Write the failing screen-level tests**

Edit `packages/ui/src/screens/PositionsListScreen.test.tsx`. After the existing `srLevels`/`isMixedPools` cases, append a new sub-`describe` block:

```tsx
describe('PositionsListScreen — regime section', () => {
  function fixtureBlock() {
    return {
      regime: 'UP' as const,
      trendStrength: 0.6,
      volRatio: 1.05,
      clmmSuitability: { status: 'ALLOWED' as const, reasons: [] },
      marketReasons: [],
      freshness: { capturedAtUnixMs: 1_745_712_000_000, softStale: false, hardStale: false },
    };
  }

  it('renders the regime section below the SR insights section', () => {
    const { container } = render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[makePosition()]}
        srLevels={{
          briefId: 'b',
          sourceRecordedAtIso: null,
          summary: 'Bullish',
          capturedAtUnixMs: 1_745_712_000_000,
          supports: [{ price: 100 }],
          resistances: [{ price: 200 }],
        }}
        regime={fixtureBlock()}
        regimeUnavailableReason={null}
        now={1_745_712_000_000 + 5 * 60_000}
      />,
    );
    const text = container.textContent ?? '';
    const sIndex = text.indexOf('Support & Resistance');
    const rIndex = text.indexOf('UP');
    expect(sIndex).toBeGreaterThan(-1);
    expect(rIndex).toBeGreaterThan(sIndex);
  });

  it('renders SR insights even when regime is fully unavailable', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[makePosition()]}
        srLevels={{
          briefId: 'b',
          sourceRecordedAtIso: null,
          summary: 'Bullish',
          capturedAtUnixMs: 1_745_712_000_000,
          supports: [{ price: 100 }],
          resistances: [{ price: 200 }],
        }}
        regime={null}
        regimeUnavailableReason="upstream-error"
        now={1_745_712_000_000 + 5 * 60_000}
      />,
    );
    expect(screen.getByText('Support & Resistance')).toBeTruthy();
    expect(screen.getByText('Market context unavailable')).toBeTruthy();
  });

  it('renders the regime section even when SR insights is unsupported', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[makePosition()]}
        srLevelsUnsupported
        regime={fixtureBlock()}
        regimeUnavailableReason={null}
        now={fixtureBlock().freshness.capturedAtUnixMs + 5 * 60_000}
      />,
    );
    expect(screen.getByText('UP')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run: `pnpm --filter @clmm/ui test -- PositionsListScreen`
Expected: FAIL — `regime` and `regimeUnavailableReason` are unknown props.

- [ ] **Step 3: Add regime props and render `RegimeSection`**

Edit `packages/ui/src/screens/PositionsListScreen.tsx`.

In the import block, add:

```ts
import { RegimeSection, type RegimeUnavailableReason } from '../components/RegimeSection.js';
import type { RegimeBlock } from '@clmm/application/public';
```

Extend the top-level `Props` type:

```ts
type Props = {
  walletAddress?: string | null;
  positions?: PositionSummaryDto[] | undefined;
  positionsLoading?: boolean;
  positionsError?: string | null;
  positionsWarning?: string | null;
  onSelectPosition?: (positionId: string) => void;
  onConnectWallet?: () => void;
  platformCapabilities?: PlatformCapabilities | null;
  srLevels?: SrLevelsBlock | null | undefined;
  srLevelsLoading?: boolean | undefined;
  srLevelsError?: boolean | undefined;
  srLevelsUnsupported?: boolean | undefined;
  regime?: RegimeBlock | null | undefined;
  regimeUnavailableReason?: RegimeUnavailableReason | null | undefined;
  regimeLoading?: boolean | undefined;
  regimeUnsupported?: boolean | undefined;
  isMixedPools?: boolean | undefined;
  poolLabel?: string | null | undefined;
  now?: number | undefined;
};
```

In the `PositionsListScreen({ ... })` destructure, add the four new props (`regime`, `regimeUnavailableReason`, `regimeLoading`, `regimeUnsupported`).

In the `<ConnectedPositionsList ... />` JSX inside `PositionsListScreen`, forward the new props down:

```tsx
<ConnectedPositionsList
  positions={positions ?? []}
  {...(onSelectPosition != null ? { onSelectPosition } : {})}
  srLevels={srLevels}
  srLevelsLoading={srLevelsLoading}
  srLevelsError={srLevelsError}
  srLevelsUnsupported={srLevelsUnsupported}
  regime={regime}
  regimeUnavailableReason={regimeUnavailableReason ?? null}
  regimeLoading={regimeLoading ?? false}
  regimeUnsupported={regimeUnsupported ?? false}
  isMixedPools={isMixedPools ?? false}
  poolLabel={poolLabel ?? null}
  now={now}
/>
```

In the `ConnectedPositionsList` inner function, accept and use the props. Replace the `ListFooterComponent` JSX so it renders S/R first then regime:

```tsx
ListFooterComponent={
  <View>
    <SrInsightsSection
      srLevels={srLevels}
      isLoading={srLevelsLoading ?? false}
      isError={srLevelsError ?? false}
      isUnsupported={srLevelsUnsupported ?? false}
      isMixedPools={isMixedPools}
      poolLabel={poolLabel}
      now={now ?? Date.now()}
    />
    <RegimeSection
      regime={regime}
      unavailableReason={regimeUnavailableReason ?? null}
      isLoading={regimeLoading ?? false}
      isUnsupported={regimeUnsupported ?? false}
      isMixedPools={isMixedPools}
      now={now ?? Date.now()}
    />
  </View>
}
```

Update `ConnectedPositionsList`'s prop type to include the four regime props (`regime`, `regimeUnavailableReason`, `regimeLoading`, `regimeUnsupported`). The boolean defaults match the parent.

Add the `View` import to the existing `react-native` import line if not already present.

- [ ] **Step 4: Run the screen tests to verify they pass**

Run: `pnpm --filter @clmm/ui test -- PositionsListScreen`
Expected: PASS for every regime case plus all pre-existing cases.

- [ ] **Step 5: Run all UI tests + typecheck + boundaries**

Run: `pnpm --filter @clmm/ui test && pnpm --filter @clmm/ui typecheck && pnpm boundaries`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/screens/PositionsListScreen.tsx packages/ui/src/screens/PositionsListScreen.test.tsx
git commit -m "feat(ui): render RegimeSection below SrInsightsSection in positions footer"
```

---

## Phase 11 — App Route Wiring

### Task 16: Add the regime `useQuery` to the positions route

**Files:**

- Modify: `apps/app/app/(tabs)/positions.tsx`

- [ ] **Step 1: Add the import block**

Open `apps/app/app/(tabs)/positions.tsx`. Add to the existing imports:

```ts
import { fetchCurrentRegime, RegimeUnsupportedPoolError } from '../../src/api/regime';
```

- [ ] **Step 2: Add a constant for the regime stale time**

Add near the existing `SR_LEVELS_STALE_TIME_MS` constant:

```ts
const REGIME_STALE_TIME_MS = 5 * 60 * 1000;
```

- [ ] **Step 3: Add a non-blocking `useQuery` for regime, beside the SR query**

Inside `PositionsRoute`, after the existing `srLevelsQuery` declaration, add:

```ts
const regimeQuery = useQuery({
  queryKey: ['regime-current', poolId],
  queryFn: () => fetchCurrentRegime(poolId!),
  enabled: poolId != null,
  staleTime: REGIME_STALE_TIME_MS,
  refetchOnWindowFocus: false,
  refetchOnMount: true,
  retry: (failureCount, error) =>
    !(error instanceof RegimeUnsupportedPoolError) && failureCount < 1,
  retryDelay: 1000,
});

const regimeUnsupported = regimeQuery.error instanceof RegimeUnsupportedPoolError;
const regimeBlock = regimeQuery.data?.regime ?? null;
const regimeUnavailableReason = regimeQuery.error
  ? null
  : (regimeQuery.data?.unavailableReason ?? null);
```

- [ ] **Step 4: Forward props to `PositionsListScreen`**

In the JSX returned by `PositionsRoute`, extend the existing `<PositionsListScreen ... />` props with the regime props:

```tsx
regime={regimeBlock}
regimeUnavailableReason={regimeUnavailableReason}
regimeLoading={regimeQuery.isLoading && regimeQuery.fetchStatus !== 'idle'}
regimeUnsupported={regimeUnsupported}
```

- [ ] **Step 5: Run app tests + typecheck + lint**

Run: `pnpm --filter app test && pnpm --filter app typecheck && pnpm --filter app lint`
Expected: PASS. The route file has no test, but `regime.test.ts` and the rest of the app suite must remain green.

- [ ] **Step 6: Commit**

```bash
git add apps/app/app/\(tabs\)/positions.tsx
git commit -m "feat(app): non-blocking regime query on positions route"
```

---

## Phase 12 — Final Verification

### Task 17: Full repo green-bar check

**Files:** none

- [ ] **Step 1: Run the full check matrix the spec mandates**

Run: `pnpm build && pnpm typecheck && pnpm lint && pnpm boundaries && pnpm test`
Expected: every command exits 0.

- [ ] **Step 2: Smoke-test the BFF endpoint locally**

Run: `pnpm dev:api`
In a second terminal:

```bash
curl -i 'http://localhost:3000/regime/pools/Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE/current'
curl -i 'http://localhost:3000/regime/pools/UnsupportedPool11111111111111111111111111111/current'
```

Expected: the supported pool returns a 200 with a `{ regime, unavailableReason }` body (likely `{ regime: null, unavailableReason: 'config-error' }` if env vars are missing locally — which is the correct dev behavior). The unsupported pool returns 404.

- [ ] **Step 3: Smoke-test the Expo app**

Run: `pnpm dev` (or the app's dev script). On the positions tab, with one supported pool selected, confirm both SR insights and the regime section are visible. Confirm degrading regime to unavailable does not hide SR insights.

- [ ] **Step 4: Final reconciliation against the spec checklist**

Re-read `docs/superpowers/specs/2026-05-06-regime-market-context-design.md` "Testing" section. Confirm every bullet has a corresponding test in this branch:

- [ ] domain exports value types (Task 1)
- [ ] application exports port + DTOs through public API (Task 4)
- [ ] adapter sends five params (Task 5)
- [ ] adapter maps 404 CANDLES_NOT_FOUND to not-found (Task 5)
- [ ] adapter maps 400 VALIDATION_ERROR to config-error (Task 5)
- [ ] BFF config resolver maps missing config to config-error (Tasks 6, 8)
- [ ] adapter maps timeout/network/5xx/malformed to upstream-error (Task 5)
- [ ] adapter logs config and upstream failures without leaking secrets (Task 5 — verify no `params` leak in error logs)
- [ ] BFF returns 404 for unsupported pools (Task 8)
- [ ] BFF returns 200 with the contract body for supported pools (Task 8)
- [ ] app client validates BFF responses + classifies unsupported pools (Task 11)
- [ ] regime view-model selects top reasons by severity with source-order tie-break (Task 12)
- [ ] SrInsightsSection and RegimeSection degrade independently (Task 15)
- [ ] missing summary omits Market Thesis without hiding S/R levels (already covered by `SrInsightsSection.test.tsx`)
- [ ] null regime renders compact unavailable copy (Task 14)
- [ ] positions footer order is S/R first, regime second (Task 15)

- [ ] **Step 5: Commit any docs/touchups**

If any iteration uncovered tweaks (typos, additional assertions), commit them now with a single follow-up:

```bash
git add -p
git commit -m "chore: address spec checklist gaps from final review"
```

---

## Self-Review Notes

- **Spec coverage:** Every bullet in the spec's Architecture, BFF Contract, Regime Feed Config, Adapter Design, App Client, UI Composition, Regime UI Behavior, Error Handling, and Testing sections maps to one of the tasks above.
- **Type consistency:** `RegimeReadResult.kind` values (`'block' | 'not-found' | 'config-error' | 'upstream-error'`) match the controller switch (Task 8) and adapter implementation (Task 5). `RegimeUnavailableReason` (`'not-found' | 'upstream-error' | 'config-error'`) is identical between BFF, app client, view, and tests.
- **Drift guards:** The `RegimeBlock` DTO is owned by `packages/application` and validated by the adapter; the comment in `dto/regime.ts` mirrors the existing `SrLevelsBlock` drift guard.
- **Boundaries:** New types flow `domain → application → ui` via the public barrel; new adapter and BFF code lives only in `packages/adapters`. No domain/application import of an adapter or SDK is introduced.
- **No premature abstractions:** No shared `MarketContextRoute`, no generic "insight section" wrapper. Regime and SR remain two separate read paths, exactly as the spec mandates.
