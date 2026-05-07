# Regime Engine V2 S/R Theses Market Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface regime-engine v2 structured S/R theses (bias, setup, levels, targets, invalidation, trigger, attribution, freshness) in the positions market-context section, with v1 `SrLevelsCard` as a fallback when v2 is unavailable.

**Architecture:** Add a parallel v2 read path alongside the existing v1 S/R and v1 regime paths. New DTOs and a `SrThesesReadPort` live in `packages/application`; a new `CurrentSrThesesAdapter` and `SrThesesController` live in `packages/adapters`; a new `apps/app/src/api/srTheses.ts` BFF client and a TanStack Query in the positions route fetch theses pool-scoped. `SrInsightsSection` becomes the orchestrator that prefers v2, falls back to v1 `SrLevelsCard`, and renders unavailable copy otherwise. No chart overlay is rendered in this issue, but a UI-ready overlay model is derived in the v2 view model.

**Tech Stack:** TypeScript, NestJS (BFF), Vitest, React Native + react-native-web (Expo Router), TanStack Query.

**Spec:** `docs/superpowers/specs/2026-05-07-sr-theses-v2-market-context-design.md`.

**Conventions in this codebase (read once before starting):**

- Application owns DTOs and ports in `packages/application/src/dto/` and `packages/application/src/ports/index.ts`. The public surface is `packages/application/src/public/index.ts` (used by `@clmm/application/public` from UI and app); the internal surface is `packages/application/src/index.ts` (used by `@clmm/application` from adapters).
- Adapters never appear in application imports. UI imports only `@clmm/application/public`. The app imports `@clmm/application/public` and never the adapters.
- BFF controllers live under `packages/adapters/src/inbound/http/`. DI tokens are string constants in `packages/adapters/src/inbound/http/tokens.ts`. Provider wiring is in `packages/adapters/src/inbound/http/AppModule.ts`.
- Tests use Vitest with `describe` / `it` / `expect`. Adapter tests stub `fetch` via `vi.stubGlobal('fetch', vi.fn())` (see `CurrentSrLevelsAdapter.test.ts`).
- All inter-package imports use `.js` extensions in source, even though the source is `.ts`. Match the existing style.
- Frequent commits: every task ends with one commit. Conventional commit prefixes: `feat:`, `test:`, `refactor:`, `fix:`, `docs:`.

**Verification cadence:** After every task, run `pnpm --filter <package> test` for the package(s) you touched. After Task 7 (BFF), Task 8 (app API), Task 12 (UI integration), and Task 13 (app wiring), additionally run `pnpm typecheck && pnpm lint && pnpm boundaries`. Run the full `pnpm build && pnpm typecheck && pnpm lint && pnpm boundaries && pnpm test` at the end of Task 14.

---

## File Structure

Files this plan will create or modify, grouped by responsibility.

**Application (DTOs and port):**

- Create `packages/application/src/dto/srTheses.ts` — `SrThesisDto`, `SrThesesBlock` types
- Modify `packages/application/src/dto/index.ts` — re-export the new types
- Modify `packages/application/src/ports/index.ts` — add `SrThesesReadResult`, `SrThesesReadPort`
- Modify `packages/application/src/public/index.ts` — expose `SrThesisDto`, `SrThesesBlock` to UI/app
- Create `packages/application/src/public/srTheses.exports.test.ts` — compile-time check the public surface exposes v2 DTOs and the strings stay open

**Adapter (regime-engine v2 fetch):**

- Create `packages/adapters/src/outbound/regime-engine/CurrentSrThesesAdapter.ts` — implements `SrThesesReadPort`
- Create `packages/adapters/src/outbound/regime-engine/CurrentSrThesesAdapter.test.ts`

**BFF (controller + module wiring):**

- Modify `packages/adapters/src/inbound/http/tokens.ts` — add `SR_THESES_READ_PORT`, `SR_THESES_POOL_ALLOWLIST`
- Create `packages/adapters/src/inbound/http/SrThesesController.ts`
- Create `packages/adapters/src/inbound/http/SrThesesController.test.ts`
- Create `packages/adapters/src/inbound/http/SrThesesAllowlist.test.ts` — production wiring guard
- Modify `packages/adapters/src/inbound/http/AppModule.ts` — register adapter, controller, allowlist

**App (BFF client + query wiring):**

- Create `apps/app/src/api/srTheses.ts`
- Create `apps/app/src/api/srTheses.test.ts`
- Modify `apps/app/app/(tabs)/positions.tsx` — add `srThesesQuery`, pass props to screen

**UI (view model, components, orchestration):**

- Create `packages/ui/src/view-models/SrThesesViewModel.ts`
- Create `packages/ui/src/view-models/SrThesesViewModel.test.ts`
- Create `packages/ui/src/components/SrThesisCard.tsx`
- Create `packages/ui/src/components/SrThesisCard.test.tsx`
- Create `packages/ui/src/components/SrThesesPanel.tsx`
- Create `packages/ui/src/components/SrThesesPanel.test.tsx`
- Modify `packages/ui/src/components/SrInsightsSection.tsx` — accept v2 props, prefer v2, fall back to v1
- Modify `packages/ui/src/components/SrInsightsSection.test.tsx` — add v2 / v1 / unavailable scenarios
- Modify `packages/ui/src/screens/PositionsListScreen.tsx` — accept v2 props, forward to `SrInsightsSection`
- Modify `packages/ui/src/screens/PositionsListScreen.test.tsx` — assert v2 panel renders and v1 fallback path
- Modify `packages/ui/src/index.ts` — re-export `buildSrThesesViewModel` for testing

---

## Task 1: Application — V2 DTOs

**Files:**

- Create: `packages/application/src/dto/srTheses.ts`
- Modify: `packages/application/src/dto/index.ts`

- [ ] **Step 1: Write the new DTO file**

Create `packages/application/src/dto/srTheses.ts`:

```ts
// V2 S/R thesis DTOs — emitted by regime-engine GET /v2/sr-levels/current.
// `bias`, `setupType`, and `sourceReliability` are intentionally `string`
// (or `string | null`) — they MUST NOT be narrowed to enums anywhere in
// adapters, ports, BFF, app client, or UI. UI may map known strings to
// presentation tone but must not reject unknown values.
export type SrThesisDto = {
  asset: string;
  timeframe: string;
  bias: string | null;
  setupType: string | null;
  supportLevels: string[];
  resistanceLevels: string[];
  entryZone: string | null;
  targets: string[];
  invalidation: string | null;
  trigger: string | null;
  chartReference: string | null;
  sourceHandle: string;
  sourceChannel: string | null;
  sourceKind: string;
  sourceReliability: string | null;
  rawThesisText: string | null;
  collectedAt: string | null;
  publishedAt: string | null;
  sourceUrl: string | null;
  notes: string | null;
};

export type SrThesesBlock = {
  schemaVersion: '2.0';
  source: string;
  symbol: string;
  brief: {
    briefId: string;
    sourceRecordedAtIso: string | null;
    summary: string | null;
  };
  capturedAtIso: string;
  capturedAtUnixMs: number;
  theses: SrThesisDto[];
};
```

- [ ] **Step 2: Re-export from DTO index**

Edit `packages/application/src/dto/index.ts`. After the existing `export type {` block at the bottom that re-exports regime types (around lines 330–337), add:

```ts
export type { SrThesisDto, SrThesesBlock } from './srTheses.js';
```

- [ ] **Step 3: Run application package build**

Run: `pnpm --filter @clmm/application build`
Expected: PASS (no TS errors).

- [ ] **Step 4: Commit**

```bash
git add packages/application/src/dto/srTheses.ts packages/application/src/dto/index.ts
git commit -m "feat(application): add v2 S/R thesis DTOs"
```

---

## Task 2: Application — V2 Read Port

**Files:**

- Modify: `packages/application/src/ports/index.ts`

- [ ] **Step 1: Add the port and result type**

Edit `packages/application/src/ports/index.ts`. Find the existing `SrLevelsReadPort` export at the comment `--- S/R levels read port (application-owned; CurrentSrLevelsAdapter implements) ---`. After that interface (and before the next `--- Regime read port ---` comment block), add:

```ts
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
```

Also update the existing `import type { SrLevelsBlock, RegimeBlock } from '../dto/index.js';` line near the top of the file to also import `SrThesesBlock`:

```ts
import type { SrLevelsBlock, RegimeBlock, SrThesesBlock } from '../dto/index.js';
```

- [ ] **Step 2: Run application package build**

Run: `pnpm --filter @clmm/application build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/application/src/ports/index.ts
git commit -m "feat(application): add SrThesesReadPort and SrThesesReadResult"
```

---

## Task 3: Application — Public Surface + Compile-Time Test

**Files:**

- Modify: `packages/application/src/public/index.ts`
- Create: `packages/application/src/public/srTheses.exports.test.ts`

- [ ] **Step 1: Expose v2 DTOs on the public surface**

Edit `packages/application/src/public/index.ts`. In the first DTO `export type {` block (the one that already lists `SrLevel`, `SrLevelsBlock`, `RegimeBlock`, etc.), add `SrThesisDto` and `SrThesesBlock`:

```ts
export type {
  // ... existing entries ...
  SrLevel,
  SrLevelsBlock,
  SrThesisDto,
  SrThesesBlock,
  RegimeBlock,
  // ... rest of existing entries ...
} from '../dto/index.js';
```

(`SrThesesReadPort` and `SrThesesReadResult` are NOT exported through `public` — they are application-internal and consumed by adapters via `@clmm/application` instead. This matches how `SrLevelsReadPort` and `RegimeReadPort` are handled.)

- [ ] **Step 2: Write the compile-time exports test**

Create `packages/application/src/public/srTheses.exports.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { SrThesisDto, SrThesesBlock } from './index.js';

describe('public surface — v2 sr-theses', () => {
  it('preserves SrThesesBlock schemaVersion as the literal "2.0"', () => {
    // Compile-time check: schemaVersion must be the literal '2.0'.
    const block: SrThesesBlock = {
      schemaVersion: '2.0',
      source: 'openclaw',
      symbol: 'SOL/USDC',
      brief: { briefId: 'brief-1', sourceRecordedAtIso: null, summary: null },
      capturedAtIso: '2026-05-07T00:00:00Z',
      capturedAtUnixMs: 0,
      theses: [],
    };
    expect(block.schemaVersion).toBe('2.0');
  });

  it('keeps bias, setupType, and sourceReliability open as string | null', () => {
    // Compile-time check: assigning unknown strings must succeed.
    const thesis: SrThesisDto = {
      asset: 'SOL/USDC',
      timeframe: '4h',
      bias: 'mildly-constructive-but-cautious',
      setupType: 'distribution-into-vwap',
      supportLevels: [],
      resistanceLevels: [],
      entryZone: null,
      targets: [],
      invalidation: null,
      trigger: null,
      chartReference: null,
      sourceHandle: 'analyst',
      sourceChannel: null,
      sourceKind: 'twitter',
      sourceReliability: 'tier-experimental-2026',
      rawThesisText: null,
      collectedAt: null,
      publishedAt: null,
      sourceUrl: null,
      notes: null,
    };
    expect(thesis.bias).toBe('mildly-constructive-but-cautious');
    expect(thesis.setupType).toBe('distribution-into-vwap');
    expect(thesis.sourceReliability).toBe('tier-experimental-2026');
  });
});
```

- [ ] **Step 3: Run the test**

Run: `pnpm --filter @clmm/application test -- srTheses.exports`
Expected: PASS (2 tests).

- [ ] **Step 4: Commit**

```bash
git add packages/application/src/public/index.ts packages/application/src/public/srTheses.exports.test.ts
git commit -m "feat(application): expose v2 S/R thesis DTOs on public surface"
```

---

## Task 4: Adapter — `CurrentSrThesesAdapter` (TDD)

**Files:**

- Create: `packages/adapters/src/outbound/regime-engine/CurrentSrThesesAdapter.ts`
- Test: `packages/adapters/src/outbound/regime-engine/CurrentSrThesesAdapter.test.ts`

This is the largest adapter task. Tests cover all 16 spec bullets under "Adapter" and "Testing Strategy → Adapter". We write all tests first (RED), then the implementation (GREEN). Within this task, run vitest after each implementation function fills in to keep the cycle tight.

- [ ] **Step 1: Write the failing test file**

Create `packages/adapters/src/outbound/regime-engine/CurrentSrThesesAdapter.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CurrentSrThesesAdapter } from './CurrentSrThesesAdapter.js';
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

const SAMPLE_THESIS = {
  asset: 'SOL/USDC',
  timeframe: '4h',
  bias: 'bullish',
  setupType: 'breakout',
  supportLevels: ['132', '128'],
  resistanceLevels: ['148', '152'],
  entryZone: '135-138',
  targets: ['148', '152'],
  invalidation: '128',
  trigger: 'close above 145',
  chartReference: 'https://example.com/chart',
  sourceHandle: 'analyst42',
  sourceChannel: 'twitter',
  sourceKind: 'twitter',
  sourceReliability: 'high',
  rawThesisText: 'SOL looking strong above 145.',
  collectedAt: '2026-05-07T01:00:00Z',
  publishedAt: '2026-05-07T00:30:00Z',
  sourceUrl: 'https://twitter.com/analyst42/status/1',
  notes: 'first thesis of the week',
};

const SAMPLE_BLOCK = {
  schemaVersion: '2.0',
  source: 'openclaw',
  symbol: 'SOL/USDC',
  brief: {
    briefId: 'brief-1',
    sourceRecordedAtIso: '2026-05-07T00:00:00Z',
    summary: 'Constructive setup forming.',
  },
  capturedAtIso: '2026-05-07T02:00:00Z',
  theses: [SAMPLE_THESIS],
};

describe('CurrentSrThesesAdapter', () => {
  let obs: ReturnType<typeof createFakeObservability>;

  beforeEach(() => {
    obs = createFakeObservability();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns kind:"block" with parsed SrThesesBlock on 200', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(SAMPLE_BLOCK), { status: 200 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('block');
    if (result.kind !== 'block') return;
    expect(result.block.schemaVersion).toBe('2.0');
    expect(result.block.source).toBe('openclaw');
    expect(result.block.symbol).toBe('SOL/USDC');
    expect(result.block.theses).toHaveLength(1);
    expect(result.block.theses[0]!.bias).toBe('bullish');
    expect(result.block.capturedAtUnixMs).toBe(Date.parse('2026-05-07T02:00:00Z'));
  });

  it('hits /v2/sr-levels/current with URL-encoded symbol and source', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(SAMPLE_BLOCK), { status: 200 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(calledUrl).toContain('/v2/sr-levels/current');
    expect(calledUrl).toContain('symbol=SOL%2FUSDC');
    expect(calledUrl).toContain('source=openclaw');
  });

  it('does not send auth headers (public read)', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(SAMPLE_BLOCK), { status: 200 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    const opts = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit | undefined;
    expect(opts?.headers).toBeUndefined();
  });

  it('returns kind:"config-error" when baseUrl is null', async () => {
    const adapter = new CurrentSrThesesAdapter(null, obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('config-error');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns kind:"config-error" when baseUrl is malformed', async () => {
    const adapter = new CurrentSrThesesAdapter('not a url', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('config-error');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns kind:"not-found" on 404', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('not-found');
  });

  it('returns kind:"not-found" when 200 body has empty theses array', async () => {
    const emptyBody = { ...SAMPLE_BLOCK, theses: [] };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(emptyBody), { status: 200 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('not-found');
  });

  it('returns kind:"config-error" on 400', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: 'bad' }), { status: 400 }),
    );
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('config-error');
    expect(fetch).toHaveBeenCalledTimes(1); // 400 must not retry
  });

  it('retries once on 503 then returns kind:"upstream-error"', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('upstream-error');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('retries once on 500 then returns kind:"upstream-error"', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('upstream-error');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('retries once on network error then returns kind:"upstream-error"', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('upstream-error');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('retries once on timeout (AbortError) then returns kind:"upstream-error"', async () => {
    vi.mocked(fetch).mockImplementation(() =>
      Promise.reject(new DOMException('aborted', 'AbortError')),
    );
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('upstream-error');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('retries once on malformed JSON then returns kind:"upstream-error"', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('not-json', { status: 200 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('upstream-error');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('retries once on malformed response shape then returns kind:"upstream-error"', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ unexpected: true }), { status: 200 }),
    );
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('upstream-error');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('retry succeeds on the second attempt', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(SAMPLE_BLOCK), { status: 200 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('block');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('returns kind:"upstream-error" on invalid capturedAtIso', async () => {
    const bad = { ...SAMPLE_BLOCK, capturedAtIso: 'not-a-date' };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(bad), { status: 200 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('upstream-error');
  });

  it('preserves unknown strings for bias, setupType, and sourceReliability', async () => {
    const exotic = {
      ...SAMPLE_BLOCK,
      theses: [
        {
          ...SAMPLE_THESIS,
          bias: 'mildly-constructive-but-cautious',
          setupType: 'distribution-into-vwap',
          sourceReliability: 'tier-experimental-2026',
        },
      ],
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(exotic), { status: 200 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('block');
    if (result.kind !== 'block') return;
    expect(result.block.theses[0]!.bias).toBe('mildly-constructive-but-cautious');
    expect(result.block.theses[0]!.setupType).toBe('distribution-into-vwap');
    expect(result.block.theses[0]!.sourceReliability).toBe('tier-experimental-2026');
  });

  it('preserves nullable fields as null (not stripped)', async () => {
    const allNulls = {
      ...SAMPLE_BLOCK,
      theses: [
        {
          asset: 'SOL/USDC',
          timeframe: '4h',
          bias: null,
          setupType: null,
          supportLevels: [],
          resistanceLevels: [],
          entryZone: null,
          targets: [],
          invalidation: null,
          trigger: null,
          chartReference: null,
          sourceHandle: 'a',
          sourceChannel: null,
          sourceKind: 'twitter',
          sourceReliability: null,
          rawThesisText: null,
          collectedAt: null,
          publishedAt: null,
          sourceUrl: null,
          notes: null,
        },
      ],
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(allNulls), { status: 200 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('block');
    if (result.kind !== 'block') return;
    const t = result.block.theses[0]!;
    expect(t.bias).toBeNull();
    expect(t.setupType).toBeNull();
    expect(t.entryZone).toBeNull();
    expect(t.invalidation).toBeNull();
    expect(t.trigger).toBeNull();
    expect(t.chartReference).toBeNull();
    expect(t.sourceChannel).toBeNull();
    expect(t.sourceReliability).toBeNull();
    expect(t.rawThesisText).toBeNull();
    expect(t.collectedAt).toBeNull();
    expect(t.publishedAt).toBeNull();
    expect(t.sourceUrl).toBeNull();
    expect(t.notes).toBeNull();
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run: `pnpm --filter @clmm/adapters test -- CurrentSrThesesAdapter`
Expected: FAIL — `Cannot find module './CurrentSrThesesAdapter.js'`.

- [ ] **Step 3: Write the implementation**

Create `packages/adapters/src/outbound/regime-engine/CurrentSrThesesAdapter.ts`. The shape mirrors `CurrentRegimeAdapter` (URL building, retry policy, error envelope), but parses the v2 thesis payload.

```ts
import type {
  ObservabilityPort,
  SrThesesReadPort,
  SrThesesReadResult,
  SrThesisDto,
  SrThesesBlock,
} from '@clmm/application';

const FETCH_TIMEOUT_MS = 2000;
const RETRY_DELAY_MS = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  return null;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return null;
    out.push(item);
  }
  return out;
}

function parseThesis(raw: unknown): SrThesisDto | null {
  if (!isRecord(raw)) return null;
  const asset = raw['asset'];
  const timeframe = raw['timeframe'];
  const sourceHandle = raw['sourceHandle'];
  const sourceKind = raw['sourceKind'];
  if (typeof asset !== 'string') return null;
  if (typeof timeframe !== 'string') return null;
  if (typeof sourceHandle !== 'string') return null;
  if (typeof sourceKind !== 'string') return null;
  const supportLevels = stringArray(raw['supportLevels']);
  const resistanceLevels = stringArray(raw['resistanceLevels']);
  const targets = stringArray(raw['targets']);
  if (!supportLevels || !resistanceLevels || !targets) return null;
  return {
    asset,
    timeframe,
    bias: nullableString(raw['bias']),
    setupType: nullableString(raw['setupType']),
    supportLevels,
    resistanceLevels,
    entryZone: nullableString(raw['entryZone']),
    targets,
    invalidation: nullableString(raw['invalidation']),
    trigger: nullableString(raw['trigger']),
    chartReference: nullableString(raw['chartReference']),
    sourceHandle,
    sourceChannel: nullableString(raw['sourceChannel']),
    sourceKind,
    sourceReliability: nullableString(raw['sourceReliability']),
    rawThesisText: nullableString(raw['rawThesisText']),
    collectedAt: nullableString(raw['collectedAt']),
    publishedAt: nullableString(raw['publishedAt']),
    sourceUrl: nullableString(raw['sourceUrl']),
    notes: nullableString(raw['notes']),
  };
}

function parseBlock(data: unknown): SrThesesBlock | null {
  if (!isRecord(data)) return null;
  if (data['schemaVersion'] !== '2.0') return null;
  const source = data['source'];
  const symbol = data['symbol'];
  const capturedAtIso = data['capturedAtIso'];
  if (typeof source !== 'string') return null;
  if (typeof symbol !== 'string') return null;
  if (typeof capturedAtIso !== 'string') return null;
  const capturedAtUnixMs = Date.parse(capturedAtIso);
  if (!Number.isFinite(capturedAtUnixMs)) return null;
  const briefRaw = data['brief'];
  if (!isRecord(briefRaw)) return null;
  const briefId = briefRaw['briefId'];
  if (typeof briefId !== 'string') return null;
  const brief = {
    briefId,
    sourceRecordedAtIso: nullableString(briefRaw['sourceRecordedAtIso']),
    summary: nullableString(briefRaw['summary']),
  };
  const thesesRaw = data['theses'];
  if (!Array.isArray(thesesRaw)) return null;
  const theses: SrThesisDto[] = [];
  for (const item of thesesRaw) {
    const thesis = parseThesis(item);
    if (!thesis) return null;
    theses.push(thesis);
  }
  return {
    schemaVersion: '2.0',
    source,
    symbol,
    brief,
    capturedAtIso,
    capturedAtUnixMs,
    theses,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type AttemptOutcome =
  | { kind: 'block'; block: SrThesesBlock }
  | { kind: 'not-found' }
  | { kind: 'config-error' }
  | { kind: 'retryable'; reason: string }
  | { kind: 'upstream-fatal'; reason: string };

export class CurrentSrThesesAdapter implements SrThesesReadPort {
  constructor(
    private readonly baseUrl: string | null,
    private readonly observability: ObservabilityPort,
  ) {}

  async fetchCurrent(symbol: string, source: string): Promise<SrThesesReadResult> {
    if (!this.baseUrl) {
      this.observability.log('warn', 'SR theses disabled — no REGIME_ENGINE_BASE_URL configured');
      return { kind: 'config-error' };
    }
    let url: URL;
    try {
      url = new URL(`${this.baseUrl.replace(/\/+$/, '')}/v2/sr-levels/current`);
    } catch {
      this.observability.log('warn', 'SR theses base URL is malformed', { baseUrl: this.baseUrl });
      return { kind: 'config-error' };
    }
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('source', source);

    const first = await this.attempt(url);
    if (first.kind !== 'retryable') {
      return this.toResult(first);
    }
    await delay(RETRY_DELAY_MS);
    const second = await this.attempt(url);
    if (second.kind === 'retryable') {
      return { kind: 'upstream-error' };
    }
    return this.toResult(second);
  }

  private toResult(outcome: AttemptOutcome): SrThesesReadResult {
    switch (outcome.kind) {
      case 'block':
        return { kind: 'block', block: outcome.block };
      case 'not-found':
        return { kind: 'not-found' };
      case 'config-error':
        return { kind: 'config-error' };
      case 'retryable':
      case 'upstream-fatal':
        return { kind: 'upstream-error' };
    }
  }

  private async attempt(url: URL): Promise<AttemptOutcome> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url.toString(), { signal: controller.signal });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.observability.log('warn', 'SR theses fetch network error', { message });
      return { kind: 'retryable', reason: 'network' };
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 200) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        this.observability.log('warn', 'SR theses response was not valid JSON');
        return { kind: 'retryable', reason: 'invalid-json' };
      }
      const block = parseBlock(body);
      if (!block) {
        this.observability.log('warn', 'SR theses response failed shape validation');
        return { kind: 'retryable', reason: 'invalid-shape' };
      }
      if (block.theses.length === 0) {
        return { kind: 'not-found' };
      }
      return { kind: 'block', block };
    }

    if (response.status === 404) {
      return { kind: 'not-found' };
    }

    if (response.status === 400) {
      this.observability.log('warn', 'SR theses upstream rejected request as 400', {});
      return { kind: 'config-error' };
    }

    if (response.status === 503 || response.status >= 500) {
      this.observability.log('warn', 'SR theses upstream non-2xx (retryable)', {
        status: response.status,
      });
      return { kind: 'retryable', reason: `status-${response.status}` };
    }

    this.observability.log('warn', 'SR theses upstream non-2xx (fatal)', {
      status: response.status,
    });
    return { kind: 'upstream-fatal', reason: `status-${response.status}` };
  }
}
```

- [ ] **Step 4: Run the tests until green**

Run: `pnpm --filter @clmm/adapters test -- CurrentSrThesesAdapter`
Expected: PASS (all 18 tests).

If any test fails, fix the implementation. Do NOT modify the test expectations to match incorrect behaviour.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/outbound/regime-engine/CurrentSrThesesAdapter.ts packages/adapters/src/outbound/regime-engine/CurrentSrThesesAdapter.test.ts
git commit -m "feat(adapters): add CurrentSrThesesAdapter for v2 S/R theses"
```

---

## Task 5: BFF — DI Tokens

**Files:**

- Modify: `packages/adapters/src/inbound/http/tokens.ts`

- [ ] **Step 1: Add the two new tokens**

Edit `packages/adapters/src/inbound/http/tokens.ts`. After the existing `REGIME_POOL_ALLOWLIST` line at the bottom, add:

```ts
export const SR_THESES_READ_PORT = 'SR_THESES_READ_PORT';
export const SR_THESES_POOL_ALLOWLIST = 'SR_THESES_POOL_ALLOWLIST';
```

- [ ] **Step 2: Run adapters package build**

Run: `pnpm --filter @clmm/adapters build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/adapters/src/inbound/http/tokens.ts
git commit -m "feat(adapters): add SR_THESES DI tokens"
```

---

## Task 6: BFF — `SrThesesController` (TDD)

**Files:**

- Create: `packages/adapters/src/inbound/http/SrThesesController.ts`
- Test: `packages/adapters/src/inbound/http/SrThesesController.test.ts`
- Test: `packages/adapters/src/inbound/http/SrThesesAllowlist.test.ts`

- [ ] **Step 1: Write the failing controller test**

Create `packages/adapters/src/inbound/http/SrThesesController.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { SrThesesController } from './SrThesesController.js';
import type { SrThesesReadPort, SrThesesReadResult, SrThesesBlock } from '@clmm/application';

const SOL_USDC_POOL_ID = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';
const UNSUPPORTED_POOL_ID = 'Pool111111111111111111111111111111111111111';

function fixtureBlock(): SrThesesBlock {
  return {
    schemaVersion: '2.0',
    source: 'openclaw',
    symbol: 'SOL/USDC',
    brief: { briefId: 'brief-1', sourceRecordedAtIso: null, summary: null },
    capturedAtIso: '2026-05-07T00:00:00Z',
    capturedAtUnixMs: Date.parse('2026-05-07T00:00:00Z'),
    theses: [],
  };
}

function makeAllowlist(
  entries: Array<[string, { symbol: string; source: string }]> = [
    [SOL_USDC_POOL_ID, { symbol: 'SOL/USDC', source: 'openclaw' }],
  ],
): Map<string, { symbol: string; source: string }> {
  return new Map(entries);
}

function makePort(result: SrThesesReadResult): SrThesesReadPort {
  return { fetchCurrent: vi.fn().mockResolvedValue(result) };
}

describe('SrThesesController', () => {
  it('returns { srTheses: block } for an allowlisted pool when port resolves a block', async () => {
    const block = fixtureBlock();
    const port = makePort({ kind: 'block', block });
    const controller = new SrThesesController(port, makeAllowlist());

    const result = await controller.getCurrent(SOL_USDC_POOL_ID);

    expect(result).toEqual({ srTheses: block });
    expect(port.fetchCurrent).toHaveBeenCalledWith('SOL/USDC', 'openclaw');
  });

  it('maps not-found to { srTheses: null, unavailableReason: "not-found" }', async () => {
    const controller = new SrThesesController(makePort({ kind: 'not-found' }), makeAllowlist());
    const result = await controller.getCurrent(SOL_USDC_POOL_ID);
    expect(result).toEqual({ srTheses: null, unavailableReason: 'not-found' });
  });

  it('maps config-error to { srTheses: null, unavailableReason: "config-error" }', async () => {
    const controller = new SrThesesController(makePort({ kind: 'config-error' }), makeAllowlist());
    const result = await controller.getCurrent(SOL_USDC_POOL_ID);
    expect(result).toEqual({ srTheses: null, unavailableReason: 'config-error' });
  });

  it('maps upstream-error to { srTheses: null, unavailableReason: "upstream-error" }', async () => {
    const controller = new SrThesesController(
      makePort({ kind: 'upstream-error' }),
      makeAllowlist(),
    );
    const result = await controller.getCurrent(SOL_USDC_POOL_ID);
    expect(result).toEqual({ srTheses: null, unavailableReason: 'upstream-error' });
  });

  it('throws NotFoundException for an unsupported pool', async () => {
    const port = makePort({ kind: 'not-found' });
    const controller = new SrThesesController(port, makeAllowlist());
    await expect(controller.getCurrent(UNSUPPORTED_POOL_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(port.fetchCurrent).not.toHaveBeenCalled();
  });

  it('resolves the (symbol, source) pair from the allowlist entry (defaults to openclaw)', async () => {
    const port = makePort({ kind: 'not-found' });
    const customAllowlist = makeAllowlist([
      ['CustomPool11111111111111111111111111111111', { symbol: 'BTC/USDC', source: 'openclaw' }],
    ]);
    const controller = new SrThesesController(port, customAllowlist);
    await controller.getCurrent('CustomPool11111111111111111111111111111111');
    expect(port.fetchCurrent).toHaveBeenCalledWith('BTC/USDC', 'openclaw');
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run: `pnpm --filter @clmm/adapters test -- SrThesesController`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the controller implementation**

Create `packages/adapters/src/inbound/http/SrThesesController.ts`:

```ts
import { Controller, Get, Inject, NotFoundException, Param } from '@nestjs/common';
import type { SrThesesReadPort, SrThesesReadResult } from '@clmm/application';
import { SR_THESES_READ_PORT, SR_THESES_POOL_ALLOWLIST } from './tokens.js';

@Controller('sr-theses')
export class SrThesesController {
  constructor(
    @Inject(SR_THESES_READ_PORT)
    private readonly srThesesPort: SrThesesReadPort,
    @Inject(SR_THESES_POOL_ALLOWLIST)
    private readonly srThesesAllowlist: Map<string, { symbol: string; source: string }>,
  ) {}

  @Get('pools/:poolId/current')
  async getCurrent(@Param('poolId') poolId: string) {
    const entry = this.srThesesAllowlist.get(poolId);
    if (!entry) {
      throw new NotFoundException(`Pool not supported: ${poolId}`);
    }
    const result = await this.srThesesPort.fetchCurrent(entry.symbol, entry.source);
    return this.mapResult(result);
  }

  private mapResult(result: SrThesesReadResult) {
    switch (result.kind) {
      case 'block':
        return { srTheses: result.block };
      case 'not-found':
        return { srTheses: null, unavailableReason: 'not-found' as const };
      case 'config-error':
        return { srTheses: null, unavailableReason: 'config-error' as const };
      case 'upstream-error':
        return { srTheses: null, unavailableReason: 'upstream-error' as const };
    }
  }
}
```

- [ ] **Step 4: Run the controller tests**

Run: `pnpm --filter @clmm/adapters test -- SrThesesController`
Expected: PASS (6 tests).

- [ ] **Step 5: Write the production-wiring allowlist test**

Create `packages/adapters/src/inbound/http/SrThesesAllowlist.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makePoolId } from '@clmm/domain';
import { SR_THESES_POOL_ALLOWLIST_MAP } from './AppModule.js';

const ORCA_SOL_USDC_004_WHIRLPOOL = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';

describe('SR_THESES_POOL_ALLOWLIST_MAP production wiring', () => {
  it('has at least one pool entry so the v2 thesis path is active in production', () => {
    expect(SR_THESES_POOL_ALLOWLIST_MAP.size).toBeGreaterThan(0);
  });

  it('maps the Orca SOL/USDC 0.04% whirlpool to source "openclaw"', () => {
    const poolId = makePoolId(ORCA_SOL_USDC_004_WHIRLPOOL);
    const entry = SR_THESES_POOL_ALLOWLIST_MAP.get(poolId);
    expect(entry).toEqual({ symbol: 'SOL/USDC', source: 'openclaw' });
  });

  it('uses a valid Solana base58 public key as the allowlist key (32-44 chars, base58 alphabet)', () => {
    const base58 = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;
    for (const poolId of SR_THESES_POOL_ALLOWLIST_MAP.keys()) {
      expect(poolId.length).toBeGreaterThanOrEqual(32);
      expect(poolId.length).toBeLessThanOrEqual(44);
      expect(base58.test(poolId)).toBe(true);
    }
  });
});
```

This test will FAIL initially because `SR_THESES_POOL_ALLOWLIST_MAP` is not yet exported from `AppModule.ts`. We will fix that in Task 7.

- [ ] **Step 6: Commit**

```bash
git add packages/adapters/src/inbound/http/SrThesesController.ts packages/adapters/src/inbound/http/SrThesesController.test.ts packages/adapters/src/inbound/http/SrThesesAllowlist.test.ts
git commit -m "feat(adapters): add SrThesesController for v2 BFF route"
```

---

## Task 7: BFF — Wire Adapter, Allowlist, Controller in AppModule

**Files:**

- Modify: `packages/adapters/src/inbound/http/AppModule.ts`

- [ ] **Step 1: Add the v2 allowlist constant + adapter instance**

Edit `packages/adapters/src/inbound/http/AppModule.ts`.

(a) In the imports near the top, add `CurrentSrThesesAdapter` and `SrThesesController`:

```ts
import { CurrentSrThesesAdapter } from '../../outbound/regime-engine/CurrentSrThesesAdapter.js';
import { SrThesesController } from './SrThesesController.js';
```

(b) In the existing token imports from `./tokens.js`, add `SR_THESES_READ_PORT` and `SR_THESES_POOL_ALLOWLIST`:

```ts
import {
  // ... existing tokens ...
  REGIME_POOL_ALLOWLIST,
  SR_THESES_READ_PORT,
  SR_THESES_POOL_ALLOWLIST,
} from './tokens.js';
```

(c) After the existing `const currentRegimeAdapter = new CurrentRegimeAdapter(...)` instantiation, add:

```ts
const currentSrThesesAdapter = new CurrentSrThesesAdapter(regimeEngineBaseUrl, telemetry);
```

(d) After the existing `REGIME_POOL_ALLOWLIST_MAP` export near the bottom, add the new v2 allowlist:

```ts
export const SR_THESES_POOL_ALLOWLIST_MAP = new Map<string, { symbol: string; source: string }>([
  ['Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE', { symbol: 'SOL/USDC', source: 'openclaw' }],
]);
```

(e) In the `@Module({ controllers: [...] })` array, add `SrThesesController` (e.g. after `RegimeController`):

```ts
controllers: [
  HealthController,
  PositionController,
  SrLevelsController,
  RegimeController,
  SrThesesController,
  InsightsDataController,
  AlertController,
  PreviewController,
  ExecutionController,
  WalletController,
],
```

(f) In the `providers: [...]` array, add the two new entries (e.g. after the `REGIME_POOL_ALLOWLIST` provider):

```ts
{ provide: SR_THESES_READ_PORT, useValue: currentSrThesesAdapter },
{ provide: SR_THESES_POOL_ALLOWLIST, useValue: SR_THESES_POOL_ALLOWLIST_MAP },
```

- [ ] **Step 2: Run adapter and controller tests together**

Run: `pnpm --filter @clmm/adapters test -- SrThesesController SrThesesAllowlist CurrentSrThesesAdapter`
Expected: PASS (controller 6 + allowlist 3 + adapter 18 = 27 tests).

- [ ] **Step 3: Run the full adapters test suite**

Run: `pnpm --filter @clmm/adapters test`
Expected: PASS — no other tests should regress.

- [ ] **Step 4: Run cross-package checks**

Run: `pnpm typecheck && pnpm lint && pnpm boundaries`
Expected: PASS — boundaries must still allow the new adapter file's imports.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/inbound/http/AppModule.ts
git commit -m "feat(adapters): wire SR_THESES adapter, allowlist, and controller in AppModule"
```

---

## Task 8: App API Client — `fetchCurrentSrTheses` (TDD)

**Files:**

- Create: `apps/app/src/api/srTheses.ts`
- Test: `apps/app/src/api/srTheses.test.ts`

The shape mirrors `apps/app/src/api/regime.ts`. We re-implement validation here because the app must not import from adapters and the public DTO doesn't carry runtime guards.

- [ ] **Step 1: Write the failing test**

Create `apps/app/src/api/srTheses.test.ts`. Use `apps/app/src/api/regime.test.ts` and `apps/app/src/api/srLevels.test.ts` as references for stub style (they're in the same directory).

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchCurrentSrTheses,
  SrThesesUnsupportedPoolError,
  isSrThesesUnsupportedPoolError,
} from './srTheses';

const POOL_ID = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';
const UNSUPPORTED_POOL_ID = 'Pool111111111111111111111111111111111111111';

const SAMPLE_BLOCK = {
  schemaVersion: '2.0',
  source: 'openclaw',
  symbol: 'SOL/USDC',
  brief: { briefId: 'brief-1', sourceRecordedAtIso: null, summary: null },
  capturedAtIso: '2026-05-07T00:00:00Z',
  capturedAtUnixMs: Date.parse('2026-05-07T00:00:00Z'),
  theses: [
    {
      asset: 'SOL/USDC',
      timeframe: '4h',
      bias: 'bullish',
      setupType: 'breakout',
      supportLevels: ['132'],
      resistanceLevels: ['148'],
      entryZone: '135-138',
      targets: ['148'],
      invalidation: '128',
      trigger: 'close above 145',
      chartReference: null,
      sourceHandle: 'analyst42',
      sourceChannel: 'twitter',
      sourceKind: 'twitter',
      sourceReliability: 'high',
      rawThesisText: 'SOL strong above 145.',
      collectedAt: '2026-05-07T01:00:00Z',
      publishedAt: '2026-05-07T00:30:00Z',
      sourceUrl: null,
      notes: null,
    },
  ],
};

describe('fetchCurrentSrTheses', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns { srTheses: block } on a valid 200 envelope', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ srTheses: SAMPLE_BLOCK }), { status: 200 }),
    );
    const result = await fetchCurrentSrTheses(POOL_ID);
    expect(result.srTheses).not.toBeNull();
    expect(result.srTheses!.symbol).toBe('SOL/USDC');
    expect(result.unavailableReason).toBeUndefined();
  });

  it('returns { srTheses: null, unavailableReason } for each documented reason', async () => {
    for (const reason of ['not-found', 'config-error', 'upstream-error'] as const) {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ srTheses: null, unavailableReason: reason }), {
          status: 200,
        }),
      );
      const result = await fetchCurrentSrTheses(POOL_ID);
      expect(result).toEqual({ srTheses: null, unavailableReason: reason });
    }
  });

  it('throws SrThesesUnsupportedPoolError when BFF returns 404 with "not supported" body', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: `Pool not supported: ${UNSUPPORTED_POOL_ID}` }), {
        status: 404,
      }),
    );
    const error = await fetchCurrentSrTheses(UNSUPPORTED_POOL_ID).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SrThesesUnsupportedPoolError);
    expect(isSrThesesUnsupportedPoolError(error)).toBe(true);
  });

  it('throws a generic endpoint-not-found error on 404 without "not supported" body', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 }),
    );
    const error = await fetchCurrentSrTheses(POOL_ID).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(isSrThesesUnsupportedPoolError(error)).toBe(false);
    expect((error as Error).message).toContain('endpoint not found');
  });

  it('throws on 5xx with detail message', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('boom', { status: 500 }));
    const error = await fetchCurrentSrTheses(POOL_ID).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('boom');
  });

  it('throws timeout error on AbortError', async () => {
    vi.mocked(fetch).mockImplementation(() =>
      Promise.reject(new DOMException('aborted', 'AbortError')),
    );
    const error = await fetchCurrentSrTheses(POOL_ID).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('timed out');
  });

  it('rejects malformed envelope (non-object body)', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify('not-an-object'), { status: 200 }),
    );
    const error = await fetchCurrentSrTheses(POOL_ID).catch((e: unknown) => e);
    expect((error as Error).message).toContain('malformed response');
  });

  it('rejects malformed srTheses block (wrong schemaVersion)', async () => {
    const bad = { ...SAMPLE_BLOCK, schemaVersion: '1.0' };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ srTheses: bad }), { status: 200 }),
    );
    const error = await fetchCurrentSrTheses(POOL_ID).catch((e: unknown) => e);
    expect((error as Error).message).toContain('malformed srTheses block');
  });

  it('accepts unknown bias / setupType / sourceReliability strings', async () => {
    const exotic = {
      ...SAMPLE_BLOCK,
      theses: [
        {
          ...SAMPLE_BLOCK.theses[0],
          bias: 'mildly-constructive-but-cautious',
          setupType: 'distribution-into-vwap',
          sourceReliability: 'tier-experimental-2026',
        },
      ],
    };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ srTheses: exotic }), { status: 200 }),
    );
    const result = await fetchCurrentSrTheses(POOL_ID);
    expect(result.srTheses!.theses[0]!.bias).toBe('mildly-constructive-but-cautious');
    expect(result.srTheses!.theses[0]!.setupType).toBe('distribution-into-vwap');
    expect(result.srTheses!.theses[0]!.sourceReliability).toBe('tier-experimental-2026');
  });

  it('accepts nullable string fields as null', async () => {
    const allNulls = {
      ...SAMPLE_BLOCK,
      theses: [
        {
          ...SAMPLE_BLOCK.theses[0],
          bias: null,
          setupType: null,
          entryZone: null,
          invalidation: null,
          trigger: null,
          chartReference: null,
          sourceChannel: null,
          sourceReliability: null,
          rawThesisText: null,
          collectedAt: null,
          publishedAt: null,
          sourceUrl: null,
          notes: null,
        },
      ],
    };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ srTheses: allNulls }), { status: 200 }),
    );
    const result = await fetchCurrentSrTheses(POOL_ID);
    expect(result.srTheses!.theses[0]!.bias).toBeNull();
    expect(result.srTheses!.theses[0]!.setupType).toBeNull();
    expect(result.srTheses!.theses[0]!.sourceReliability).toBeNull();
    expect(result.srTheses!.theses[0]!.entryZone).toBeNull();
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run: `pnpm --filter app test -- srTheses`
Expected: FAIL — `Cannot find module './srTheses'`.

- [ ] **Step 3: Write the implementation**

Create `apps/app/src/api/srTheses.ts`. Mirror `apps/app/src/api/regime.ts` shape (timeout, abort handling, classifyNotFound):

```ts
import type { SrThesesBlock, SrThesisDto } from '@clmm/application/public';
import { getBffBaseUrl } from './http';

export class SrThesesUnsupportedPoolError extends Error {
  constructor(poolId: string) {
    super(`S/R theses not available: pool ${poolId} is not supported`);
    this.name = 'SrThesesUnsupportedPoolError';
  }
}

export function isSrThesesUnsupportedPoolError(
  error: unknown,
): error is SrThesesUnsupportedPoolError {
  return error instanceof SrThesesUnsupportedPoolError;
}

export type SrThesesUnavailableReason = 'not-found' | 'config-error' | 'upstream-error';

export type SrThesesResponse = {
  srTheses: SrThesesBlock | null;
  unavailableReason?: SrThesesUnavailableReason | undefined;
};

const FETCH_TIMEOUT_MS = 10_000;

function isAbortError(error: unknown): boolean {
  if (typeof error !== 'object' || error == null) return false;
  return (error as { name?: string }).name === 'AbortError';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function isThesis(value: unknown): value is SrThesisDto {
  if (!isRecord(value)) return false;
  if (typeof value['asset'] !== 'string') return false;
  if (typeof value['timeframe'] !== 'string') return false;
  if (!isNullableString(value['bias'])) return false;
  if (!isNullableString(value['setupType'])) return false;
  if (!isStringArray(value['supportLevels'])) return false;
  if (!isStringArray(value['resistanceLevels'])) return false;
  if (!isNullableString(value['entryZone'])) return false;
  if (!isStringArray(value['targets'])) return false;
  if (!isNullableString(value['invalidation'])) return false;
  if (!isNullableString(value['trigger'])) return false;
  if (!isNullableString(value['chartReference'])) return false;
  if (typeof value['sourceHandle'] !== 'string') return false;
  if (!isNullableString(value['sourceChannel'])) return false;
  if (typeof value['sourceKind'] !== 'string') return false;
  if (!isNullableString(value['sourceReliability'])) return false;
  if (!isNullableString(value['rawThesisText'])) return false;
  if (!isNullableString(value['collectedAt'])) return false;
  if (!isNullableString(value['publishedAt'])) return false;
  if (!isNullableString(value['sourceUrl'])) return false;
  if (!isNullableString(value['notes'])) return false;
  return true;
}

function isSrThesesBlock(value: unknown): value is SrThesesBlock {
  if (!isRecord(value)) return false;
  if (value['schemaVersion'] !== '2.0') return false;
  if (typeof value['source'] !== 'string') return false;
  if (typeof value['symbol'] !== 'string') return false;
  if (typeof value['capturedAtIso'] !== 'string') return false;
  if (typeof value['capturedAtUnixMs'] !== 'number') return false;
  if (!Number.isFinite(value['capturedAtUnixMs']) || (value['capturedAtUnixMs'] as number) <= 0)
    return false;
  if (!isRecord(value['brief'])) return false;
  const brief = value['brief'] as Record<string, unknown>;
  if (typeof brief['briefId'] !== 'string') return false;
  if (!isNullableString(brief['sourceRecordedAtIso'])) return false;
  if (!isNullableString(brief['summary'])) return false;
  if (!Array.isArray(value['theses'])) return false;
  if (!(value['theses'] as unknown[]).every(isThesis)) return false;
  return true;
}

function isUnavailableReason(value: unknown): value is SrThesesUnavailableReason {
  return (
    typeof value === 'string' &&
    (value === 'not-found' || value === 'config-error' || value === 'upstream-error')
  );
}

async function classifyNotFound(poolId: string, response: Response): Promise<Error> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return new Error('Could not load S/R theses: unexpected 404');
  }
  if (
    isRecord(body) &&
    typeof body['message'] === 'string' &&
    body['message'].includes('not supported')
  ) {
    return new SrThesesUnsupportedPoolError(poolId);
  }
  return new Error('Could not load S/R theses: endpoint not found');
}

export async function fetchCurrentSrTheses(poolId: string): Promise<SrThesesResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(
      `${getBffBaseUrl()}/sr-theses/pools/${encodeURIComponent(poolId)}/current`,
      { signal: controller.signal },
    );
  } catch (error: unknown) {
    if (isAbortError(error)) {
      throw new Error('Could not load S/R theses: request timed out');
    }
    throw new Error(
      `Could not load S/R theses: ${error instanceof Error ? error.message : 'network error'}`,
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 404) {
    throw await classifyNotFound(poolId, response);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => `HTTP ${response.status}`);
    throw new Error(`Could not load S/R theses: ${detail || response.statusText}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error('Could not load S/R theses: response body was not valid JSON');
  }

  if (!isRecord(body)) {
    throw new Error('Could not load S/R theses: malformed response');
  }

  const srTheses = body['srTheses'];
  const unavailableReason = isUnavailableReason(body['unavailableReason'])
    ? body['unavailableReason']
    : undefined;

  if (srTheses === null) {
    return { srTheses: null, unavailableReason };
  }

  if (!isSrThesesBlock(srTheses)) {
    throw new Error('Could not load S/R theses: malformed srTheses block');
  }

  return { srTheses, unavailableReason };
}
```

Note: the BFF response for the success path does NOT include `capturedAtUnixMs` (the adapter computes it server-side and the BFF passes the block back as-is — confirm this matches by reviewing the adapter return value in Task 4 — yes, `capturedAtUnixMs` is set in `parseBlock`). The validator above accepts it.

- [ ] **Step 4: Run the tests until green**

Run: `pnpm --filter app test -- srTheses`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/api/srTheses.ts apps/app/src/api/srTheses.test.ts
git commit -m "feat(app): add fetchCurrentSrTheses BFF client"
```

---

## Task 9: UI — V2 View Model (TDD)

**Files:**

- Create: `packages/ui/src/view-models/SrThesesViewModel.ts`
- Test: `packages/ui/src/view-models/SrThesesViewModel.test.ts`

The view model handles: recency sort, freshness label from block `capturedAtIso`, default visible count of 3 + remaining count, default selected = most recent, neutral tone for unknown bias, raw text collapsed-by-default flag, overlay model derivation.

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/src/view-models/SrThesesViewModel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { SrThesesBlock, SrThesisDto } from '@clmm/application/public';
import { buildSrThesesViewModel, type SrThesesViewModel } from './SrThesesViewModel.js';

const NOW = Date.parse('2026-05-07T12:00:00Z');

function makeThesis(partial: Partial<SrThesisDto> = {}): SrThesisDto {
  return {
    asset: 'SOL/USDC',
    timeframe: '4h',
    bias: 'bullish',
    setupType: 'breakout',
    supportLevels: [],
    resistanceLevels: [],
    entryZone: null,
    targets: [],
    invalidation: null,
    trigger: null,
    chartReference: null,
    sourceHandle: 'analyst',
    sourceChannel: 'twitter',
    sourceKind: 'twitter',
    sourceReliability: 'high',
    rawThesisText: 'thesis body',
    collectedAt: null,
    publishedAt: null,
    sourceUrl: null,
    notes: null,
    ...partial,
  };
}

function makeBlock(theses: SrThesisDto[], capturedAtIso = '2026-05-07T10:00:00Z'): SrThesesBlock {
  return {
    schemaVersion: '2.0',
    source: 'openclaw',
    symbol: 'SOL/USDC',
    brief: { briefId: 'b', sourceRecordedAtIso: null, summary: 'Brief summary text.' },
    capturedAtIso,
    capturedAtUnixMs: Date.parse(capturedAtIso),
    theses,
  };
}

describe('buildSrThesesViewModel', () => {
  it('sorts theses by publishedAt descending', () => {
    const a = makeThesis({ publishedAt: '2026-05-07T01:00:00Z', sourceHandle: 'a' });
    const b = makeThesis({ publishedAt: '2026-05-07T05:00:00Z', sourceHandle: 'b' });
    const c = makeThesis({ publishedAt: '2026-05-07T03:00:00Z', sourceHandle: 'c' });
    const vm = buildSrThesesViewModel(makeBlock([a, b, c]), NOW);
    expect(vm.cards.map((card) => card.sourceHandle)).toEqual(['b', 'c', 'a']);
  });

  it('falls back to collectedAt when publishedAt is missing', () => {
    const a = makeThesis({
      publishedAt: null,
      collectedAt: '2026-05-07T01:00:00Z',
      sourceHandle: 'a',
    });
    const b = makeThesis({
      publishedAt: null,
      collectedAt: '2026-05-07T05:00:00Z',
      sourceHandle: 'b',
    });
    const vm = buildSrThesesViewModel(makeBlock([a, b]), NOW);
    expect(vm.cards.map((c) => c.sourceHandle)).toEqual(['b', 'a']);
  });

  it('falls back to block capturedAtIso when neither timestamp is present', () => {
    const a = makeThesis({ publishedAt: null, collectedAt: null, sourceHandle: 'a' });
    const b = makeThesis({ publishedAt: null, collectedAt: null, sourceHandle: 'b' });
    const vm = buildSrThesesViewModel(makeBlock([a, b], '2026-05-07T10:00:00Z'), NOW);
    expect(vm.cards).toHaveLength(2);
    // Ties allowed — key requirement is that they are NOT placed at "sort last".
    expect(vm.cards.every((c) => c.timestampLabel != null)).toBe(true);
  });

  it('places unparseable timestamps last', () => {
    const good = makeThesis({ publishedAt: '2026-05-07T05:00:00Z', sourceHandle: 'good' });
    const bad = makeThesis({
      publishedAt: 'not-a-date',
      collectedAt: 'also-bad',
      sourceHandle: 'bad',
    });
    const vm = buildSrThesesViewModel(makeBlock([bad, good]), NOW);
    expect(vm.cards[vm.cards.length - 1]!.sourceHandle).toBe('bad');
  });

  it('does not use sourceReliability for sorting', () => {
    const lowReliableNewer = makeThesis({
      publishedAt: '2026-05-07T05:00:00Z',
      sourceHandle: 'newer-low',
      sourceReliability: 'low',
    });
    const highReliableOlder = makeThesis({
      publishedAt: '2026-05-07T01:00:00Z',
      sourceHandle: 'older-high',
      sourceReliability: 'high',
    });
    const vm = buildSrThesesViewModel(makeBlock([highReliableOlder, lowReliableNewer]), NOW);
    expect(vm.cards[0]!.sourceHandle).toBe('newer-low');
  });

  it('exposes brief summary, source label, and freshness label from the block', () => {
    const vm = buildSrThesesViewModel(makeBlock([makeThesis()], '2026-05-07T11:00:00Z'), NOW);
    expect(vm.briefSummary).toBe('Brief summary text.');
    expect(vm.sourceLabel).toBe('openclaw');
    expect(vm.freshnessLabel).toContain('1h ago');
  });

  it('marks unknown bias / setupType / sourceReliability as neutral tone', () => {
    const t = makeThesis({
      bias: 'mildly-constructive-but-cautious',
      setupType: 'distribution-into-vwap',
      sourceReliability: 'tier-experimental-2026',
    });
    const vm = buildSrThesesViewModel(makeBlock([t]), NOW);
    expect(vm.cards[0]!.biasTone).toBe('neutral');
  });

  it('maps known bias values to expected tones', () => {
    const bull = buildSrThesesViewModel(makeBlock([makeThesis({ bias: 'bullish' })]), NOW);
    const bear = buildSrThesesViewModel(makeBlock([makeThesis({ bias: 'bearish' })]), NOW);
    const range = buildSrThesesViewModel(makeBlock([makeThesis({ bias: 'range' })]), NOW);
    expect(bull.cards[0]!.biasTone).toBe('safe');
    expect(bear.cards[0]!.biasTone).toBe('breach');
    expect(range.cards[0]!.biasTone).toBe('warn');
  });

  it('shows only the first 3 cards by default and reports remaining count', () => {
    const five = Array.from({ length: 5 }, (_unused, i) =>
      makeThesis({ publishedAt: `2026-05-0${i + 1}T00:00:00Z`, sourceHandle: `t${i}` }),
    );
    const vm = buildSrThesesViewModel(makeBlock(five), NOW);
    expect(vm.visibleCards).toHaveLength(3);
    expect(vm.remainingCount).toBe(2);
    expect(vm.cards).toHaveLength(5);
  });

  it('selects the most recent thesis by default', () => {
    const a = makeThesis({ publishedAt: '2026-05-07T01:00:00Z', sourceHandle: 'a' });
    const b = makeThesis({ publishedAt: '2026-05-07T05:00:00Z', sourceHandle: 'b' });
    const vm = buildSrThesesViewModel(makeBlock([a, b]), NOW);
    expect(vm.selectedThesisIndex).toBe(0);
    expect(vm.selectedCard.sourceHandle).toBe('b');
  });

  it('marks raw thesis text collapsed by default', () => {
    const vm = buildSrThesesViewModel(makeBlock([makeThesis({ rawThesisText: 'long body' })]), NOW);
    expect(vm.cards[0]!.rawThesisCollapsedByDefault).toBe(true);
  });

  it('derives an overlay model that uses only the selected thesis', () => {
    const a = makeThesis({
      publishedAt: '2026-05-07T05:00:00Z',
      supportLevels: ['132', '128'],
      resistanceLevels: ['148', '152'],
      targets: ['148', '152'],
      invalidation: '128',
      entryZone: '135-138',
    });
    const b = makeThesis({
      publishedAt: '2026-05-07T01:00:00Z',
      supportLevels: ['200'],
      resistanceLevels: ['210'],
      targets: ['210'],
      invalidation: '195',
      entryZone: '205',
    });
    const vm = buildSrThesesViewModel(makeBlock([a, b]), NOW);
    expect(vm.overlay.supports).toEqual([132, 128]);
    expect(vm.overlay.resistances).toEqual([148, 152]);
    expect(vm.overlay.targets).toEqual([148, 152]);
    expect(vm.overlay.invalidation).toEqual({ kind: 'numeric', value: 128, raw: '128' });
    expect(vm.overlay.entryZone).toEqual({ kind: 'range', low: 135, high: 138, raw: '135-138' });
  });

  it('includes only parseable strings in numeric overlay coordinates', () => {
    const t = makeThesis({
      supportLevels: ['132', 'breakout-shelf', '128'],
      resistanceLevels: ['n/a'],
      targets: ['148', 'open-ended'],
      invalidation: 'discretion',
      entryZone: 'on flush',
    });
    const vm: SrThesesViewModel = buildSrThesesViewModel(makeBlock([t]), NOW);
    expect(vm.overlay.supports).toEqual([132, 128]);
    expect(vm.overlay.resistances).toEqual([]);
    expect(vm.overlay.targets).toEqual([148]);
    expect(vm.overlay.invalidation).toEqual({ kind: 'text', raw: 'discretion' });
    expect(vm.overlay.entryZone).toEqual({ kind: 'text', raw: 'on flush' });
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run: `pnpm --filter @clmm/ui test -- SrThesesViewModel`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `packages/ui/src/view-models/SrThesesViewModel.ts`:

```ts
import type { SrThesesBlock, SrThesisDto } from '@clmm/application/public';

export type SrThesisBiasTone = 'safe' | 'breach' | 'warn' | 'neutral';

export type SrThesisCardViewModel = {
  asset: string;
  timeframe: string;
  bias: string | null;
  biasTone: SrThesisBiasTone;
  setupType: string | null;
  supportLevels: string[];
  resistanceLevels: string[];
  entryZone: string | null;
  targets: string[];
  invalidation: string | null;
  trigger: string | null;
  sourceHandle: string;
  sourceKind: string;
  sourceReliability: string | null;
  sourceUrl: string | null;
  chartReference: string | null;
  rawThesisText: string | null;
  rawThesisCollapsedByDefault: true;
  timestampLabel: string | null;
  notes: string | null;
};

export type SrThesisOverlayInvalidation =
  | { kind: 'numeric'; value: number; raw: string }
  | { kind: 'text'; raw: string }
  | null;

export type SrThesisOverlayEntryZone =
  | { kind: 'range'; low: number; high: number; raw: string }
  | { kind: 'numeric'; value: number; raw: string }
  | { kind: 'text'; raw: string }
  | null;

export type SrThesisOverlayModel = {
  supports: number[];
  resistances: number[];
  targets: number[];
  invalidation: SrThesisOverlayInvalidation;
  entryZone: SrThesisOverlayEntryZone;
};

export type SrThesesViewModel = {
  briefSummary: string | null;
  sourceLabel: string;
  freshnessLabel: string;
  isStale: boolean;
  cards: SrThesisCardViewModel[];
  visibleCards: SrThesisCardViewModel[];
  remainingCount: number;
  selectedThesisIndex: number;
  selectedCard: SrThesisCardViewModel;
  overlay: SrThesisOverlayModel;
};

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const STALE_THRESHOLD_MS = 48 * MS_PER_HOUR;
const DEFAULT_VISIBLE_COUNT = 3;

const KNOWN_BULLISH = new Set(['bull', 'bullish', 'long']);
const KNOWN_BEARISH = new Set(['bear', 'bearish', 'short']);
const KNOWN_NEUTRAL_WARN = new Set(['range', 'neutral', 'chop', 'choppy']);

function biasToneOf(bias: string | null): SrThesisBiasTone {
  if (bias == null) return 'neutral';
  const key = bias.toLowerCase().trim();
  if (KNOWN_BULLISH.has(key)) return 'safe';
  if (KNOWN_BEARISH.has(key)) return 'breach';
  if (KNOWN_NEUTRAL_WARN.has(key)) return 'warn';
  return 'neutral';
}

function recencyTimestampMs(thesis: SrThesisDto, fallbackMs: number): number {
  const candidates: ReadonlyArray<string | null> = [thesis.publishedAt, thesis.collectedAt];
  for (const value of candidates) {
    if (value == null) continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  // No usable thesis-level timestamp: fall back to block capture time.
  // Theses with truly unparseable timestamps (i.e. publishedAt/collectedAt
  // were strings that could not be parsed) are sorted last via
  // `unparseable === true` below.
  return fallbackMs;
}

function isUnparseable(thesis: SrThesisDto): boolean {
  if (thesis.publishedAt == null && thesis.collectedAt == null) return false;
  const published = thesis.publishedAt != null ? Date.parse(thesis.publishedAt) : null;
  const collected = thesis.collectedAt != null ? Date.parse(thesis.collectedAt) : null;
  const publishedOk = published != null && Number.isFinite(published);
  const collectedOk = collected != null && Number.isFinite(collected);
  return !publishedOk && !collectedOk;
}

function computeFreshness(
  capturedAtUnixMs: number,
  now: number,
): { freshnessLabel: string; isStale: boolean } {
  const ageMs = Math.max(0, now - capturedAtUnixMs);
  if (ageMs < MS_PER_HOUR) {
    const minutes = Math.max(1, Math.round(ageMs / MS_PER_MINUTE));
    return { freshnessLabel: `${minutes}m ago`, isStale: false };
  }
  const hours = Math.round(ageMs / MS_PER_HOUR);
  if (ageMs < STALE_THRESHOLD_MS) {
    return { freshnessLabel: `${hours}h ago`, isStale: false };
  }
  return { freshnessLabel: `${hours}h ago · stale`, isStale: true };
}

function timestampLabelOf(thesis: SrThesisDto): string | null {
  return thesis.publishedAt ?? thesis.collectedAt ?? null;
}

function tryParseNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const numericPattern = /^-?\d+(?:\.\d+)?$/;
  if (!numericPattern.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function tryParseRange(value: string): { low: number; high: number } | null {
  const parts = value.split(/[-–—]/).map((p) => p.trim());
  if (parts.length !== 2) return null;
  const low = tryParseNumber(parts[0]!);
  const high = tryParseNumber(parts[1]!);
  if (low == null || high == null) return null;
  return { low: Math.min(low, high), high: Math.max(low, high) };
}

function parseEntryZone(value: string | null): SrThesisOverlayEntryZone {
  if (value == null) return null;
  const range = tryParseRange(value);
  if (range != null) return { kind: 'range', low: range.low, high: range.high, raw: value };
  const num = tryParseNumber(value);
  if (num != null) return { kind: 'numeric', value: num, raw: value };
  return { kind: 'text', raw: value };
}

function parseInvalidation(value: string | null): SrThesisOverlayInvalidation {
  if (value == null) return null;
  const num = tryParseNumber(value);
  if (num != null) return { kind: 'numeric', value: num, raw: value };
  return { kind: 'text', raw: value };
}

function parseNumericList(values: string[]): number[] {
  const out: number[] = [];
  for (const value of values) {
    const num = tryParseNumber(value);
    if (num != null) out.push(num);
  }
  return out;
}

function buildCard(thesis: SrThesisDto): SrThesisCardViewModel {
  return {
    asset: thesis.asset,
    timeframe: thesis.timeframe,
    bias: thesis.bias,
    biasTone: biasToneOf(thesis.bias),
    setupType: thesis.setupType,
    supportLevels: thesis.supportLevels,
    resistanceLevels: thesis.resistanceLevels,
    entryZone: thesis.entryZone,
    targets: thesis.targets,
    invalidation: thesis.invalidation,
    trigger: thesis.trigger,
    sourceHandle: thesis.sourceHandle,
    sourceKind: thesis.sourceKind,
    sourceReliability: thesis.sourceReliability,
    sourceUrl: thesis.sourceUrl,
    chartReference: thesis.chartReference,
    rawThesisText: thesis.rawThesisText,
    rawThesisCollapsedByDefault: true,
    timestampLabel: timestampLabelOf(thesis),
    notes: thesis.notes,
  };
}

function overlayFor(thesis: SrThesisDto): SrThesisOverlayModel {
  return {
    supports: parseNumericList(thesis.supportLevels),
    resistances: parseNumericList(thesis.resistanceLevels),
    targets: parseNumericList(thesis.targets),
    invalidation: parseInvalidation(thesis.invalidation),
    entryZone: parseEntryZone(thesis.entryZone),
  };
}

export function buildSrThesesViewModel(block: SrThesesBlock, now: number): SrThesesViewModel {
  const { freshnessLabel, isStale } = computeFreshness(block.capturedAtUnixMs, now);

  type Ranked = { thesis: SrThesisDto; tsMs: number; unparseable: boolean };
  const ranked: Ranked[] = block.theses.map((t) => ({
    thesis: t,
    tsMs: recencyTimestampMs(t, block.capturedAtUnixMs),
    unparseable: isUnparseable(t),
  }));

  ranked.sort((a, b) => {
    if (a.unparseable !== b.unparseable) return a.unparseable ? 1 : -1;
    return b.tsMs - a.tsMs;
  });

  const sortedTheses = ranked.map((r) => r.thesis);
  const cards = sortedTheses.map(buildCard);
  const visibleCards = cards.slice(0, DEFAULT_VISIBLE_COUNT);
  const remainingCount = Math.max(0, cards.length - DEFAULT_VISIBLE_COUNT);

  const selectedThesisIndex = 0;
  // Empty `theses` arrays are converted to `not-found` upstream — by the time
  // the view model runs we always have at least one thesis.
  const selectedCard = cards[selectedThesisIndex] ?? buildCard(sortedTheses[0]!);
  const overlay = overlayFor(sortedTheses[selectedThesisIndex] ?? sortedTheses[0]!);

  return {
    briefSummary: block.brief.summary,
    sourceLabel: block.source,
    freshnessLabel,
    isStale,
    cards,
    visibleCards,
    remainingCount,
    selectedThesisIndex,
    selectedCard,
    overlay,
  };
}
```

- [ ] **Step 4: Run the tests until green**

Run: `pnpm --filter @clmm/ui test -- SrThesesViewModel`
Expected: PASS (12 tests).

- [ ] **Step 5: Export `buildSrThesesViewModel` from the UI package index**

Edit `packages/ui/src/index.ts`. After the existing line `export { buildRegimeViewModelBlock } from './view-models/RegimeViewModel.js';`, add:

```ts
export { buildSrThesesViewModel } from './view-models/SrThesesViewModel.js';
export type {
  SrThesesViewModel,
  SrThesisCardViewModel,
  SrThesisOverlayModel,
  SrThesisBiasTone,
} from './view-models/SrThesesViewModel.js';
```

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/view-models/SrThesesViewModel.ts packages/ui/src/view-models/SrThesesViewModel.test.ts packages/ui/src/index.ts
git commit -m "feat(ui): add SrThesesViewModel with recency sort and overlay derivation"
```

---

## Task 10: UI — `SrThesisCard` Component (TDD)

**Files:**

- Create: `packages/ui/src/components/SrThesisCard.tsx`
- Test: `packages/ui/src/components/SrThesisCard.test.tsx`

For style references read `SrLevelsCard.tsx` (current v1 styling). Match the design-system tokens and layout idioms. The test uses `@testing-library/react` (the codebase already does — see `SrInsightsSection.test.tsx`).

- [ ] **Step 1: Write the failing test**

Create `packages/ui/src/components/SrThesisCard.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { SrThesisCardViewModel } from '../view-models/SrThesesViewModel.js';
import { SrThesisCard } from './SrThesisCard.js';

function makeCard(partial: Partial<SrThesisCardViewModel> = {}): SrThesisCardViewModel {
  return {
    asset: 'SOL/USDC',
    timeframe: '4h',
    bias: 'bullish',
    biasTone: 'safe',
    setupType: 'breakout',
    supportLevels: ['132'],
    resistanceLevels: ['148'],
    entryZone: '135-138',
    targets: ['148'],
    invalidation: '128',
    trigger: 'close above 145',
    sourceHandle: 'analyst42',
    sourceKind: 'twitter',
    sourceReliability: 'high',
    sourceUrl: null,
    chartReference: null,
    rawThesisText: 'thesis body',
    rawThesisCollapsedByDefault: true,
    timestampLabel: '2026-05-07T00:30:00Z',
    notes: null,
    ...partial,
  };
}

describe('SrThesisCard', () => {
  it('renders bias, setup type, and timeframe', () => {
    render(<SrThesisCard card={makeCard()} />);
    expect(screen.getByText('bullish')).toBeTruthy();
    expect(screen.getByText('breakout')).toBeTruthy();
    expect(screen.getByText(/4h/)).toBeTruthy();
  });

  it('renders support and resistance levels', () => {
    render(
      <SrThesisCard
        card={makeCard({ supportLevels: ['132', '128'], resistanceLevels: ['148'] })}
      />,
    );
    expect(screen.getByText('132')).toBeTruthy();
    expect(screen.getByText('128')).toBeTruthy();
    expect(screen.getByText('148')).toBeTruthy();
  });

  it('renders entry zone, targets, invalidation, and trigger', () => {
    render(<SrThesisCard card={makeCard({ entryZone: '135-138', targets: ['148'] })} />);
    expect(screen.getByText('135-138')).toBeTruthy();
    expect(screen.getByText('128')).toBeTruthy();
    expect(screen.getByText('close above 145')).toBeTruthy();
  });

  it('renders source handle, kind, and reliability', () => {
    render(
      <SrThesisCard
        card={makeCard({
          sourceHandle: 'analyst42',
          sourceKind: 'twitter',
          sourceReliability: 'high',
        })}
      />,
    );
    expect(screen.getByText('analyst42')).toBeTruthy();
    expect(screen.getByText(/twitter/)).toBeTruthy();
    expect(screen.getByText(/high/)).toBeTruthy();
  });

  it('renders timestamp when provided', () => {
    render(<SrThesisCard card={makeCard({ timestampLabel: '2026-05-07T00:30:00Z' })} />);
    expect(screen.getByText(/2026-05-07/)).toBeTruthy();
  });

  it('renders unknown bias / setup / reliability strings without crashing', () => {
    render(
      <SrThesisCard
        card={makeCard({
          bias: 'mildly-constructive-but-cautious',
          biasTone: 'neutral',
          setupType: 'distribution-into-vwap',
          sourceReliability: 'tier-experimental-2026',
        })}
      />,
    );
    expect(screen.getByText('mildly-constructive-but-cautious')).toBeTruthy();
    expect(screen.getByText('distribution-into-vwap')).toBeTruthy();
    expect(screen.getByText(/tier-experimental-2026/)).toBeTruthy();
  });

  it('keeps raw thesis text collapsed by default and reveals on toggle', () => {
    render(<SrThesisCard card={makeCard({ rawThesisText: 'long body' })} />);
    expect(screen.queryByText('long body')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /show raw thesis/i }));
    expect(screen.getByText('long body')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm --filter @clmm/ui test -- SrThesisCard`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `packages/ui/src/components/SrThesisCard.tsx`. Mirror the visual idiom of `SrLevelsCard.tsx` (surface, border, bias pill, levels rows, metadata footer):

```tsx
import { useState } from 'react';
import { Pressable, View, Text, Linking } from 'react-native';
import { colors, typography } from '../design-system/index.js';
import type { SrThesisCardViewModel, SrThesisBiasTone } from '../view-models/SrThesesViewModel.js';

const toneColor = (tone: SrThesisBiasTone): string => {
  switch (tone) {
    case 'safe':
      return colors.safe;
    case 'breach':
      return colors.breachAccent;
    case 'warn':
      return colors.warn;
    case 'neutral':
      return colors.textSecondary;
  }
};

type Props = {
  card: SrThesisCardViewModel;
};

export function SrThesisCard({ card }: Props): JSX.Element {
  const [rawExpanded, setRawExpanded] = useState(false);
  const biasColor = toneColor(card.biasTone);

  return (
    <View
      style={{
        marginTop: 10,
        padding: 14,
        backgroundColor: colors.surfaceRecessed,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {/* Bias + timeframe */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {card.bias ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              height: 22,
              paddingHorizontal: 10,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: 'rgba(244,201,122,0.30)',
            }}
          >
            <Text
              style={{
                fontSize: typography.fontSize.micro,
                color: biasColor,
                fontWeight: typography.fontWeight.semibold,
              }}
            >
              {card.bias}
            </Text>
          </View>
        ) : null}
        <Text style={{ color: colors.textMuted, fontSize: typography.fontSize.micro }}>
          {card.timeframe}
        </Text>
        {card.setupType ? (
          <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.micro }}>
            {card.setupType}
          </Text>
        ) : null}
      </View>

      {/* Levels */}
      {card.supportLevels.length > 0 ? (
        <LabelledList label="Support" items={card.supportLevels} accent={colors.safe} />
      ) : null}
      {card.resistanceLevels.length > 0 ? (
        <LabelledList label="Resist" items={card.resistanceLevels} accent={colors.breachAccent} />
      ) : null}
      {card.entryZone ? <KeyValue label="Entry" value={card.entryZone} /> : null}
      {card.targets.length > 0 ? (
        <LabelledList label="Targets" items={card.targets} accent={colors.safe} />
      ) : null}
      {card.invalidation ? (
        <KeyValue label="Invalidation" value={card.invalidation} accent={colors.safe} />
      ) : null}
      {card.trigger ? (
        <KeyValue label="Trigger" value={card.trigger} accent={colors.breachAccent} />
      ) : null}

      {/* Source line */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: '4px 14px',
          marginTop: 10,
          paddingTop: 10,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <Text style={{ fontSize: typography.fontSize.micro, color: colors.textMuted }}>
          {card.sourceHandle}
        </Text>
        <Text style={{ fontSize: typography.fontSize.micro, color: colors.textSecondary }}>
          {card.sourceKind}
        </Text>
        {card.sourceReliability ? (
          <Text style={{ fontSize: typography.fontSize.micro, color: colors.textSecondary }}>
            reliability · {card.sourceReliability}
          </Text>
        ) : null}
        {card.timestampLabel ? (
          <Text style={{ fontSize: typography.fontSize.micro, color: colors.textMuted }}>
            {card.timestampLabel}
          </Text>
        ) : null}
        {card.sourceUrl ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => {
              void Linking.openURL(card.sourceUrl!);
            }}
          >
            <Text style={{ fontSize: typography.fontSize.micro, color: colors.safe }}>Source</Text>
          </Pressable>
        ) : null}
        {card.chartReference ? (
          <Text style={{ fontSize: typography.fontSize.micro, color: colors.textSecondary }}>
            chart · {card.chartReference}
          </Text>
        ) : null}
      </View>

      {/* Raw thesis toggle */}
      {card.rawThesisText ? (
        <View style={{ marginTop: 10 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show raw thesis"
            onPress={() => setRawExpanded((v) => !v)}
          >
            <Text style={{ fontSize: typography.fontSize.micro, color: colors.textSecondary }}>
              {rawExpanded ? 'Hide raw thesis' : 'Show raw thesis'}
            </Text>
          </Pressable>
          {rawExpanded ? (
            <Text style={{ fontSize: typography.fontSize.xs, color: colors.text, marginTop: 6 }}>
              {card.rawThesisText}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function LabelledList({
  label,
  items,
  accent,
}: {
  label: string;
  items: readonly string[];
  accent: string;
}): JSX.Element {
  return (
    <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text
        style={{
          fontSize: typography.fontSize.micro,
          color: accent,
          fontWeight: typography.fontWeight.semibold,
        }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '4px 8px' }}>
        {items.map((value, idx) => (
          <Text
            key={`${label}-${idx}`}
            style={{
              fontFamily: typography.fontFamily.mono,
              fontSize: typography.fontSize.xs,
              color: colors.text,
            }}
          >
            {value}
          </Text>
        ))}
      </View>
    </View>
  );
}

function KeyValue({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}): JSX.Element {
  return (
    <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text
        style={{
          fontSize: typography.fontSize.micro,
          color: accent ?? colors.textSecondary,
          fontWeight: typography.fontWeight.semibold,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: typography.fontFamily.mono,
          fontSize: typography.fontSize.xs,
          color: colors.text,
        }}
      >
        {value}
      </Text>
    </View>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @clmm/ui test -- SrThesisCard`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/SrThesisCard.tsx packages/ui/src/components/SrThesisCard.test.tsx
git commit -m "feat(ui): add SrThesisCard component"
```

---

## Task 11: UI — `SrThesesPanel` Component (TDD)

**Files:**

- Create: `packages/ui/src/components/SrThesesPanel.tsx`
- Test: `packages/ui/src/components/SrThesesPanel.test.tsx`

The panel renders the brief summary, source label, freshness, the visible thesis cards (default 3), and a "Show more" control when `remainingCount > 0`.

- [ ] **Step 1: Write the failing test**

Create `packages/ui/src/components/SrThesesPanel.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { SrThesesViewModel, SrThesisCardViewModel } from '../view-models/SrThesesViewModel.js';
import { SrThesesPanel } from './SrThesesPanel.js';

function makeCard(handle: string): SrThesisCardViewModel {
  return {
    asset: 'SOL/USDC',
    timeframe: '4h',
    bias: 'bullish',
    biasTone: 'safe',
    setupType: 'breakout',
    supportLevels: [],
    resistanceLevels: [],
    entryZone: null,
    targets: [],
    invalidation: null,
    trigger: null,
    sourceHandle: handle,
    sourceKind: 'twitter',
    sourceReliability: null,
    sourceUrl: null,
    chartReference: null,
    rawThesisText: null,
    rawThesisCollapsedByDefault: true,
    timestampLabel: null,
    notes: null,
  };
}

function makeVm(count: number): SrThesesViewModel {
  const cards = Array.from({ length: count }, (_unused, i) => makeCard(`a${i}`));
  return {
    briefSummary: 'Constructive setup forming.',
    sourceLabel: 'openclaw',
    freshnessLabel: '5m ago',
    isStale: false,
    cards,
    visibleCards: cards.slice(0, 3),
    remainingCount: Math.max(0, count - 3),
    selectedThesisIndex: 0,
    selectedCard: cards[0]!,
    overlay: { supports: [], resistances: [], targets: [], invalidation: null, entryZone: null },
  };
}

describe('SrThesesPanel', () => {
  it('renders brief summary, source label, and freshness', () => {
    render(<SrThesesPanel vm={makeVm(1)} />);
    expect(screen.getByText('Constructive setup forming.')).toBeTruthy();
    expect(screen.getByText(/openclaw/)).toBeTruthy();
    expect(screen.getByText('5m ago')).toBeTruthy();
  });

  it('renders only the first 3 cards by default', () => {
    render(<SrThesesPanel vm={makeVm(5)} />);
    expect(screen.getByText('a0')).toBeTruthy();
    expect(screen.getByText('a1')).toBeTruthy();
    expect(screen.getByText('a2')).toBeTruthy();
    expect(screen.queryByText('a3')).toBeNull();
    expect(screen.queryByText('a4')).toBeNull();
  });

  it('shows a "Show more" control when there are extra cards and reveals them on press', () => {
    render(<SrThesesPanel vm={makeVm(5)} />);
    fireEvent.click(screen.getByRole('button', { name: /show more/i }));
    expect(screen.getByText('a3')).toBeTruthy();
    expect(screen.getByText('a4')).toBeTruthy();
  });

  it('does not show "Show more" when there are 3 or fewer cards', () => {
    render(<SrThesesPanel vm={makeVm(2)} />);
    expect(screen.queryByRole('button', { name: /show more/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm --filter @clmm/ui test -- SrThesesPanel`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `packages/ui/src/components/SrThesesPanel.tsx`:

```tsx
import { useState } from 'react';
import { Pressable, View, Text } from 'react-native';
import { colors, typography } from '../design-system/index.js';
import type { SrThesesViewModel } from '../view-models/SrThesesViewModel.js';
import { SrThesisCard } from './SrThesisCard.js';

type Props = {
  vm: SrThesesViewModel;
};

export function SrThesesPanel({ vm }: Props): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const cardsToRender = expanded ? vm.cards : vm.visibleCards;

  return (
    <View
      style={{
        marginTop: 14,
        padding: 16,
        backgroundColor: colors.surface,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.medium,
          }}
        >
          S/R Theses · {vm.sourceLabel}
        </Text>
        <Text style={{ fontSize: typography.fontSize.micro, color: colors.textMuted }}>
          {vm.freshnessLabel}
        </Text>
      </View>

      {vm.briefSummary ? (
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: typography.fontSize.xs,
            marginBottom: 4,
          }}
        >
          {vm.briefSummary}
        </Text>
      ) : null}

      {cardsToRender.map((card, idx) => (
        <SrThesisCard key={`thesis-${idx}`} card={card} />
      ))}

      {!expanded && vm.remainingCount > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show more"
          onPress={() => setExpanded(true)}
        >
          <Text
            style={{
              marginTop: 10,
              fontSize: typography.fontSize.xs,
              color: colors.safe,
              fontWeight: typography.fontWeight.semibold,
            }}
          >
            Show more ({vm.remainingCount})
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @clmm/ui test -- SrThesesPanel`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/SrThesesPanel.tsx packages/ui/src/components/SrThesesPanel.test.tsx
git commit -m "feat(ui): add SrThesesPanel with show-more control"
```

---

## Task 12: UI — Update `SrInsightsSection` and `PositionsListScreen` to Orchestrate V2 + V1

**Files:**

- Modify: `packages/ui/src/components/SrInsightsSection.tsx`
- Modify: `packages/ui/src/components/SrInsightsSection.test.tsx`
- Modify: `packages/ui/src/screens/PositionsListScreen.tsx`
- Modify: `packages/ui/src/screens/PositionsListScreen.test.tsx`

This is the largest UI integration task. We extend `SrInsightsSection`'s prop contract first, then update its tests, then the screen.

- [ ] **Step 1: Update `SrInsightsSection` test file with the new orchestration scenarios**

Edit `packages/ui/src/components/SrInsightsSection.test.tsx`. Add the v2 props to existing test calls (use `srTheses={undefined}`, `srThesesUnavailableReason={null}`, `srThesesLoading={false}`, `srThesesError={false}`, `srThesesUnsupported={false}` to keep them passing) and add the following new test cases at the end of the `describe` block. Use `MarketThesisCard` references and the existing render approach as templates.

```tsx
const SAMPLE_THESES_BLOCK: SrThesesBlock = {
  schemaVersion: '2.0',
  source: 'openclaw',
  symbol: 'SOL/USDC',
  brief: { briefId: 'brief-1', sourceRecordedAtIso: null, summary: 'V2 brief.' },
  capturedAtIso: '2026-05-07T11:30:00Z',
  capturedAtUnixMs: Date.parse('2026-05-07T11:30:00Z'),
  theses: [
    {
      asset: 'SOL/USDC',
      timeframe: '4h',
      bias: 'bullish',
      setupType: 'breakout',
      supportLevels: ['132'],
      resistanceLevels: ['148'],
      entryZone: '135-138',
      targets: ['148'],
      invalidation: '128',
      trigger: 'close above 145',
      chartReference: null,
      sourceHandle: 'analyst42',
      sourceChannel: 'twitter',
      sourceKind: 'twitter',
      sourceReliability: 'high',
      rawThesisText: 'thesis body',
      collectedAt: null,
      publishedAt: '2026-05-07T11:00:00Z',
      sourceUrl: null,
      notes: null,
    },
  ],
};

it('renders v2 thesis panel when v2 data is available and hides the v1 SrLevelsCard', () => {
  render(
    <SrInsightsSection
      srLevels={SAMPLE_SR_LEVELS}
      isLoading={false}
      isError={false}
      isUnsupported={false}
      isMixedPools={false}
      poolLabel="SOL/USDC"
      now={Date.parse('2026-05-07T12:00:00Z')}
      srTheses={SAMPLE_THESES_BLOCK}
      srThesesLoading={false}
      srThesesError={false}
      srThesesUnsupported={false}
      srThesesUnavailableReason={null}
    />,
  );
  expect(screen.getByText('V2 brief.')).toBeTruthy();
  expect(screen.getByText('analyst42')).toBeTruthy();
  // v1 SrLevelsCard's distinctive heading must not appear
  expect(screen.queryByText('Support & Resistance')).toBeNull();
});

it('falls back to v1 SrLevelsCard when v2 is unavailable but v1 data is present', () => {
  render(
    <SrInsightsSection
      srLevels={SAMPLE_SR_LEVELS}
      isLoading={false}
      isError={false}
      isUnsupported={false}
      isMixedPools={false}
      poolLabel="SOL/USDC"
      now={Date.parse('2026-05-07T12:00:00Z')}
      srTheses={null}
      srThesesLoading={false}
      srThesesError={false}
      srThesesUnsupported={false}
      srThesesUnavailableReason="not-found"
    />,
  );
  expect(screen.getByText('Support & Resistance')).toBeTruthy();
});

it('renders "No S/R analysis available yet" when v2 not-found and there is no v1 fallback', () => {
  render(
    <SrInsightsSection
      srLevels={null}
      isLoading={false}
      isError={false}
      isUnsupported={false}
      isMixedPools={false}
      poolLabel={null}
      now={Date.parse('2026-05-07T12:00:00Z')}
      srTheses={null}
      srThesesLoading={false}
      srThesesError={false}
      srThesesUnsupported={false}
      srThesesUnavailableReason="not-found"
    />,
  );
  expect(screen.getByText('No S/R analysis available yet')).toBeTruthy();
});

it('renders "S/R analysis unavailable" for v2 config-error / upstream-error without v1 fallback', () => {
  for (const reason of ['config-error', 'upstream-error'] as const) {
    const { unmount } = render(
      <SrInsightsSection
        srLevels={null}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        isMixedPools={false}
        poolLabel={null}
        now={Date.parse('2026-05-07T12:00:00Z')}
        srTheses={null}
        srThesesLoading={false}
        srThesesError={false}
        srThesesUnsupported={false}
        srThesesUnavailableReason={reason}
      />,
    );
    expect(screen.getByText('S/R analysis unavailable')).toBeTruthy();
    unmount();
  }
});

it('renders degraded-refresh copy with ASCII hyphen when v2 is shown but a refresh failed', () => {
  render(
    <SrInsightsSection
      srLevels={null}
      isLoading={false}
      isError={false}
      isUnsupported={false}
      isMixedPools={false}
      poolLabel={null}
      now={Date.parse('2026-05-07T12:00:00Z')}
      srTheses={SAMPLE_THESES_BLOCK}
      srThesesLoading={false}
      srThesesError
      srThesesUnsupported={false}
      srThesesUnavailableReason={null}
    />,
  );
  expect(screen.getByText('Refresh failed - showing last available analysis.')).toBeTruthy();
});
```

(Note: the existing v1-only test that asserts `Refresh failed — showing last available analysis.` with an em dash should remain unchanged — it covers the v1 path and uses the existing copy. The new v2 path uses the ASCII hyphen per the spec.)

If the existing test imports do not include `SrThesesBlock`, add `import type { SrThesesBlock } from '@clmm/application/public';`. Add or extract a `SAMPLE_SR_LEVELS` constant if one doesn't already exist in the file.

- [ ] **Step 2: Run the tests — they should now FAIL**

Run: `pnpm --filter @clmm/ui test -- SrInsightsSection`
Expected: FAIL — `SrInsightsSection` props don't accept `srTheses*` yet.

- [ ] **Step 3: Update `SrInsightsSection` to accept v2 props and orchestrate**

Edit `packages/ui/src/components/SrInsightsSection.tsx`. Replace the existing implementation with one that prefers v2, falls back to v1, and shows updated unavailable copy:

```tsx
import { View, Text, ActivityIndicator } from 'react-native';
import type { SrLevelsBlock, SrThesesBlock } from '@clmm/application/public';
import { colors, typography } from '../design-system/index.js';
import { buildSrLevelsViewModelBlock } from '../view-models/SrLevelsViewModel.js';
import { buildSrThesesViewModel } from '../view-models/SrThesesViewModel.js';
import { MarketThesisCard } from './MarketThesisCard.js';
import { SrLevelsCard } from './SrLevelsCard.js';
import { SrThesesPanel } from './SrThesesPanel.js';

type SrThesesUnavailableReason = 'not-found' | 'config-error' | 'upstream-error';

type Props = {
  // v1 inputs
  srLevels: SrLevelsBlock | null | undefined;
  isLoading: boolean;
  isError: boolean;
  isUnsupported: boolean;
  // shared
  isMixedPools: boolean;
  poolLabel: string | null;
  now: number;
  // v2 inputs
  srTheses?: SrThesesBlock | null | undefined;
  srThesesLoading?: boolean;
  srThesesError?: boolean;
  srThesesUnsupported?: boolean;
  srThesesUnavailableReason?: SrThesesUnavailableReason | null;
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

function unavailableCopy(reason: SrThesesUnavailableReason | null | undefined, hasV1Data: boolean) {
  if (hasV1Data) return null;
  if (reason === 'not-found') return 'No S/R analysis available yet';
  if (reason === 'config-error' || reason === 'upstream-error') return 'S/R analysis unavailable';
  return null;
}

export function SrInsightsSection({
  srLevels,
  isLoading,
  isError,
  isUnsupported,
  isMixedPools,
  poolLabel,
  now,
  srTheses,
  srThesesLoading = false,
  srThesesError = false,
  srThesesUnsupported = false,
  srThesesUnavailableReason = null,
}: Props): JSX.Element | null {
  if (isMixedPools) {
    return (
      <View style={cardStyle}>
        <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
          Market context unavailable for mixed pools
        </Text>
      </View>
    );
  }

  // V2 first — prefer v2 thesis content when present.
  if (srTheses != null && srTheses.theses.length > 0) {
    const vm = buildSrThesesViewModel(srTheses, now);
    return (
      <View style={{ marginHorizontal: 16 }}>
        {poolLabel ? (
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: typography.fontSize.xs,
              marginBottom: 4,
            }}
          >
            {poolLabel}
          </Text>
        ) : null}
        <SrThesesPanel vm={vm} />
        {srThesesError ? (
          <Text style={{ color: colors.warn, fontSize: typography.fontSize.xs, marginTop: 4 }}>
            Refresh failed - showing last available analysis.
          </Text>
        ) : null}
      </View>
    );
  }

  // V2 still loading on first paint and no fallback yet
  if (srThesesLoading && srTheses == null && srLevels == null && !isLoading) {
    return (
      <View testID="sr-insights-section-skeleton" style={{ ...cardStyle, alignItems: 'center' }}>
        <ActivityIndicator color={colors.safe} />
      </View>
    );
  }

  // V2 unavailable — try v1 fallback path.
  if (srLevels != null) {
    const vm = buildSrLevelsViewModelBlock(srLevels, now);
    const showDegraded = isError && !isUnsupported;
    return (
      <View style={{ marginHorizontal: 16 }}>
        {poolLabel ? (
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: typography.fontSize.xs,
              marginBottom: 4,
            }}
          >
            {poolLabel}
          </Text>
        ) : null}
        <SrLevelsCard srLevels={vm} />
        {vm.summary ? <MarketThesisCard summary={vm.summary} /> : null}
        {showDegraded ? (
          <Text style={{ color: colors.warn, fontSize: typography.fontSize.xs, marginTop: 4 }}>
            Refresh failed — showing last available analysis.
          </Text>
        ) : null}
      </View>
    );
  }

  if (isLoading && srLevels == null) {
    return (
      <View testID="sr-insights-section-skeleton" style={{ ...cardStyle, alignItems: 'center' }}>
        <ActivityIndicator color={colors.safe} />
      </View>
    );
  }

  // No v2, no v1 — show unavailable copy.
  const v2Copy = unavailableCopy(srThesesUnavailableReason, false);
  if (v2Copy != null) {
    return (
      <View style={cardStyle}>
        <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
          {v2Copy}
        </Text>
      </View>
    );
  }

  if (isUnsupported || srThesesUnsupported) {
    return (
      <View style={cardStyle}>
        <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
          S/R analysis unavailable
        </Text>
      </View>
    );
  }

  if (!isLoading && srLevels === undefined && !isError) {
    return null;
  }

  return (
    <View style={cardStyle}>
      <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
        S/R analysis unavailable
      </Text>
    </View>
  );
}
```

- [ ] **Step 4: Run the SrInsightsSection tests**

Run: `pnpm --filter @clmm/ui test -- SrInsightsSection`
Expected: PASS (existing scenarios + new v2 scenarios).

If pre-existing tests now fail because the v1 unavailable copy reads `Market context unavailable` instead of `S/R analysis unavailable`, update those tests to use the new copy from the spec ("`S/R analysis unavailable`") — the spec table at the top of "UI Composition" lists this as the new copy for v1-only failure. Note this is an intentional copy change as part of this issue.

- [ ] **Step 5: Update `PositionsListScreen` props to pass v2 inputs through**

Edit `packages/ui/src/screens/PositionsListScreen.tsx`. Add the v2 props to both the `Props` type at the top and the `ConnectedPositionsList` inner component, and forward them to `SrInsightsSection`:

(a) Add to the import line near the top:

```ts
import type {
  PositionSummaryDto,
  SrLevelsBlock,
  SrThesesBlock,
  RegimeBlock,
} from '@clmm/application/public';
```

(b) Add to `Props`:

```ts
srTheses?: SrThesesBlock | null | undefined;
srThesesLoading?: boolean | undefined;
srThesesError?: boolean | undefined;
srThesesUnsupported?: boolean | undefined;
srThesesUnavailableReason?: 'not-found' | 'config-error' | 'upstream-error' | null | undefined;
```

(c) Pass them through `<ConnectedPositionsList ... />` and into `ConnectedPositionsList`'s function signature, then forward to `<SrInsightsSection ... />`.

- [ ] **Step 6: Update `PositionsListScreen.test.tsx`**

Edit `packages/ui/src/screens/PositionsListScreen.test.tsx`. Add a test that the screen renders the v2 panel when `srTheses` is provided, and a test that v1 falls through when `srTheses` is `null` with `srThesesUnavailableReason: 'not-found'`.

- [ ] **Step 7: Run the full UI test suite**

Run: `pnpm --filter @clmm/ui test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/components/SrInsightsSection.tsx packages/ui/src/components/SrInsightsSection.test.tsx packages/ui/src/screens/PositionsListScreen.tsx packages/ui/src/screens/PositionsListScreen.test.tsx
git commit -m "feat(ui): orchestrate v2 thesis panel with v1 SrLevelsCard fallback"
```

---

## Task 13: App — Wire `srThesesQuery` in Positions Route + End-to-End Visual Check

**Files:**

- Modify: `apps/app/app/(tabs)/positions.tsx`

By this point the screen accepts v2 props (Task 12), so wiring the query in the app route now keeps typecheck green.

- [ ] **Step 1: Add the imports**

Edit `apps/app/app/(tabs)/positions.tsx`. Update the existing imports near the top:

```ts
import { fetchCurrentSrTheses, SrThesesUnsupportedPoolError } from '../../src/api/srTheses';
```

- [ ] **Step 2: Add a stale-time constant near the existing two**

After `const REGIME_STALE_TIME_MS = 5 * 60 * 1000;`, add:

```ts
const SR_THESES_STALE_TIME_MS = 5 * 60 * 1000;
```

- [ ] **Step 3: Add the `srThesesQuery` useQuery call**

After the existing `regimeQuery = useQuery({...})` block, add:

```ts
const srThesesQuery = useQuery({
  queryKey: ['sr-theses-current', poolId],
  queryFn: () => fetchCurrentSrTheses(poolId!),
  enabled: poolId != null,
  staleTime: SR_THESES_STALE_TIME_MS,
  refetchOnWindowFocus: false,
  refetchOnMount: true,
  retry: (failureCount, error) =>
    !(error instanceof SrThesesUnsupportedPoolError) && failureCount < 1,
  retryDelay: 1000,
});

const srThesesUnsupported = srThesesQuery.error instanceof SrThesesUnsupportedPoolError;
const srThesesError = srThesesQuery.isError && !srThesesUnsupported;
```

- [ ] **Step 4: Pass the new props to `PositionsListScreen`**

Inside the existing `<PositionsListScreen ... />` JSX, add the v2 props next to the existing `srLevels*` props:

```tsx
srTheses={srThesesQuery.data?.srTheses}
srThesesLoading={srThesesQuery.isLoading && srThesesQuery.fetchStatus !== 'idle'}
srThesesError={srThesesError}
srThesesUnsupported={srThesesUnsupported}
srThesesUnavailableReason={srThesesQuery.data?.unavailableReason ?? null}
```

- [ ] **Step 5: Run app typecheck and tests**

Run: `pnpm --filter app typecheck && pnpm --filter app test`
Expected: PASS.

- [ ] **Step 6: Run dev server and verify in browser**

Run (in a separate terminal): `pnpm --filter app dev`. Open the positions tab connected to a wallet that has positions in the SOL/USDC Orca pool.

Visual verification checklist (do not move to Task 14 if any of these fail):

- When the BFF returns a v2 block: thesis cards render with bias / timeframe / levels / source line; v1 `SrLevelsCard` does NOT render.
- "Show more" reveals additional cards.
- Raw thesis toggle expands and collapses per card.
- When v2 returns `not-found` and v1 returns a block: the v1 `SrLevelsCard` renders.
- When both v2 and v1 are unavailable: the appropriate copy from the spec table renders ("No S/R analysis available yet" for not-found; "S/R analysis unavailable" for config-error / upstream-error).
- The v1 `RegimeSection` still renders below S/R, independent of S/R state.

- [ ] **Step 7: Commit**

```bash
git add 'apps/app/app/(tabs)/positions.tsx'
git commit -m "feat(app): wire srThesesQuery and forward v2 props to PositionsListScreen"
```

---

## Task 14: Final Verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full verification matrix**

Run sequentially:

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm boundaries
pnpm test
```

Expected: all PASS.

If any step fails, fix it before the next step. Do NOT skip with `--no-verify` or environment overrides.

- [ ] **Step 2: Verify all spec testing-strategy bullets are covered**

Cross-reference the spec's "Testing Strategy" section against the test files added by this plan:

| Spec bullet                                 | Test file                                                                                                       |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| DTO exports include v2 types                | `srTheses.exports.test.ts`                                                                                      |
| Public exports expose v2 DTOs               | `srTheses.exports.test.ts`                                                                                      |
| Open strings not narrowed to enums          | `srTheses.exports.test.ts`                                                                                      |
| Adapter happy path / URL / no auth          | `CurrentSrThesesAdapter.test.ts`                                                                                |
| Adapter `404` / empty / `400` / 5xx / retry | `CurrentSrThesesAdapter.test.ts`                                                                                |
| Adapter unknown / nullable preservation     | `CurrentSrThesesAdapter.test.ts`                                                                                |
| BFF allowlist + reason mapping              | `SrThesesController.test.ts`, `SrThesesAllowlist.test.ts`                                                       |
| App API client envelopes / errors           | `srTheses.test.ts` (apps/app)                                                                                   |
| View model recency / unknown / overlay      | `SrThesesViewModel.test.ts`                                                                                     |
| UI components and screen orchestration      | `SrThesisCard.test.tsx`, `SrThesesPanel.test.tsx`, `SrInsightsSection.test.tsx`, `PositionsListScreen.test.tsx` |

- [ ] **Step 3: No commit (verification only) — optional final tag/PR**

The implementation is complete. Open a PR per the team's standard process.

---

## Notes For The Implementer

- **Don't break the v1 `SrLevelsCard` path.** Existing consumers (insights bundle, positions screen) must keep working. All v1 tests should remain green.
- **Don't widen `SrThesesReadPort` to support filtering.** The spec's non-goals explicitly forbid filtering by `bias`, `setupType`, or `sourceReliability` in this issue.
- **Don't render a chart overlay.** The view model produces an overlay model, but no chart component is added in this issue.
- **Don't add a generic `market-context` endpoint.** The v2 path must remain pool-scoped at `/sr-theses/pools/:poolId/current`.
- **Frequent commits.** Each task ends with one commit; do not batch task commits.
- **Boundaries.** `packages/application` must not import from `packages/adapters`. `packages/ui` must import only from `@clmm/application/public`. `apps/app` must not import from `packages/adapters`. `pnpm boundaries` will catch violations.
