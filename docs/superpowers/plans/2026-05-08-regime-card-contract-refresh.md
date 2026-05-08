# Regime Card Contract Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ambiguous `RegimeBlock` contract with a normalized DTO that exposes telemetry, two-clock freshness with explicit thresholds, expanded provenance metadata, and a structured view model that owns all interpretation, plus a refreshed `RegimeSection` with explicit show/hide details.

**Architecture:** No new layers. Existing read path stays intact: `regime-engine GET /v1/regime/current` → `CurrentRegimeAdapter` → `RegimeReadPort` → `RegimeController` → `apps/app/src/api/regime.ts` → positions route React Query → `PositionsListScreen` → `RegimeSection`. The DTO change is breaking and propagates through every layer in one PR. `RegimeViewModel` becomes the sole owner of label, tone, sort, dedupe, and freshness classification. `RegimeSection` becomes a renderer of precomputed rows.

**Tech Stack:** TypeScript 5, NestJS 10 (BFF), React Native + Expo Router + TanStack Query (apps/app), Vitest 1.6 (with `expectTypeOf`). Source of truth: [`docs/superpowers/specs/2026-05-08-regime-card-contract-refresh-design.md`](../specs/2026-05-08-regime-card-contract-refresh-design.md).

**Out of scope (do not change):** `DirectionalExitPolicyService`, exit pipeline, trigger qualification, signing, execution, position-detail/preview/signing screens, S/R Insights, Policy Insights, regime-engine upstream service contract documentation. No fallback or compatibility shim for the old `capturedAtUnixMs` shape.

---

## Upstream `regime-engine` Response Shape

The adapter assumes upstream returns the following on `GET /v1/regime/current` 200 (extra fields ignored):

```ts
type UpstreamRegimeResponse = {
  regime: 'UP' | 'DOWN' | 'CHOP';
  // top-level metadata (preferred over nested metadata):
  source?: string;
  network?: string;
  symbol?: string;
  timeframe?: string;
  sourceTimeframe?: string;
  telemetry: {
    realizedVolShort: number;
    realizedVolLong: number;
    volRatio: number;
    trendStrength: number;
    compression: number;
  };
  clmmSuitability: {
    status: 'ALLOWED' | 'CAUTION' | 'BLOCKED' | 'UNKNOWN';
    reasons: Array<{ severity: 'ERROR' | 'WARN' | 'INFO'; message: string; code?: string }>;
  };
  marketReasons: Array<{ severity: 'ERROR' | 'WARN' | 'INFO'; message: string; code?: string }>;
  freshness: {
    generatedAtIso: string;
    lastCandleIso: string;
    ageSeconds: number;
    softStale: boolean;
    hardStale: boolean;
    softStaleSeconds: number;
    hardStaleSeconds: number;
  };
  metadata?: {
    source?: string;
    network?: string;
    symbol?: string;
    timeframe?: string;
    sourceTimeframe?: string;
    sourceCandleCount?: number;
    candleCount?: number;
    derivedTimeframe?: string;
    aggregationVersion?: string;
    engineVersion?: string;
    configVersion?: string;
  };
};
```

The adapter:

- parses `generatedAtIso` and `lastCandleIso` to UNIX ms
- preserves `ageSeconds`, `softStale`, `hardStale`, `softStaleSeconds`, `hardStaleSeconds`
- preserves all five telemetry numbers
- normalizes metadata as **top-level fields first, nested `metadata` fallback**, requires `source`, `network`, `symbol`, `timeframe`
- maps `reasons[].message` → `RegimeReason.text`

Existing 4xx/5xx/timeout/network/malformed-body classifications remain unchanged.

---

## File Structure

| File                                                                        | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/application/src/dto/regime.ts`                                    | MODIFY. Replace `RegimeFreshness` with two-clock + thresholds. Add `RegimeTelemetry`. Expand `RegimeMetadata` with required + optional fields. Move `trendStrength` and `volRatio` off top-level `RegimeBlock` into `telemetry`. Remove `capturedAtUnixMs`.                                                                                                                                                    |
| `packages/application/src/dto/index.ts`                                     | MODIFY. Re-export `RegimeTelemetry`.                                                                                                                                                                                                                                                                                                                                                                           |
| `packages/application/src/public/index.ts`                                  | MODIFY. Re-export `RegimeTelemetry`.                                                                                                                                                                                                                                                                                                                                                                           |
| `packages/application/src/public/regime.exports.test.ts`                    | MODIFY. Use `expectTypeOf` to lock the new shape and prove old fields removed.                                                                                                                                                                                                                                                                                                                                 |
| `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.ts`      | MODIFY. Parse new upstream telemetry, two-clock freshness with thresholds, top-level-then-nested metadata fallback. New validation rules.                                                                                                                                                                                                                                                                      |
| `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.test.ts` | MODIFY. Update sample, add metadata-fallback, threshold-validation, ageSeconds-validation, telemetry-completeness cases.                                                                                                                                                                                                                                                                                       |
| `packages/adapters/src/outbound/regime-engine/RegimeBlockParity.test.ts`    | MODIFY. Use new shape in fixture.                                                                                                                                                                                                                                                                                                                                                                              |
| `packages/adapters/src/inbound/http/RegimeController.test.ts`               | MODIFY. Use new fixture shape. (Controller code itself does not change.)                                                                                                                                                                                                                                                                                                                                       |
| `apps/app/src/api/regime.ts`                                                | MODIFY. Replace `isRegimeBlock` validators with the new shape, including `freshness` (two clocks + thresholds), `telemetry`, and required metadata.                                                                                                                                                                                                                                                            |
| `apps/app/src/api/regime.test.ts`                                           | MODIFY. Replace old fixture with new shape. Add explicit rejection tests for old shape (top-level `trendStrength`, top-level `volRatio`, `capturedAtUnixMs`).                                                                                                                                                                                                                                                  |
| `packages/ui/src/view-models/RegimeViewModel.ts`                            | REWRITE. Owns regime label, suitability copy + tone, data-quality classification, generated-age and latest-candle-age labels, source label, compact telemetry, severity-sorted + deduped `displayReasons[]`, `primaryDisplayReason`, expanded telemetry/sample/freshness rows. Suitability copy is the new spec form ("CLMM suitable" / "CLMM caution" / "CLMM not recommended" / "CLMM suitability unknown"). |
| `packages/ui/src/view-models/RegimeViewModel.test.ts`                       | REWRITE. Cover all spec view-model rules.                                                                                                                                                                                                                                                                                                                                                                      |
| `packages/ui/src/components/RegimeSection.tsx`                              | REWRITE. Renders precomputed VM. Adds explicit "Show details" / "Hide details" affordance. Collapsed renders one reason; expanded renders structured rows.                                                                                                                                                                                                                                                     |
| `packages/ui/src/components/RegimeSection.test.tsx`                         | REWRITE. Cover loading/unsupported/unavailable/valid/degraded; collapsed vs expanded; affordance.                                                                                                                                                                                                                                                                                                              |

No new files. No public-export removals beyond the deleted top-level fields. No domain or port changes.

---

## Bootstrapping

Before starting Phase 1, in a fresh worktree:

```bash
[ -d node_modules ] || pnpm install --frozen-lockfile
[ -d packages/application/dist ] || pnpm build
```

Run a baseline once:

```bash
pnpm typecheck
pnpm test
```

If anything fails on `main` before changes, stop and surface the breakage.

---

## Phase 1 — Application DTO refresh

This phase is the contract-breaking change. After Phase 1 the rest of the codebase will not compile until later phases catch up. That is intentional — do not add fallback fields.

### Task 1: Replace `RegimeBlock` shape and add `RegimeTelemetry`

**Files:**

- Modify: `packages/application/src/dto/regime.ts`
- Modify: `packages/application/src/dto/index.ts`
- Modify: `packages/application/src/public/index.ts`

- [ ] **Step 1: Rewrite `packages/application/src/dto/regime.ts` with the normalized shape**

```ts
import type { MarketRegime, ClmmSuitabilityStatus } from '@clmm/domain';

export type RegimeReasonSeverity = 'ERROR' | 'WARN' | 'INFO';

export type RegimeReason = {
  severity: RegimeReasonSeverity;
  text: string;
  code?: string;
};

export type RegimeFreshness = {
  generatedAtUnixMs: number;
  lastCandleUnixMs: number;
  ageSeconds: number;
  softStale: boolean;
  hardStale: boolean;
  softStaleSeconds: number;
  hardStaleSeconds: number;
};

export type RegimeTelemetry = {
  realizedVolShort: number;
  realizedVolLong: number;
  volRatio: number;
  trendStrength: number;
  compression: number;
};

export type RegimeClmmSuitability = {
  status: ClmmSuitabilityStatus;
  reasons: RegimeReason[];
};

export type RegimeMetadata = {
  source: string;
  network: string;
  symbol: string;
  timeframe: string;
  sourceTimeframe?: string;
  sourceCandleCount?: number;
  candleCount?: number;
  derivedTimeframe?: string;
  aggregationVersion?: string;
  engineVersion?: string;
  configVersion?: string;
};

export type RegimeBlock = {
  regime: MarketRegime;
  telemetry: RegimeTelemetry;
  clmmSuitability: RegimeClmmSuitability;
  marketReasons: RegimeReason[];
  freshness: RegimeFreshness;
  metadata: RegimeMetadata;
};
```

- [ ] **Step 2: Re-export `RegimeTelemetry` from `packages/application/src/dto/index.ts`**

Locate the existing block:

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

Replace with:

```ts
export type {
  RegimeReasonSeverity,
  RegimeReason,
  RegimeFreshness,
  RegimeTelemetry,
  RegimeClmmSuitability,
  RegimeMetadata,
  RegimeBlock,
} from './regime.js';
```

- [ ] **Step 3: Re-export `RegimeTelemetry` from `packages/application/src/public/index.ts`**

Locate the regime DTO export block (currently includes `RegimeBlock`, `RegimeReason`, `RegimeReasonSeverity`, `RegimeFreshness`, `RegimeClmmSuitability`, `RegimeMetadata`) and add `RegimeTelemetry`:

```ts
  RegimeBlock,
  RegimeReason,
  RegimeReasonSeverity,
  RegimeFreshness,
  RegimeTelemetry,
  RegimeClmmSuitability,
  RegimeMetadata,
```

- [ ] **Step 4: Run application package build to verify the file compiles in isolation**

Run: `pnpm --filter @clmm/application build`
Expected: clean build for the DTO files. (Other places that consume the old fields will fail in later phases — that is fine here because this filter only builds `@clmm/application`.)

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/dto/regime.ts packages/application/src/dto/index.ts packages/application/src/public/index.ts
git commit -m "refactor(application): replace RegimeBlock with normalized telemetry/freshness/metadata DTO"
```

### Task 2: Lock new shape with compile-time test

**Files:**

- Test: `packages/application/src/public/regime.exports.test.ts`

- [ ] **Step 1: Replace the file with `expectTypeOf` checks proving the new shape and removed fields**

```ts
import { describe, expectTypeOf, it } from 'vitest';
import type {
  RegimeBlock,
  RegimeReason,
  RegimeReasonSeverity,
  RegimeFreshness,
  RegimeTelemetry,
  RegimeClmmSuitability,
  RegimeMetadata,
  MarketRegime,
  ClmmSuitabilityStatus,
} from './index.js';

describe('@clmm/application/public exports for regime', () => {
  it('RegimeBlock no longer exposes top-level trendStrength', () => {
    expectTypeOf<RegimeBlock>().not.toHaveProperty('trendStrength');
  });

  it('RegimeBlock no longer exposes top-level volRatio', () => {
    expectTypeOf<RegimeBlock>().not.toHaveProperty('volRatio');
  });

  it('RegimeBlock has telemetry with all five fields', () => {
    expectTypeOf<RegimeBlock['telemetry']>().toEqualTypeOf<RegimeTelemetry>();
    expectTypeOf<RegimeTelemetry>().toEqualTypeOf<{
      realizedVolShort: number;
      realizedVolLong: number;
      volRatio: number;
      trendStrength: number;
      compression: number;
    }>();
  });

  it('RegimeFreshness no longer exposes capturedAtUnixMs', () => {
    expectTypeOf<RegimeFreshness>().not.toHaveProperty('capturedAtUnixMs');
  });

  it('RegimeFreshness exposes both clocks, age, stale flags, and thresholds', () => {
    expectTypeOf<RegimeFreshness>().toEqualTypeOf<{
      generatedAtUnixMs: number;
      lastCandleUnixMs: number;
      ageSeconds: number;
      softStale: boolean;
      hardStale: boolean;
      softStaleSeconds: number;
      hardStaleSeconds: number;
    }>();
  });

  it('RegimeMetadata requires source, network, symbol, timeframe', () => {
    expectTypeOf<RegimeMetadata>().toMatchTypeOf<{
      source: string;
      network: string;
      symbol: string;
      timeframe: string;
    }>();
  });

  it('RegimeBlock.metadata is required (not optional)', () => {
    expectTypeOf<RegimeBlock>().toHaveProperty('metadata').not.toBeUndefined();
  });

  it('a complete sample is constructible', () => {
    const sample: RegimeBlock = {
      regime: 'UP' as MarketRegime,
      telemetry: {
        realizedVolShort: 0.007,
        realizedVolLong: 0.0107,
        volRatio: 1.06,
        trendStrength: 0.00018,
        compression: 0.0092,
      },
      clmmSuitability: {
        status: 'ALLOWED' as ClmmSuitabilityStatus,
        reasons: [{ severity: 'INFO' as RegimeReasonSeverity, text: 'ok' }] as RegimeReason[],
      } satisfies RegimeClmmSuitability,
      marketReasons: [] as RegimeReason[],
      freshness: {
        generatedAtUnixMs: 1_700_000_000_000,
        lastCandleUnixMs: 1_700_000_000_000 - 87 * 60_000,
        ageSeconds: 87 * 60,
        softStale: true,
        hardStale: false,
        softStaleSeconds: 75 * 60,
        hardStaleSeconds: 90 * 60,
      } satisfies RegimeFreshness,
      metadata: {
        source: 'geckoterminal',
        network: 'solana',
        symbol: 'SOL/USDC',
        timeframe: '1h',
      } satisfies RegimeMetadata,
    };
    expectTypeOf(sample).toEqualTypeOf<RegimeBlock>();
  });
});
```

- [ ] **Step 2: Run the focused test**

Run: `pnpm --filter @clmm/application test -- public/regime.exports.test.ts`
Expected: PASS for all eight cases. If any case fails, the DTO from Task 1 does not match the spec.

- [ ] **Step 3: Commit**

```bash
git add packages/application/src/public/regime.exports.test.ts
git commit -m "test(application): lock new RegimeBlock shape with expectTypeOf"
```

---

## Phase 2 — Adapter refresh

The adapter is the only layer that understands the upstream regime-engine response. After this phase the application package compiles end-to-end again.

### Task 3: Update adapter unit-test fixture and write the failing tests

**Files:**

- Test: `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.test.ts`

- [ ] **Step 1: Replace `SAMPLE_UPSTREAM` with the new upstream shape**

Find the existing `SAMPLE_UPSTREAM` constant and replace it with:

```ts
const SAMPLE_UPSTREAM = {
  regime: 'UP',
  source: 'geckoterminal',
  network: 'solana',
  symbol: 'SOL/USDC',
  timeframe: '1h',
  sourceTimeframe: '15m',
  telemetry: {
    realizedVolShort: 0.007,
    realizedVolLong: 0.0107,
    volRatio: 1.06,
    trendStrength: 0.00018,
    compression: 0.0092,
  },
  clmmSuitability: {
    status: 'ALLOWED',
    reasons: [{ severity: 'INFO', message: 'Trend supports range LP', code: 'CLMM_OK' }],
  },
  marketReasons: [{ severity: 'INFO', message: 'Constructive trend', code: 'TREND_OK' }],
  freshness: {
    generatedAtIso: '2026-05-06T12:00:00Z',
    lastCandleIso: '2026-05-06T10:33:00Z',
    ageSeconds: 87 * 60,
    softStale: true,
    hardStale: false,
    softStaleSeconds: 75 * 60,
    hardStaleSeconds: 90 * 60,
  },
  metadata: {
    sourceCandleCount: 346,
    candleCount: 86,
    derivedTimeframe: '1h',
    aggregationVersion: 'ohlcv-agg-v1',
    engineVersion: 'regime-engine-v1.4.0',
    configVersion: 'regime-config-v3',
  },
};
```

- [ ] **Step 2: Update the existing happy-path expectations to read new fields**

In the existing `it('returns kind:"block" with parsed RegimeBlock on 200', ...)` block, replace its body with:

```ts
vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(SAMPLE_UPSTREAM), { status: 200 }));
const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);

const result = await adapter.fetchCurrent(PARAMS);

expect(result.kind).toBe('block');
if (result.kind !== 'block') return;
expect(result.block.regime).toBe('UP');
expect(result.block.telemetry).toEqual({
  realizedVolShort: 0.007,
  realizedVolLong: 0.0107,
  volRatio: 1.06,
  trendStrength: 0.00018,
  compression: 0.0092,
});
expect(result.block.clmmSuitability.status).toBe('ALLOWED');
expect(result.block.freshness.generatedAtUnixMs).toBe(Date.parse('2026-05-06T12:00:00Z'));
expect(result.block.freshness.lastCandleUnixMs).toBe(Date.parse('2026-05-06T10:33:00Z'));
expect(result.block.freshness.ageSeconds).toBe(87 * 60);
expect(result.block.freshness.softStale).toBe(true);
expect(result.block.freshness.hardStale).toBe(false);
expect(result.block.freshness.softStaleSeconds).toBe(75 * 60);
expect(result.block.freshness.hardStaleSeconds).toBe(90 * 60);
expect(result.block.metadata.source).toBe('geckoterminal');
expect(result.block.metadata.network).toBe('solana');
expect(result.block.metadata.symbol).toBe('SOL/USDC');
expect(result.block.metadata.timeframe).toBe('1h');
expect(result.block.metadata.sourceTimeframe).toBe('15m');
expect(result.block.metadata.sourceCandleCount).toBe(346);
expect(result.block.metadata.candleCount).toBe(86);
expect(result.block.metadata.derivedTimeframe).toBe('1h');
expect(result.block.metadata.aggregationVersion).toBe('ohlcv-agg-v1');
expect(result.block.metadata.engineVersion).toBe('regime-engine-v1.4.0');
expect(result.block.metadata.configVersion).toBe('regime-config-v3');
```

- [ ] **Step 3: Replace the malformed-body test body to assert on new failure modes**

Replace the existing `it('returns kind:"upstream-error" on malformed body shape', ...)` body with:

```ts
vi.mocked(fetch).mockResolvedValue(
  new Response(JSON.stringify({ regime: 'INVALID', telemetry: { trendStrength: 'oops' } }), {
    status: 200,
  }),
);
const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
const result = await adapter.fetchCurrent(PARAMS);
expect(result.kind).toBe('upstream-error');
```

- [ ] **Step 4: Add the new test cases below the existing `it('maps upstream message field to DTO text in reasons', ...)` block**

```ts
it('uses top-level metadata fields and overrides nested metadata', async () => {
  const upstream = {
    ...SAMPLE_UPSTREAM,
    source: 'geckoterminal',
    network: 'solana',
    symbol: 'SOL/USDC',
    timeframe: '1h',
    metadata: {
      ...SAMPLE_UPSTREAM.metadata,
      source: 'NESTED-SHOULD-LOSE',
      network: 'NESTED-SHOULD-LOSE',
      symbol: 'NESTED-SHOULD-LOSE',
      timeframe: 'NESTED-SHOULD-LOSE',
    },
  };
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(upstream), { status: 200 }));
  const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent(PARAMS);
  expect(result.kind).toBe('block');
  if (result.kind !== 'block') return;
  expect(result.block.metadata.source).toBe('geckoterminal');
  expect(result.block.metadata.network).toBe('solana');
  expect(result.block.metadata.symbol).toBe('SOL/USDC');
  expect(result.block.metadata.timeframe).toBe('1h');
});

it('falls back to nested metadata when top-level metadata is absent', async () => {
  const upstream = {
    regime: SAMPLE_UPSTREAM.regime,
    telemetry: SAMPLE_UPSTREAM.telemetry,
    clmmSuitability: SAMPLE_UPSTREAM.clmmSuitability,
    marketReasons: SAMPLE_UPSTREAM.marketReasons,
    freshness: SAMPLE_UPSTREAM.freshness,
    metadata: {
      source: 'geckoterminal',
      network: 'solana',
      symbol: 'SOL/USDC',
      timeframe: '1h',
    },
  };
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(upstream), { status: 200 }));
  const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent(PARAMS);
  expect(result.kind).toBe('block');
  if (result.kind !== 'block') return;
  expect(result.block.metadata.source).toBe('geckoterminal');
  expect(result.block.metadata.network).toBe('solana');
});

it('rejects when required metadata cannot be resolved from either layer', async () => {
  const upstream = {
    regime: SAMPLE_UPSTREAM.regime,
    telemetry: SAMPLE_UPSTREAM.telemetry,
    clmmSuitability: SAMPLE_UPSTREAM.clmmSuitability,
    marketReasons: SAMPLE_UPSTREAM.marketReasons,
    freshness: SAMPLE_UPSTREAM.freshness,
  };
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(upstream), { status: 200 }));
  const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent(PARAMS);
  expect(result.kind).toBe('upstream-error');
});

it('rejects when generatedAtIso is not parseable', async () => {
  const upstream = {
    ...SAMPLE_UPSTREAM,
    freshness: { ...SAMPLE_UPSTREAM.freshness, generatedAtIso: 'not-a-date' },
  };
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(upstream), { status: 200 }));
  const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent(PARAMS);
  expect(result.kind).toBe('upstream-error');
});

it('rejects when lastCandleIso is not parseable', async () => {
  const upstream = {
    ...SAMPLE_UPSTREAM,
    freshness: { ...SAMPLE_UPSTREAM.freshness, lastCandleIso: 'not-a-date' },
  };
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(upstream), { status: 200 }));
  const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent(PARAMS);
  expect(result.kind).toBe('upstream-error');
});

it('rejects when ageSeconds is negative', async () => {
  const upstream = {
    ...SAMPLE_UPSTREAM,
    freshness: { ...SAMPLE_UPSTREAM.freshness, ageSeconds: -1 },
  };
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(upstream), { status: 200 }));
  const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent(PARAMS);
  expect(result.kind).toBe('upstream-error');
});

it('rejects when softStaleSeconds is not positive', async () => {
  const upstream = {
    ...SAMPLE_UPSTREAM,
    freshness: { ...SAMPLE_UPSTREAM.freshness, softStaleSeconds: 0 },
  };
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(upstream), { status: 200 }));
  const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent(PARAMS);
  expect(result.kind).toBe('upstream-error');
});

it('rejects when hardStaleSeconds is not greater than softStaleSeconds', async () => {
  const upstream = {
    ...SAMPLE_UPSTREAM,
    freshness: {
      ...SAMPLE_UPSTREAM.freshness,
      softStaleSeconds: 90 * 60,
      hardStaleSeconds: 90 * 60,
    },
  };
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(upstream), { status: 200 }));
  const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent(PARAMS);
  expect(result.kind).toBe('upstream-error');
});

it('rejects when any telemetry value is non-finite', async () => {
  const upstream = {
    ...SAMPLE_UPSTREAM,
    telemetry: { ...SAMPLE_UPSTREAM.telemetry, compression: Number.POSITIVE_INFINITY },
  };
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(upstream), { status: 200 }));
  const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent(PARAMS);
  expect(result.kind).toBe('upstream-error');
});

it('preserves all five telemetry numbers exactly as parsed', async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify(SAMPLE_UPSTREAM), { status: 200 }),
  );
  const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent(PARAMS);
  expect(result.kind).toBe('block');
  if (result.kind !== 'block') return;
  expect(result.block.telemetry).toEqual(SAMPLE_UPSTREAM.telemetry);
});
```

- [ ] **Step 5: Run the test file (still on the old adapter implementation)**

Run: `pnpm --filter @clmm/adapters test -- regime-engine/CurrentRegimeAdapter.test.ts`
Expected: many FAILS — the adapter does not parse the new shape yet. Confirm specifically that the new metadata-fallback, threshold, and telemetry tests all fail.

- [ ] **Step 6: Commit (red-state TDD checkpoint)**

```bash
git add packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.test.ts
git commit -m "test(adapters): refresh CurrentRegimeAdapter expectations to new RegimeBlock shape"
```

### Task 4: Implement the new adapter parser

**Files:**

- Modify: `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.ts`

- [ ] **Step 1: Replace `parseUpstream` with a parser that builds the new shape**

Replace the existing `parseUpstream` function (lines roughly 45–100 in the current file) with:

```ts
function pickStringTopThenNested(
  data: Record<string, unknown>,
  metadata: Record<string, unknown> | null,
  key: string,
): string | undefined {
  const top = data[key];
  if (typeof top === 'string' && top.length > 0) return top;
  if (metadata) {
    const nested = metadata[key];
    if (typeof nested === 'string' && nested.length > 0) return nested;
  }
  return undefined;
}

function pickNestedString(
  metadata: Record<string, unknown> | null,
  key: string,
): string | undefined {
  if (!metadata) return undefined;
  const value = metadata[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function pickNestedNumber(
  metadata: Record<string, unknown> | null,
  key: string,
): number | undefined {
  if (!metadata) return undefined;
  const value = metadata[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseTelemetry(raw: unknown): RegimeBlock['telemetry'] | null {
  if (!isRecord(raw)) return null;
  const required = [
    'realizedVolShort',
    'realizedVolLong',
    'volRatio',
    'trendStrength',
    'compression',
  ] as const;
  const out: Record<string, number> = {};
  for (const key of required) {
    const value = raw[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    out[key] = value;
  }
  return out as RegimeBlock['telemetry'];
}

function parseUpstream(data: unknown): RegimeBlock | null {
  if (!isRecord(data)) return null;

  const regime = data['regime'];
  if (typeof regime !== 'string' || !VALID_REGIMES.has(regime as MarketRegime)) return null;

  const telemetry = parseTelemetry(data['telemetry']);
  if (!telemetry) return null;

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
  const generatedAtIso = freshness['generatedAtIso'];
  const lastCandleIso = freshness['lastCandleIso'];
  const ageSeconds = freshness['ageSeconds'];
  const softStale = freshness['softStale'];
  const hardStale = freshness['hardStale'];
  const softStaleSeconds = freshness['softStaleSeconds'];
  const hardStaleSeconds = freshness['hardStaleSeconds'];
  if (typeof generatedAtIso !== 'string') return null;
  if (typeof lastCandleIso !== 'string') return null;
  if (typeof softStale !== 'boolean' || typeof hardStale !== 'boolean') return null;
  if (typeof ageSeconds !== 'number' || !Number.isFinite(ageSeconds) || ageSeconds < 0) return null;
  if (
    typeof softStaleSeconds !== 'number' ||
    !Number.isFinite(softStaleSeconds) ||
    softStaleSeconds <= 0
  )
    return null;
  if (
    typeof hardStaleSeconds !== 'number' ||
    !Number.isFinite(hardStaleSeconds) ||
    hardStaleSeconds <= softStaleSeconds
  )
    return null;
  const generatedAtUnixMs = Date.parse(generatedAtIso);
  if (!Number.isFinite(generatedAtUnixMs)) return null;
  const lastCandleUnixMs = Date.parse(lastCandleIso);
  if (!Number.isFinite(lastCandleUnixMs)) return null;

  const metadataRaw = data['metadata'];
  const metadata = isRecord(metadataRaw) ? metadataRaw : null;

  const source = pickStringTopThenNested(data, metadata, 'source');
  const network = pickStringTopThenNested(data, metadata, 'network');
  const symbol = pickStringTopThenNested(data, metadata, 'symbol');
  const timeframe = pickStringTopThenNested(data, metadata, 'timeframe');
  if (!source || !network || !symbol || !timeframe) return null;

  const sourceTimeframe = pickStringTopThenNested(data, metadata, 'sourceTimeframe');
  const sourceCandleCount = pickNestedNumber(metadata, 'sourceCandleCount');
  const candleCount = pickNestedNumber(metadata, 'candleCount');
  const derivedTimeframe = pickNestedString(metadata, 'derivedTimeframe');
  const aggregationVersion = pickNestedString(metadata, 'aggregationVersion');
  const engineVersion = pickNestedString(metadata, 'engineVersion');
  const configVersion = pickNestedString(metadata, 'configVersion');

  return {
    regime: regime as MarketRegime,
    telemetry,
    clmmSuitability: { status: status as ClmmSuitabilityStatus, reasons: suitReasons },
    marketReasons,
    freshness: {
      generatedAtUnixMs,
      lastCandleUnixMs,
      ageSeconds,
      softStale,
      hardStale,
      softStaleSeconds,
      hardStaleSeconds,
    },
    metadata: {
      source,
      network,
      symbol,
      timeframe,
      ...(sourceTimeframe !== undefined ? { sourceTimeframe } : {}),
      ...(sourceCandleCount !== undefined ? { sourceCandleCount } : {}),
      ...(candleCount !== undefined ? { candleCount } : {}),
      ...(derivedTimeframe !== undefined ? { derivedTimeframe } : {}),
      ...(aggregationVersion !== undefined ? { aggregationVersion } : {}),
      ...(engineVersion !== undefined ? { engineVersion } : {}),
      ...(configVersion !== undefined ? { configVersion } : {}),
    },
  };
}
```

- [ ] **Step 2: Run the focused adapter tests**

Run: `pnpm --filter @clmm/adapters test -- regime-engine/CurrentRegimeAdapter.test.ts`
Expected: PASS for all cases including the new metadata-fallback, threshold, ageSeconds, telemetry-completeness, and lastCandleIso cases.

- [ ] **Step 3: Commit**

```bash
git add packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.ts
git commit -m "feat(adapters): parse new RegimeBlock shape with two-clock freshness, telemetry, and metadata fallback"
```

### Task 5: Update parity and controller fixtures to the new shape

**Files:**

- Modify: `packages/adapters/src/outbound/regime-engine/RegimeBlockParity.test.ts`
- Modify: `packages/adapters/src/inbound/http/RegimeController.test.ts`

- [ ] **Step 1: Replace the parity test file body with the new shape**

```ts
import { describe, it, expect } from 'vitest';
import type { RegimeBlock, RegimeReadResult } from '@clmm/application';

const sampleBlock: RegimeBlock = {
  regime: 'UP',
  telemetry: {
    realizedVolShort: 0.007,
    realizedVolLong: 0.0107,
    volRatio: 1.06,
    trendStrength: 0.00018,
    compression: 0.0092,
  },
  clmmSuitability: { status: 'ALLOWED', reasons: [] },
  marketReasons: [],
  freshness: {
    generatedAtUnixMs: 1_700_000_000_000,
    lastCandleUnixMs: 1_700_000_000_000 - 87 * 60_000,
    ageSeconds: 87 * 60,
    softStale: true,
    hardStale: false,
    softStaleSeconds: 75 * 60,
    hardStaleSeconds: 90 * 60,
  },
  metadata: {
    source: 'geckoterminal',
    network: 'solana',
    symbol: 'SOL/USDC',
    timeframe: '1h',
  },
};

describe('RegimeBlock structural parity', () => {
  it('application RegimeBlock is self-consistent', () => {
    expect(sampleBlock.regime).toBe('UP');
    expect(sampleBlock.telemetry.trendStrength).toBe(0.00018);
    expect(sampleBlock.clmmSuitability.status).toBe('ALLOWED');
    expect(sampleBlock.freshness.generatedAtUnixMs).toBe(1_700_000_000_000);
    expect(sampleBlock.freshness.softStaleSeconds).toBeLessThan(
      sampleBlock.freshness.hardStaleSeconds,
    );
    expect(sampleBlock.metadata.source).toBe('geckoterminal');
  });

  it('application RegimeReadResult block variant is well-formed', () => {
    const result: RegimeReadResult = { kind: 'block', block: sampleBlock };
    expect(result.kind).toBe('block');
    if (result.kind === 'block') {
      expect(result.block.regime).toBe('UP');
    }
  });

  it('application RegimeReadResult not-found variant', () => {
    const result: RegimeReadResult = { kind: 'not-found' };
    expect(result.kind).toBe('not-found');
  });

  it('application RegimeReadResult config-error variant', () => {
    const result: RegimeReadResult = { kind: 'config-error' };
    expect(result.kind).toBe('config-error');
  });

  it('application RegimeReadResult upstream-error variant', () => {
    const result: RegimeReadResult = { kind: 'upstream-error' };
    expect(result.kind).toBe('upstream-error');
  });
});
```

- [ ] **Step 2: Replace the `testBlock` fixture in `RegimeController.test.ts`**

Find:

```ts
const testBlock: RegimeBlock = {
  regime: 'UP',
  trendStrength: 0.75,
  volRatio: 1.2,
  clmmSuitability: { status: 'ALLOWED', reasons: [] },
  marketReasons: [],
  freshness: { capturedAtUnixMs: 1700000000000, softStale: false, hardStale: false },
};
```

Replace with:

```ts
const testBlock: RegimeBlock = {
  regime: 'UP',
  telemetry: {
    realizedVolShort: 0.007,
    realizedVolLong: 0.0107,
    volRatio: 1.06,
    trendStrength: 0.00018,
    compression: 0.0092,
  },
  clmmSuitability: { status: 'ALLOWED', reasons: [] },
  marketReasons: [],
  freshness: {
    generatedAtUnixMs: 1_700_000_000_000,
    lastCandleUnixMs: 1_700_000_000_000 - 87 * 60_000,
    ageSeconds: 87 * 60,
    softStale: false,
    hardStale: false,
    softStaleSeconds: 75 * 60,
    hardStaleSeconds: 90 * 60,
  },
  metadata: {
    source: 'geckoterminal',
    network: 'solana',
    symbol: 'SOL/USDC',
    timeframe: '1h',
  },
};
```

- [ ] **Step 3: Run the adapter package tests**

Run: `pnpm --filter @clmm/adapters test`
Expected: PASS for both `RegimeBlockParity.test.ts` and `RegimeController.test.ts` plus the rest. Also `pnpm --filter @clmm/application test` should now pass (DTO + exports).

- [ ] **Step 4: Commit**

```bash
git add packages/adapters/src/outbound/regime-engine/RegimeBlockParity.test.ts packages/adapters/src/inbound/http/RegimeController.test.ts
git commit -m "test(adapters): update parity and controller fixtures to new RegimeBlock shape"
```

---

## Phase 3 — App API client refresh

The Expo client validates the BFF response. It must accept only the new shape and reject the old one.

### Task 6: Replace app client validators with shape tests

**Files:**

- Test: `apps/app/src/api/regime.test.ts`

- [ ] **Step 1: Replace `fixtureBlock()` with the new shape**

Find the `fixtureBlock()` function and replace its body with:

```ts
function fixtureBlock() {
  return {
    regime: 'UP',
    telemetry: {
      realizedVolShort: 0.007,
      realizedVolLong: 0.0107,
      volRatio: 1.06,
      trendStrength: 0.00018,
      compression: 0.0092,
    },
    clmmSuitability: {
      status: 'ALLOWED',
      reasons: [{ severity: 'INFO', text: 'Trend is clear' }],
    },
    marketReasons: [
      { severity: 'WARN', text: 'Volatility elevated' },
      { severity: 'INFO', text: 'Momentum positive' },
    ],
    freshness: {
      generatedAtUnixMs: 1_745_712_000_000,
      lastCandleUnixMs: 1_745_712_000_000 - 87 * 60_000,
      ageSeconds: 87 * 60,
      softStale: false,
      hardStale: false,
      softStaleSeconds: 75 * 60,
      hardStaleSeconds: 90 * 60,
    },
    metadata: { source: 'geckoterminal', network: 'solana', symbol: 'SOL/USDC', timeframe: '1h' },
  };
}
```

- [ ] **Step 2: Add explicit rejection tests for the old shape**

Append the following inside the `describe('fetchCurrentRegime', ...)` block:

```ts
it('throws when the response uses the deprecated top-level trendStrength shape', async () => {
  env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

  const oldShape = {
    regime: 'UP',
    trendStrength: 0.75,
    volRatio: 1.2,
    clmmSuitability: { status: 'ALLOWED', reasons: [] },
    marketReasons: [],
    freshness: { capturedAtUnixMs: 1_745_712_000_000, softStale: false, hardStale: false },
  };

  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ regime: oldShape }),
  }) as typeof fetch;

  const error = await fetchCurrentRegime(POOL_ID).catch((reason: unknown) => reason);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain('malformed regime block');
});

it('throws when the response uses the deprecated capturedAtUnixMs freshness shape', async () => {
  env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

  const block = fixtureBlock();
  const broken: Record<string, unknown> = {
    ...block,
    freshness: { capturedAtUnixMs: 1_745_712_000_000, softStale: false, hardStale: false },
  };

  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ regime: broken }),
  }) as typeof fetch;

  const error = await fetchCurrentRegime(POOL_ID).catch((reason: unknown) => reason);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain('malformed regime block');
});

it('throws when metadata is missing required fields', async () => {
  env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

  const block = fixtureBlock();
  const broken: Record<string, unknown> = { ...block, metadata: { source: 'geckoterminal' } };

  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ regime: broken }),
  }) as typeof fetch;

  const error = await fetchCurrentRegime(POOL_ID).catch((reason: unknown) => reason);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain('malformed regime block');
});
```

- [ ] **Step 3: Run the focused tests (still on the old client implementation)**

Run: `pnpm --filter @clmm/app test -- src/api/regime.test.ts`
Expected: many FAILS. The new fixture is rejected by old `isRegimeBlock`, and the new rejection tests do not reject the old shape because the old client still accepts it. Confirm at least the happy-path test now fails.

- [ ] **Step 4: Commit (red-state TDD checkpoint)**

```bash
git add apps/app/src/api/regime.test.ts
git commit -m "test(app): require new RegimeBlock shape in fetchCurrentRegime"
```

### Task 7: Implement the new client validators

**Files:**

- Modify: `apps/app/src/api/regime.ts`

- [ ] **Step 1: Update validators to enforce the new shape**

Replace the `isRegimeFreshnessBlock` and `isRegimeBlock` functions with:

```ts
function isRegimeFreshnessBlock(value: unknown): value is RegimeFreshness {
  if (!isRecord(value)) return false;
  const generated = value['generatedAtUnixMs'];
  const last = value['lastCandleUnixMs'];
  const age = value['ageSeconds'];
  const softSec = value['softStaleSeconds'];
  const hardSec = value['hardStaleSeconds'];
  if (typeof generated !== 'number' || !Number.isFinite(generated) || generated <= 0) return false;
  if (typeof last !== 'number' || !Number.isFinite(last) || last <= 0) return false;
  if (typeof age !== 'number' || !Number.isFinite(age) || age < 0) return false;
  if (typeof value['softStale'] !== 'boolean') return false;
  if (typeof value['hardStale'] !== 'boolean') return false;
  if (typeof softSec !== 'number' || !Number.isFinite(softSec) || softSec <= 0) return false;
  if (typeof hardSec !== 'number' || !Number.isFinite(hardSec) || hardSec <= softSec) return false;
  return true;
}

function isRegimeTelemetryBlock(value: unknown): boolean {
  if (!isRecord(value)) return false;
  for (const key of [
    'realizedVolShort',
    'realizedVolLong',
    'volRatio',
    'trendStrength',
    'compression',
  ]) {
    const v = value[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) return false;
  }
  return true;
}

function isRegimeMetadataBlock(value: unknown): boolean {
  if (!isRecord(value)) return false;
  for (const key of ['source', 'network', 'symbol', 'timeframe']) {
    if (typeof value[key] !== 'string' || (value[key] as string).length === 0) return false;
  }
  return true;
}

function isRegimeBlock(value: unknown): value is RegimeBlock {
  if (!isRecord(value)) return false;
  if (!VALID_MARKET_REGIMES.has(value['regime'] as string)) return false;
  if (!isRegimeTelemetryBlock(value['telemetry'])) return false;
  if (!isRegimeClmmSuitabilityBlock(value['clmmSuitability'])) return false;
  if (!Array.isArray(value['marketReasons'])) return false;
  if (!(value['marketReasons'] as unknown[]).every(isRegimeReasonBlock)) return false;
  if (!isRegimeFreshnessBlock(value['freshness'])) return false;
  if (!isRegimeMetadataBlock(value['metadata'])) return false;
  return true;
}
```

Also add `RegimeTelemetry` to the existing imports at the top of the file:

```ts
import type {
  RegimeBlock,
  RegimeReason,
  RegimeClmmSuitability,
  RegimeFreshness,
  RegimeReasonSeverity,
  RegimeTelemetry,
} from '@clmm/application/public';
```

(`RegimeTelemetry` is imported for type clarity even though `isRegimeTelemetryBlock` returns `boolean`.)

- [ ] **Step 2: Run the focused tests**

Run: `pnpm --filter @clmm/app test -- src/api/regime.test.ts`
Expected: PASS for all cases — happy path, deprecated-shape rejections, missing-metadata rejection, and the previously existing 404/null-regime/malformed cases.

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/api/regime.ts
git commit -m "feat(app): enforce new RegimeBlock shape in fetchCurrentRegime"
```

---

## Phase 4 — View model rewrite

`RegimeViewModel` becomes the single source of interpretation. The 48-hour rule is removed. All formatting, sorting, and dedupe lives here.

### Task 8: Rewrite `RegimeViewModel.test.ts` with the new contract

**Files:**

- Test: `packages/ui/src/view-models/RegimeViewModel.test.ts`

- [ ] **Step 1: Replace the entire file**

```ts
import { describe, expect, it } from 'vitest';
import type { RegimeBlock } from '@clmm/application/public';
import { buildRegimeViewModelBlock } from './RegimeViewModel.js';

const GENERATED = 1_700_000_000_000;
const LAST_CANDLE = GENERATED - 87 * 60_000;

function makeBlock(overrides: Partial<RegimeBlock> = {}): RegimeBlock {
  return {
    regime: 'CHOP',
    telemetry: {
      realizedVolShort: 0.007,
      realizedVolLong: 0.0107,
      volRatio: 1.06,
      trendStrength: 0.00018,
      compression: 0.0092,
    },
    clmmSuitability: { status: 'CAUTION', reasons: [] },
    marketReasons: [],
    freshness: {
      generatedAtUnixMs: GENERATED,
      lastCandleUnixMs: LAST_CANDLE,
      ageSeconds: 87 * 60,
      softStale: true,
      hardStale: false,
      softStaleSeconds: 75 * 60,
      hardStaleSeconds: 90 * 60,
    },
    metadata: {
      source: 'geckoterminal',
      network: 'solana',
      symbol: 'SOL/USDC',
      timeframe: '1h',
    },
    ...overrides,
  };
}

describe('buildRegimeViewModelBlock — data quality', () => {
  it('classifies Fresh when neither flag is set', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        freshness: {
          generatedAtUnixMs: GENERATED,
          lastCandleUnixMs: LAST_CANDLE,
          ageSeconds: 60,
          softStale: false,
          hardStale: false,
          softStaleSeconds: 75 * 60,
          hardStaleSeconds: 90 * 60,
        },
      }),
      GENERATED + 60_000,
    );
    expect(vm.dataQualityLabel).toMatch(/fresh/i);
    expect(vm.dataQualityTone).toBe('success');
  });

  it('classifies Soft-stale when softStale is true and hardStale is false', () => {
    const vm = buildRegimeViewModelBlock(makeBlock(), GENERATED + 60_000);
    expect(vm.dataQualityLabel).toMatch(/soft-?stale/i);
    expect(vm.dataQualityTone).toBe('warning');
  });

  it('classifies Hard-stale when hardStale is true (regardless of softStale)', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        freshness: {
          generatedAtUnixMs: GENERATED,
          lastCandleUnixMs: LAST_CANDLE,
          ageSeconds: 95 * 60,
          softStale: true,
          hardStale: true,
          softStaleSeconds: 75 * 60,
          hardStaleSeconds: 90 * 60,
        },
      }),
      GENERATED + 60_000,
    );
    expect(vm.dataQualityLabel).toMatch(/hard-?stale/i);
    expect(vm.dataQualityTone).toBe('danger');
  });

  it('classifies Hard-stale when only hardStale is true (false softStale ignored)', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        freshness: {
          generatedAtUnixMs: GENERATED,
          lastCandleUnixMs: LAST_CANDLE,
          ageSeconds: 95 * 60,
          softStale: false,
          hardStale: true,
          softStaleSeconds: 75 * 60,
          hardStaleSeconds: 90 * 60,
        },
      }),
      GENERATED + 60_000,
    );
    expect(vm.dataQualityLabel).toMatch(/hard-?stale/i);
    expect(vm.dataQualityTone).toBe('danger');
  });

  it('does NOT mark stale based on local 48h rule when upstream flags are false', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        freshness: {
          generatedAtUnixMs: GENERATED - 49 * 3_600_000,
          lastCandleUnixMs: GENERATED - 49 * 3_600_000 - 60_000,
          ageSeconds: 60,
          softStale: false,
          hardStale: false,
          softStaleSeconds: 75 * 60,
          hardStaleSeconds: 90 * 60,
        },
      }),
      GENERATED,
    );
    expect(vm.dataQualityTone).toBe('success');
  });
});

describe('buildRegimeViewModelBlock — labels', () => {
  it('uses the spec suitability copy (CAUTION)', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({ clmmSuitability: { status: 'CAUTION', reasons: [] } }),
      GENERATED,
    );
    expect(vm.suitabilityLabel).toBe('CLMM caution');
  });

  it('uses the spec suitability copy (ALLOWED)', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({ clmmSuitability: { status: 'ALLOWED', reasons: [] } }),
      GENERATED,
    );
    expect(vm.suitabilityLabel).toBe('CLMM suitable');
  });

  it('uses the spec suitability copy (BLOCKED)', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({ clmmSuitability: { status: 'BLOCKED', reasons: [] } }),
      GENERATED,
    );
    expect(vm.suitabilityLabel).toBe('CLMM not recommended');
  });

  it('uses the spec suitability copy (UNKNOWN)', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({ clmmSuitability: { status: 'UNKNOWN', reasons: [] } }),
      GENERATED,
    );
    expect(vm.suitabilityLabel).toBe('CLMM suitability unknown');
  });

  it('renders source label from metadata.source (no MCO fallback)', () => {
    const vm = buildRegimeViewModelBlock(makeBlock(), GENERATED);
    expect(vm.sourceLabel).toBe('GeckoTerminal · SOL/USDC · 1h');
  });

  it('formats generatedAge using elapsed time', () => {
    const vm = buildRegimeViewModelBlock(makeBlock(), GENERATED + 12 * 60_000);
    expect(vm.generatedAgeLabel).toBe('Generated 12m ago');
  });

  it('formats latestCandleAge from ageSeconds', () => {
    const vm = buildRegimeViewModelBlock(makeBlock(), GENERATED);
    expect(vm.latestCandleAgeLabel).toBe('Latest candle is 87m old');
  });

  it('renders compact telemetry with qualitative trend label and vol ratio', () => {
    const vm = buildRegimeViewModelBlock(makeBlock(), GENERATED);
    expect(vm.compactTelemetryLabel).toBe('Trend flat · Vol ratio 1.06x');
  });

  it('does not render Trend strength as a 0–1 ratio in any label', () => {
    const vm = buildRegimeViewModelBlock(makeBlock(), GENERATED);
    expect(vm.compactTelemetryLabel).not.toContain('/ 1.00');
    expect(vm.expandedTelemetryRows.find((r) => r.label === 'Trend strength')?.value).not.toContain(
      '/ 1.00',
    );
  });
});

describe('buildRegimeViewModelBlock — display reasons', () => {
  it('sorts reasons by severity ERROR > WARN > INFO', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        marketReasons: [
          { severity: 'INFO', text: 'Momentum positive' },
          { severity: 'ERROR', text: 'Candle gap detected' },
          { severity: 'WARN', text: 'Elevated volatility' },
        ],
      }),
      GENERATED,
    );
    expect(vm.displayReasons.map((r) => r.text)).toEqual([
      'Candle gap detected',
      'Elevated volatility',
      'Momentum positive',
    ]);
  });

  it('uses source order as a tie-breaker within the same severity', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        marketReasons: [
          { severity: 'WARN', text: 'First warn' },
          { severity: 'WARN', text: 'Second warn' },
        ],
      }),
      GENERATED,
    );
    expect(vm.displayReasons.map((r) => r.text)).toEqual(['First warn', 'Second warn']);
  });

  it('dedupes by code when present', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        clmmSuitability: {
          status: 'CAUTION',
          reasons: [{ severity: 'WARN', text: 'A', code: 'X' }],
        },
        marketReasons: [{ severity: 'WARN', text: 'B', code: 'X' }],
      }),
      GENERATED,
    );
    expect(vm.displayReasons.length).toBe(1);
  });

  it('dedupes by normalized text when code is absent', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        clmmSuitability: {
          status: 'CAUTION',
          reasons: [{ severity: 'WARN', text: 'Elevated  Volatility' }],
        },
        marketReasons: [{ severity: 'WARN', text: 'elevated volatility' }],
      }),
      GENERATED,
    );
    expect(vm.displayReasons.length).toBe(1);
  });

  it('collapses any code containing STALE or text containing stale into one freshness reason', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        clmmSuitability: {
          status: 'CAUTION',
          reasons: [{ severity: 'WARN', text: 'Data is soft-stale', code: 'DATA_SOFT_STALE' }],
        },
        marketReasons: [
          { severity: 'WARN', text: 'Stale signals due to old candles' },
          { severity: 'WARN', text: 'Latest candle is past hard-stale threshold' },
        ],
      }),
      GENERATED,
    );
    const stale = vm.displayReasons.filter((r) => /stale/i.test(r.text));
    expect(stale.length).toBe(1);
  });

  it('exposes exactly one primaryDisplayReason', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        marketReasons: [
          { severity: 'INFO', text: 'Momentum positive' },
          { severity: 'WARN', text: 'Elevated volatility' },
        ],
      }),
      GENERATED,
    );
    expect(vm.primaryDisplayReason?.text).toBe('Elevated volatility');
  });

  it('returns null primaryDisplayReason when no reasons exist', () => {
    const vm = buildRegimeViewModelBlock(makeBlock({ marketReasons: [] }), GENERATED);
    expect(vm.primaryDisplayReason).toBeNull();
  });
});

describe('buildRegimeViewModelBlock — expanded rows', () => {
  it('expandedTelemetryRows includes all five telemetry numbers', () => {
    const vm = buildRegimeViewModelBlock(makeBlock(), GENERATED);
    const labels = vm.expandedTelemetryRows.map((r) => r.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        'Trend strength',
        'Realized vol short',
        'Realized vol long',
        'Volatility ratio',
        'Compression',
      ]),
    );
  });

  it('expandedSampleRows includes samples and provenance', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        metadata: {
          source: 'geckoterminal',
          network: 'solana',
          symbol: 'SOL/USDC',
          timeframe: '1h',
          sourceTimeframe: '15m',
          sourceCandleCount: 346,
          candleCount: 86,
          derivedTimeframe: '1h',
          aggregationVersion: 'ohlcv-agg-v1',
        },
      }),
      GENERATED,
    );
    const sampleRows = vm.expandedSampleRows.map((r) => r.label);
    expect(sampleRows).toEqual(
      expect.arrayContaining(['Samples', 'Source candles', 'Derived timeframe', 'Aggregation']),
    );
  });

  it('expandedFreshnessRows includes both thresholds and the latest-candle clock', () => {
    const vm = buildRegimeViewModelBlock(makeBlock(), GENERATED);
    const labels = vm.expandedFreshnessRows.map((r) => r.label);
    expect(labels).toEqual(
      expect.arrayContaining(['Latest candle', 'Soft stale threshold', 'Hard stale threshold']),
    );
  });
});
```

- [ ] **Step 2: Run the focused VM tests (still on the old VM)**

Run: `pnpm --filter @clmm/ui test -- view-models/RegimeViewModel.test.ts`
Expected: every case fails — the old VM neither exposes the new fields nor uses the new copy.

- [ ] **Step 3: Commit (red-state TDD checkpoint)**

```bash
git add packages/ui/src/view-models/RegimeViewModel.test.ts
git commit -m "test(ui): require new RegimeViewModel contract per regime card refresh spec"
```

### Task 9: Implement the new `RegimeViewModel`

**Files:**

- Modify: `packages/ui/src/view-models/RegimeViewModel.ts`

- [ ] **Step 1: Replace the entire file with the new view model**

```ts
import type {
  RegimeBlock,
  RegimeReason,
  RegimeReasonSeverity,
  ClmmSuitabilityStatus,
} from '@clmm/application/public';

export type RegimeDetailRow = {
  label: string;
  value: string;
  tone?: 'default' | 'muted' | 'warning' | 'danger' | 'success';
};

export type RegimeDataQualityTone = 'success' | 'warning' | 'danger';

export type RegimeViewModelBlock = {
  regimeLabel: string;
  suitabilityLabel: string;
  suitabilityStatus: ClmmSuitabilityStatus;
  suitabilityTone: RegimeDataQualityTone | 'muted';
  dataQualityLabel: string;
  dataQualityTone: RegimeDataQualityTone;
  generatedAgeLabel: string;
  latestCandleAgeLabel: string;
  sourceLabel: string;
  compactTelemetryLabel: string;
  primaryDisplayReason: RegimeReason | null;
  displayReasons: RegimeReason[];
  expandedTelemetryRows: RegimeDetailRow[];
  expandedSampleRows: RegimeDetailRow[];
  expandedFreshnessRows: RegimeDetailRow[];
};

const SEVERITY_ORDER: Record<RegimeReasonSeverity, number> = { ERROR: 0, WARN: 1, INFO: 2 };

const REGIME_LABELS: Record<string, string> = {
  UP: '▲ Uptrend regime',
  DOWN: '▼ Downtrend regime',
  CHOP: '◆ Choppy regime',
};

const SUITABILITY_LABELS: Record<ClmmSuitabilityStatus, string> = {
  ALLOWED: 'CLMM suitable',
  CAUTION: 'CLMM caution',
  BLOCKED: 'CLMM not recommended',
  UNKNOWN: 'CLMM suitability unknown',
};

const SOURCE_DISPLAY: Record<string, string> = {
  geckoterminal: 'GeckoTerminal',
};

function classifyDataQuality(
  softStale: boolean,
  hardStale: boolean,
): { label: string; tone: RegimeDataQualityTone } {
  if (hardStale) return { label: 'Hard-stale', tone: 'danger' };
  if (softStale) return { label: 'Soft-stale', tone: 'warning' };
  return { label: 'Fresh', tone: 'success' };
}

function suitabilityTone(status: ClmmSuitabilityStatus): RegimeDataQualityTone | 'muted' {
  switch (status) {
    case 'ALLOWED':
      return 'success';
    case 'CAUTION':
      return 'warning';
    case 'BLOCKED':
      return 'danger';
    default:
      return 'muted';
  }
}

function formatMinutesAgo(elapsedMs: number): string {
  const minutes = Math.max(0, Math.round(elapsedMs / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}

function formatSecondsThreshold(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}

function trendQualitative(strength: number): string {
  const abs = Math.abs(strength);
  if (abs < 0.001) return 'Trend flat';
  if (strength > 0) return 'Trend up';
  return 'Trend down';
}

function displaySource(source: string): string {
  const lower = source.toLowerCase();
  return SOURCE_DISPLAY[lower] ?? source;
}

function normalizeText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function dedupeKey(reason: RegimeReason): string {
  if (reason.code && reason.code.toUpperCase().includes('STALE')) return 'stale-category';
  if (normalizeText(reason.text).includes('stale')) return 'stale-category';
  if (reason.code) return `code:${reason.code}`;
  return `text:${normalizeText(reason.text)}`;
}

function buildDisplayReasons(block: RegimeBlock): RegimeReason[] {
  const merged: { reason: RegimeReason; sourceIndex: number }[] = [];
  for (const r of block.clmmSuitability.reasons) {
    merged.push({ reason: r, sourceIndex: merged.length });
  }
  for (const r of block.marketReasons) {
    merged.push({ reason: r, sourceIndex: merged.length });
  }
  merged.sort((a, b) => {
    const sev = (SEVERITY_ORDER[a.reason.severity] ?? 9) - (SEVERITY_ORDER[b.reason.severity] ?? 9);
    if (sev !== 0) return sev;
    return a.sourceIndex - b.sourceIndex;
  });
  const seen = new Set<string>();
  const out: RegimeReason[] = [];
  for (const { reason } of merged) {
    const key = dedupeKey(reason);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(reason);
  }
  return out;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatRatio(value: number): string {
  return `${value.toFixed(2)}x`;
}

function buildTelemetryRows(block: RegimeBlock): RegimeDetailRow[] {
  return [
    { label: 'Trend strength', value: block.telemetry.trendStrength.toFixed(5) },
    { label: 'Realized vol short', value: formatPercent(block.telemetry.realizedVolShort) },
    { label: 'Realized vol long', value: formatPercent(block.telemetry.realizedVolLong) },
    { label: 'Volatility ratio', value: formatRatio(block.telemetry.volRatio) },
    { label: 'Compression', value: formatPercent(block.telemetry.compression) },
  ];
}

function buildSampleRows(block: RegimeBlock): RegimeDetailRow[] {
  const rows: RegimeDetailRow[] = [];
  if (block.metadata.candleCount !== undefined) {
    rows.push({ label: 'Samples', value: `${block.metadata.candleCount} closed candles` });
  }
  if (block.metadata.sourceCandleCount !== undefined && block.metadata.sourceTimeframe) {
    rows.push({
      label: 'Source candles',
      value: `${block.metadata.sourceCandleCount} x ${block.metadata.sourceTimeframe}`,
    });
  }
  if (block.metadata.derivedTimeframe) {
    rows.push({ label: 'Derived timeframe', value: block.metadata.derivedTimeframe });
  }
  if (block.metadata.aggregationVersion) {
    rows.push({ label: 'Aggregation', value: block.metadata.aggregationVersion });
  }
  if (block.metadata.engineVersion) {
    rows.push({ label: 'Engine', value: block.metadata.engineVersion });
  }
  if (block.metadata.configVersion) {
    rows.push({ label: 'Config', value: block.metadata.configVersion });
  }
  return rows;
}

function buildFreshnessRows(block: RegimeBlock): RegimeDetailRow[] {
  return [
    {
      label: 'Latest candle',
      value: `${formatMinutesAgo(block.freshness.ageSeconds * 1000)} old`,
      tone: block.freshness.hardStale
        ? 'danger'
        : block.freshness.softStale
          ? 'warning'
          : 'default',
    },
    {
      label: 'Soft stale threshold',
      value: formatSecondsThreshold(block.freshness.softStaleSeconds),
      tone: 'muted',
    },
    {
      label: 'Hard stale threshold',
      value: formatSecondsThreshold(block.freshness.hardStaleSeconds),
      tone: 'muted',
    },
  ];
}

export function buildRegimeViewModelBlock(block: RegimeBlock, now: number): RegimeViewModelBlock {
  const dataQuality = classifyDataQuality(block.freshness.softStale, block.freshness.hardStale);
  const generatedElapsedMs = Math.max(0, now - block.freshness.generatedAtUnixMs);
  const generatedAgeLabel = `Generated ${formatMinutesAgo(generatedElapsedMs)} ago`;
  const latestCandleAgeLabel = `Latest candle is ${formatMinutesAgo(
    block.freshness.ageSeconds * 1000,
  )} old`;
  const sourceLabel = `${displaySource(block.metadata.source)} · ${block.metadata.symbol} · ${block.metadata.timeframe}`;
  const compactTelemetryLabel = `${trendQualitative(block.telemetry.trendStrength)} · Vol ratio ${formatRatio(
    block.telemetry.volRatio,
  )}`;

  const displayReasons = buildDisplayReasons(block);

  return {
    regimeLabel: REGIME_LABELS[block.regime] ?? block.regime,
    suitabilityLabel: SUITABILITY_LABELS[block.clmmSuitability.status],
    suitabilityStatus: block.clmmSuitability.status,
    suitabilityTone: suitabilityTone(block.clmmSuitability.status),
    dataQualityLabel: dataQuality.label,
    dataQualityTone: dataQuality.tone,
    generatedAgeLabel,
    latestCandleAgeLabel,
    sourceLabel,
    compactTelemetryLabel,
    primaryDisplayReason: displayReasons[0] ?? null,
    displayReasons,
    expandedTelemetryRows: buildTelemetryRows(block),
    expandedSampleRows: buildSampleRows(block),
    expandedFreshnessRows: buildFreshnessRows(block),
  };
}
```

- [ ] **Step 2: Run the focused VM tests**

Run: `pnpm --filter @clmm/ui test -- view-models/RegimeViewModel.test.ts`
Expected: PASS for every case.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/view-models/RegimeViewModel.ts
git commit -m "feat(ui): rewrite RegimeViewModel with structured rows, data-quality classification, and dedupe"
```

---

## Phase 5 — `RegimeSection` rewrite

`RegimeSection` becomes a thin renderer of the view model, with explicit show/hide details.

### Task 10: Rewrite `RegimeSection.test.tsx` for the new contract

**Files:**

- Test: `packages/ui/src/components/RegimeSection.test.tsx`

- [ ] **Step 1: Replace the entire file**

```tsx
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { RegimeBlock } from '@clmm/application/public';
import { RegimeSection } from './RegimeSection.js';

afterEach(() => {
  cleanup();
});

const GENERATED = 1_700_000_000_000;
const LAST_CANDLE = GENERATED - 87 * 60_000;

const baseBlock: RegimeBlock = {
  regime: 'CHOP',
  telemetry: {
    realizedVolShort: 0.007,
    realizedVolLong: 0.0107,
    volRatio: 1.06,
    trendStrength: 0.00018,
    compression: 0.0092,
  },
  clmmSuitability: {
    status: 'CAUTION',
    reasons: [{ severity: 'WARN', text: 'Latest candle is past soft-stale threshold' }],
  },
  marketReasons: [],
  freshness: {
    generatedAtUnixMs: GENERATED,
    lastCandleUnixMs: LAST_CANDLE,
    ageSeconds: 87 * 60,
    softStale: true,
    hardStale: false,
    softStaleSeconds: 75 * 60,
    hardStaleSeconds: 90 * 60,
  },
  metadata: {
    source: 'geckoterminal',
    network: 'solana',
    symbol: 'SOL/USDC',
    timeframe: '1h',
    sourceTimeframe: '15m',
    sourceCandleCount: 346,
    candleCount: 86,
    derivedTimeframe: '1h',
    aggregationVersion: 'ohlcv-agg-v1',
  },
};

describe('RegimeSection', () => {
  it('returns null when no data and not loading', () => {
    const { container } = render(
      <RegimeSection
        regime={undefined}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        now={GENERATED}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows skeleton when loading with no data', () => {
    render(
      <RegimeSection
        regime={undefined}
        isLoading
        isError={false}
        isUnsupported={false}
        now={GENERATED}
      />,
    );
    expect(screen.getByTestId('regime-section-skeleton')).toBeTruthy();
  });

  it('shows unavailable copy with not-found reason', () => {
    render(
      <RegimeSection
        regime={null}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        unavailableReason="not-found"
        now={GENERATED}
      />,
    );
    expect(screen.getByText('Market data not available yet')).toBeTruthy();
  });

  it('renders unavailable copy when isUnsupported with no regime data', () => {
    render(
      <RegimeSection
        regime={undefined}
        isLoading={false}
        isError={false}
        isUnsupported
        now={GENERATED}
      />,
    );
    expect(screen.getByText('Regime analysis unavailable')).toBeTruthy();
  });

  it('renders regime label, suitability, data quality, source, and primary reason in collapsed mode', () => {
    render(
      <RegimeSection
        regime={baseBlock}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        now={GENERATED + 12 * 60_000}
      />,
    );
    expect(screen.getByText('◆ Choppy regime')).toBeTruthy();
    expect(screen.getByText(/CLMM caution/)).toBeTruthy();
    expect(screen.getByText(/soft-?stale/i)).toBeTruthy();
    expect(screen.getByText(/Latest candle is 87m old/)).toBeTruthy();
    expect(screen.getByText(/Trend flat · Vol ratio 1\.06x/)).toBeTruthy();
    expect(screen.getByText(/Generated 12m ago/)).toBeTruthy();
    expect(screen.getByText(/GeckoTerminal · SOL\/USDC · 1h/)).toBeTruthy();
    expect(screen.getByText('Show details')).toBeTruthy();
  });

  it('renders only one reason in collapsed mode', () => {
    const block: RegimeBlock = {
      ...baseBlock,
      clmmSuitability: {
        status: 'CAUTION',
        reasons: [
          { severity: 'WARN', text: 'Latest candle is past soft-stale threshold' },
          { severity: 'INFO', text: 'Momentum still constructive' },
        ],
      },
      marketReasons: [{ severity: 'INFO', text: 'Volume tapering' }],
    };
    render(
      <RegimeSection
        regime={block}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        now={GENERATED}
      />,
    );
    expect(screen.queryByText('Momentum still constructive')).toBeNull();
    expect(screen.queryByText('Volume tapering')).toBeNull();
  });

  it('toggles to expanded mode with Show details and renders structured rows', () => {
    render(
      <RegimeSection
        regime={baseBlock}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        now={GENERATED}
      />,
    );
    fireEvent.click(screen.getByText('Show details'));
    expect(screen.getByText('Hide details')).toBeTruthy();
    expect(screen.getByText('Trend strength')).toBeTruthy();
    expect(screen.getByText('Realized vol short')).toBeTruthy();
    expect(screen.getByText('Volatility ratio')).toBeTruthy();
    expect(screen.getByText('Compression')).toBeTruthy();
    expect(screen.getByText('Samples')).toBeTruthy();
    expect(screen.getByText('Source candles')).toBeTruthy();
    expect(screen.getByText('Soft stale threshold')).toBeTruthy();
    expect(screen.getByText('Hard stale threshold')).toBeTruthy();
  });

  it('renders the degraded banner when isError with cached regime data', () => {
    render(
      <RegimeSection
        regime={baseBlock}
        isLoading={false}
        isError
        isUnsupported={false}
        now={GENERATED}
      />,
    );
    expect(screen.getByText('Refresh failed — showing last available analysis.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the focused component tests (still on the old component)**

Run: `pnpm --filter @clmm/ui test -- components/RegimeSection.test.tsx`
Expected: many FAILS — old component does not render the new labels, has no Show/Hide details, and uses the old VM properties.

- [ ] **Step 3: Commit (red-state TDD checkpoint)**

```bash
git add packages/ui/src/components/RegimeSection.test.tsx
git commit -m "test(ui): require new RegimeSection contract with show/hide details"
```

### Task 11: Rewrite `RegimeSection.tsx` to render the new view model

**Files:**

- Modify: `packages/ui/src/components/RegimeSection.tsx`

- [ ] **Step 1: Replace the entire file**

```tsx
import { useState } from 'react';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import type { RegimeBlock } from '@clmm/application/public';
import { colors, typography } from '../design-system/index.js';
import { buildRegimeViewModelBlock, type RegimeDetailRow } from '../view-models/RegimeViewModel.js';

type RegimeUnavailableReason = 'not-found' | 'config-error' | 'upstream-error';

type Props = {
  regime: RegimeBlock | null | undefined;
  isLoading: boolean;
  isError: boolean;
  isUnsupported: boolean;
  unavailableReason?: RegimeUnavailableReason | null;
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

function mapUnavailableCopy(reason: RegimeUnavailableReason): string {
  switch (reason) {
    case 'not-found':
      return 'Market data not available yet';
    case 'config-error':
    case 'upstream-error':
      return 'Market context unavailable';
  }
}

function toneColor(
  tone: 'default' | 'muted' | 'warning' | 'danger' | 'success' | undefined,
): string {
  switch (tone) {
    case 'success':
      return colors.safe;
    case 'warning':
      return colors.warn;
    case 'danger':
      return colors.breachAccent;
    case 'muted':
      return colors.textTertiary;
    default:
      return colors.textBody;
  }
}

function DetailRows({ rows }: { rows: RegimeDetailRow[] }): JSX.Element {
  return (
    <View>
      {rows.map((row) => (
        <View
          key={row.label}
          style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}
        >
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: typography.fontSize.xs,
            }}
          >
            {row.label}
          </Text>
          <Text style={{ color: toneColor(row.tone), fontSize: typography.fontSize.xs }}>
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function RegimeSection({
  regime,
  isLoading,
  isError,
  isUnsupported,
  unavailableReason,
  now,
}: Props): JSX.Element | null {
  const [expanded, setExpanded] = useState(false);

  if (!isLoading && regime === undefined && !isError && !isUnsupported) {
    return null;
  }

  if (isLoading && regime == null) {
    return (
      <View testID="regime-section-skeleton" style={{ ...cardStyle, alignItems: 'center' }}>
        <ActivityIndicator color={colors.safe} />
      </View>
    );
  }

  if (regime == null) {
    return (
      <View style={cardStyle}>
        <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
          Regime analysis unavailable
        </Text>
        {unavailableReason ? (
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: typography.fontSize.sm,
              marginTop: 4,
            }}
          >
            {mapUnavailableCopy(unavailableReason)}
          </Text>
        ) : null}
      </View>
    );
  }

  const vm = buildRegimeViewModelBlock(regime, now);
  const showDegraded = isError && !isUnsupported;

  return (
    <View style={cardStyle}>
      <Text
        style={{
          color: colors.textPrimary,
          fontSize: typography.fontSize.sm,
          fontWeight: typography.fontWeight.semibold,
        }}
      >
        {vm.regimeLabel}
      </Text>
      <Text
        style={{
          color: toneColor(vm.suitabilityTone),
          fontSize: typography.fontSize.sm,
          marginTop: 4,
        }}
      >
        {vm.suitabilityLabel} · data {vm.dataQualityLabel.toLowerCase()}
      </Text>
      {vm.primaryDisplayReason ? (
        <Text
          style={{
            color: colors.textBody,
            fontSize: typography.fontSize.xs,
            marginTop: 4,
          }}
        >
          {vm.primaryDisplayReason.text}
        </Text>
      ) : null}
      <Text
        style={{
          color: colors.textBody,
          fontSize: typography.fontSize.xs,
          marginTop: 4,
        }}
      >
        {vm.latestCandleAgeLabel}
      </Text>
      <Text
        style={{
          color: colors.textBody,
          fontSize: typography.fontSize.xs,
          marginTop: 4,
        }}
      >
        {vm.compactTelemetryLabel}
      </Text>
      <Text
        style={{
          color: colors.textTertiary,
          fontSize: typography.fontSize.xs,
          marginTop: 4,
        }}
      >
        {vm.generatedAgeLabel} · Source: {vm.sourceLabel}
      </Text>
      {expanded ? (
        <View style={{ marginTop: 8 }}>
          <DetailRows rows={vm.expandedTelemetryRows} />
          <View style={{ marginTop: 8 }}>
            <DetailRows rows={vm.expandedSampleRows} />
          </View>
          <View style={{ marginTop: 8 }}>
            <DetailRows rows={vm.expandedFreshnessRows} />
          </View>
        </View>
      ) : null}
      <Pressable onPress={() => setExpanded((prev) => !prev)} style={{ marginTop: 8 }}>
        <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs }}>
          {expanded ? 'Hide details' : 'Show details'}
        </Text>
      </Pressable>
      {showDegraded ? (
        <Text style={{ color: colors.warn, fontSize: typography.fontSize.xs, marginTop: 4 }}>
          Refresh failed — showing last available analysis.
        </Text>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 2: Run the focused component tests**

Run: `pnpm --filter @clmm/ui test -- components/RegimeSection.test.tsx`
Expected: PASS for every case.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/RegimeSection.tsx
git commit -m "feat(ui): rewrite RegimeSection with show/hide details and view-model-driven rendering"
```

---

## Phase 6 — Cross-package verification & cleanup

### Task 12: Run full repo verification

**Files:** none

- [ ] **Step 1: Build everything**

Run: `pnpm build`
Expected: clean. No TypeScript errors, no boundary violations.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: clean.

- [ ] **Step 4: Boundaries**

Run: `pnpm boundaries`
Expected: clean.

- [ ] **Step 5: Full test suite**

Run: `pnpm test`
Expected: all tests pass. If a test outside the regime path fails because it imported the removed top-level `trendStrength`, `volRatio`, or `capturedAtUnixMs`, fix the fixture in place to use the new shape — do not reintroduce the old fields.

- [ ] **Step 6: If any fixture was updated in step 5, commit**

```bash
git add <files>
git commit -m "test: update unrelated fixtures to new RegimeBlock shape"
```

### Task 13: Smoke verify positions screen renders the refreshed card

**Files:** none

- [ ] **Step 1: Start the BFF and mobile dev server (best effort)**

Run the existing local dev workflow per the repo's bootstrap docs (e.g. `pnpm --filter @clmm/app start` and the BFF entry point). If the local environment can't reach a real `regime-engine`, pick a known-supported pool and confirm:

1. The card renders the new collapsed copy: regime label, "CLMM …" suitability, data-quality status, latest candle age, compact telemetry, generated age, and `Source: GeckoTerminal · SOL/USDC · 1h`.
2. Tapping `Show details` reveals telemetry, samples, and freshness threshold rows.
3. Tapping `Hide details` collapses back.
4. With a forced 4xx upstream stub, the card renders the unavailable copy.

Capture a screenshot or a short note recording each verification. If the local environment can't run the app, state that explicitly when reporting completion and rely on the test suite as evidence.

### Task 14: Final coherence sweep

**Files:** none

- [ ] **Step 1: Search for any lingering references to removed fields**

Run: `git grep -nE "capturedAtUnixMs|\.trendStrength\b|\.volRatio\b" packages apps`
Expected: no hits in `packages/application`, `packages/adapters`, `packages/ui`, or `apps/app` outside of telemetry-nested usages (`telemetry.trendStrength`, `telemetry.volRatio`). If a stray top-level reference appears, fix it and commit:

```bash
git add <file>
git commit -m "refactor: remove residual reference to deprecated RegimeBlock field"
```

- [ ] **Step 2: Confirm `MEMORY.md` and `docs/solutions/` need no update**

The contract refresh is a one-shot migration with no reusable institutional learning yet. If the implementation surfaces a non-obvious gotcha (e.g. an unexpected upstream payload shape), capture it via Compound Engineering as a follow-up — not as part of this plan.

---

## Done When

- `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm boundaries`, `pnpm test` all pass on the branch.
- `RegimeBlock` exposes only the normalized fields: `regime`, `telemetry`, `clmmSuitability`, `marketReasons`, `freshness` (two clocks + thresholds), `metadata` (required `source`/`network`/`symbol`/`timeframe`).
- `capturedAtUnixMs`, top-level `trendStrength`, and top-level `volRatio` are not referenced anywhere outside this plan's spec doc.
- `RegimeSection` renders explicit `Show details` / `Hide details` and a collapsed/expanded layout matching the spec target copy.
- `RegimeViewModel` owns all sorting, dedupe, label, tone, and data-quality classification.
- The 48-hour local stale rule is gone.
