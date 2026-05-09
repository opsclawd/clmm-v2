# Regime Freshness Open/Close Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt the new explicit Regime freshness open/close contract from regime-engine #52 across DTO, adapter, app response validator, and Regime view model. Switch the displayed "Latest closed candle Xm old" to a presentation-drift formula derived from upstream `ageSeconds` + elapsed-since-generation, while keeping stale classification strictly upstream.

**Architecture:** Strict immediate adoption — no tolerance for the old `lastCandleIso` / `lastCandleUnixMs` shape. The DTO exposes both Unix-ms and ISO for `generatedAt`, `lastCandleOpen`, and `lastCandleClose`. The adapter is the upstream parsing boundary; the app validator re-checks the contract on the BFF→client hop; the view model consumes Unix-ms only and adds presentation drift.

**Tech Stack:** TypeScript, vitest, Node 20+ (ESM `.js` import suffixes), pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-05-09-regime-freshness-open-close-contract-design.md`

---

## File Structure

| Path                                                                        | Action | Responsibility                                                          |
| --------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| `packages/application/src/dto/regime.ts`                                    | Modify | DTO type definition for `RegimeFreshness`.                              |
| `packages/application/src/public/regime.exports.test.ts`                    | Modify | Lock the DTO contract via `expectTypeOf`.                               |
| `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.ts`      | Modify | Parse + validate upstream freshness; reject old shape.                  |
| `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.test.ts` | Modify | All adapter validation tests.                                           |
| `packages/adapters/src/outbound/regime-engine/RegimeBlockParity.test.ts`    | Modify | Fixture update only.                                                    |
| `packages/adapters/src/inbound/http/RegimeController.test.ts`               | Modify | Fixture update only.                                                    |
| `apps/app/src/api/regime.ts`                                                | Modify | BFF→client validator; reject old shape.                                 |
| `apps/app/src/api/regime.test.ts`                                           | Modify | App validator tests.                                                    |
| `packages/ui/src/view-models/RegimeViewModel.ts`                            | Modify | Display-age formula, new freshness rows, deterministic clock formatter. |
| `packages/ui/src/view-models/RegimeViewModel.test.ts`                       | Modify | View-model tests with deterministic locale/timezone.                    |
| `packages/ui/src/components/RegimeSection.test.tsx`                         | Modify | Fixture + copy assertions.                                              |

`packages/ui/src/components/RegimeSection.tsx` is untouched in source — it already calls `buildRegimeViewModelBlock(regime, now)` and the new `opts` parameter is optional with sensible defaults.

---

## Pre-flight

Before Task 1, ensure the workspace is bootstrapped (per `AGENTS.md`):

- [ ] **Step P.1: Confirm workspace is bootstrapped**

Run: `ls node_modules >/dev/null && echo OK || pnpm bootstrap`
Expected: `OK` printed, or `pnpm bootstrap` completes successfully.

- [ ] **Step P.2: Confirm baseline tests are green**

Run: `pnpm --filter @clmm/application test && pnpm --filter @clmm/adapters test && pnpm --filter @clmm/app test && pnpm --filter @clmm/ui test`
Expected: all four package suites pass on the current branch (this is the "before-state" baseline; tasks below will evolve them).

---

## Task 1: DTO + Public Exports Test

**Files:**

- Modify: `packages/application/src/public/regime.exports.test.ts`
- Modify: `packages/application/src/dto/regime.ts`

- [ ] **Step 1.1: Update the type-test to require the new freshness shape**

Replace the existing `RegimeFreshness no longer exposes capturedAtUnixMs` test (line 34) and the `RegimeFreshness exposes both clocks, age, stale flags, and thresholds` test (line 38) with:

```ts
it('RegimeFreshness no longer exposes capturedAtUnixMs', () => {
  expectTypeOf<RegimeFreshness>().not.toHaveProperty('capturedAtUnixMs');
});

it('RegimeFreshness no longer exposes lastCandleUnixMs', () => {
  expectTypeOf<RegimeFreshness>().not.toHaveProperty('lastCandleUnixMs');
});

it('RegimeFreshness no longer exposes lastCandleIso', () => {
  expectTypeOf<RegimeFreshness>().not.toHaveProperty('lastCandleIso');
});

it('RegimeFreshness exposes generatedAt, candle open/close, age, stale flags, and thresholds', () => {
  expectTypeOf<RegimeFreshness>().toEqualTypeOf<{
    generatedAtUnixMs: number;
    generatedAtIso: string;
    lastCandleOpenUnixMs: number;
    lastCandleOpenIso: string;
    lastCandleCloseUnixMs: number;
    lastCandleCloseIso: string;
    ageSeconds: number;
    softStale: boolean;
    hardStale: boolean;
    softStaleSeconds: number;
    hardStaleSeconds: number;
  }>();
});
```

Then update the runtime sample fixture (line 78) — replace the `freshness` block with:

```ts
      freshness: {
        generatedAtUnixMs: 1_700_000_000_000,
        generatedAtIso: '2026-05-06T12:00:00Z',
        lastCandleOpenUnixMs: 1_700_000_000_000 - 88 * 60_000,
        lastCandleOpenIso: '2026-05-06T10:32:00Z',
        lastCandleCloseUnixMs: 1_700_000_000_000 - 87 * 60_000,
        lastCandleCloseIso: '2026-05-06T10:33:00Z',
        ageSeconds: 87 * 60,
        softStale: true,
        hardStale: false,
        softStaleSeconds: 75 * 60,
        hardStaleSeconds: 90 * 60,
      } satisfies RegimeFreshness,
```

- [ ] **Step 1.2: Run the test and verify it fails**

Run: `pnpm --filter @clmm/application test -- regime.exports`
Expected: FAIL — type errors against `RegimeFreshness` (still has `lastCandleUnixMs` and is missing the new fields).

- [ ] **Step 1.3: Update the DTO type**

In `packages/application/src/dto/regime.ts`, replace the `RegimeFreshness` definition (lines 11–19) with:

```ts
export type RegimeFreshness = {
  generatedAtUnixMs: number;
  generatedAtIso: string;
  lastCandleOpenUnixMs: number;
  lastCandleOpenIso: string;
  lastCandleCloseUnixMs: number;
  lastCandleCloseIso: string;
  ageSeconds: number;
  softStale: boolean;
  hardStale: boolean;
  softStaleSeconds: number;
  hardStaleSeconds: number;
};
```

- [ ] **Step 1.4: Run the test and verify it passes**

Run: `pnpm --filter @clmm/application test -- regime.exports`
Expected: PASS.

- [ ] **Step 1.5: Verify @clmm/application typechecks**

Run: `pnpm --filter @clmm/application typecheck`
Expected: PASS.

- [ ] **Step 1.6: Commit**

```bash
git add packages/application/src/dto/regime.ts packages/application/src/public/regime.exports.test.ts
git commit -m "feat(application): RegimeFreshness exposes explicit candle open/close fields"
```

---

## Task 2: Adapter — strict-ISO helper, tolerance constant, recognized-timeframe map

**Files:**

- Modify: `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.ts`

These are private helpers; they will be exercised by the new validation tests in Tasks 3–9. Add them now so subsequent tasks can call them.

- [ ] **Step 2.1: Add helpers near the top of the file**

In `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.ts`, after the existing `VALID_*` sets (around line 20), add:

```ts
const ISO_8601_UTC_OR_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
function isStrictIso(value: unknown): value is string {
  return typeof value === 'string' && ISO_8601_UTC_OR_OFFSET.test(value);
}

// Allowed skew between upstream ageSeconds and (generatedAtUnixMs - lastCandleCloseUnixMs)/1000.
// Covers normal generation-time jitter; raise only with evidence regime-engine needs more.
const AGE_PARITY_TOLERANCE_SECONDS = 2;

const RECOGNIZED_TIMEFRAME_MS: Readonly<Record<string, number>> = {
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  '1d': 24 * 60 * 60_000,
};
```

- [ ] **Step 2.2: Verify the adapter still typechecks (helpers are unused so far)**

Run: `pnpm --filter @clmm/adapters typecheck`
Expected: FAIL or PASS — TypeScript may warn about unused locals depending on `noUnusedLocals`. If it fails, leave the helpers in place; the next task will use them.

If typecheck fails _only_ on unused-locals: do not commit yet. Proceed to Task 3 immediately so the helpers are referenced.

If typecheck passes: commit.

- [ ] **Step 2.3: Commit if step 2.2 passed**

```bash
git add packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.ts
git commit -m "refactor(adapters): add strict-ISO and timeframe helpers for new freshness contract"
```

If typecheck failed, skip this commit and bundle the change with Task 3's commit.

---

## Task 3: Adapter — Migrate `SAMPLE_UPSTREAM` and parse the new contract (happy path)

**Files:**

- Modify: `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.test.ts`
- Modify: `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.ts`

This task replaces the upstream fixture and rewires `parseUpstream` to consume the new 5-timestamp upstream shape and emit the 6-timestamp DTO. All structural validation rules added in later tasks will assume this baseline.

- [ ] **Step 3.1: Update `SAMPLE_UPSTREAM` and the happy-path assertions**

In `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.test.ts`:

Replace the `SAMPLE_UPSTREAM` `freshness` block (lines 51–59) with:

```ts
  freshness: {
    generatedAtIso: '2026-05-06T12:00:00Z',
    lastCandleOpenUnixMs: Date.parse('2026-05-06T11:00:00Z'),
    lastCandleOpenIso: '2026-05-06T11:00:00Z',
    lastCandleCloseUnixMs: Date.parse('2026-05-06T12:00:00Z'),
    lastCandleCloseIso: '2026-05-06T12:00:00Z',
    ageSeconds: 0,
    softStale: false,
    hardStale: false,
    softStaleSeconds: 75 * 60,
    hardStaleSeconds: 90 * 60,
  },
```

(The new sample uses a generated time at the candle close, `ageSeconds=0`, and a 1h candle window. This satisfies all validation rules added in later tasks.)

In the happy-path test (the one that begins on line 82, `returns kind:"block" with parsed RegimeBlock on 200`), replace the freshness assertions (lines 101–107) with:

```ts
expect(result.block.freshness.generatedAtUnixMs).toBe(Date.parse('2026-05-06T12:00:00Z'));
expect(result.block.freshness.generatedAtIso).toBe('2026-05-06T12:00:00Z');
expect(result.block.freshness.lastCandleOpenUnixMs).toBe(Date.parse('2026-05-06T11:00:00Z'));
expect(result.block.freshness.lastCandleOpenIso).toBe('2026-05-06T11:00:00Z');
expect(result.block.freshness.lastCandleCloseUnixMs).toBe(Date.parse('2026-05-06T12:00:00Z'));
expect(result.block.freshness.lastCandleCloseIso).toBe('2026-05-06T12:00:00Z');
expect(result.block.freshness.ageSeconds).toBe(0);
expect(result.block.freshness.softStale).toBe(false);
expect(result.block.freshness.hardStale).toBe(false);
expect(result.block.freshness.softStaleSeconds).toBe(75 * 60);
expect(result.block.freshness.hardStaleSeconds).toBe(90 * 60);
```

- [ ] **Step 3.2: Run the adapter happy-path test and verify it fails**

Run: `pnpm --filter @clmm/adapters test -- CurrentRegimeAdapter -t "returns kind"`
Expected: FAIL — the adapter still parses `lastCandleIso`, not `lastCandleOpenIso`/`lastCandleCloseIso`.

- [ ] **Step 3.3: Rewrite `parseUpstream` freshness parsing**

In `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.ts`, replace the freshness block in `parseUpstream` (lines 111–139) with:

```ts
const freshness = data['freshness'];
if (!isRecord(freshness)) return null;

// Strict rejection of the old ambiguous shape, by key presence (not truthiness).
if (
  Object.prototype.hasOwnProperty.call(freshness, 'lastCandleIso') ||
  Object.prototype.hasOwnProperty.call(freshness, 'lastCandleUnixMs')
) {
  return null;
}

const generatedAtIso = freshness['generatedAtIso'];
const lastCandleOpenIso = freshness['lastCandleOpenIso'];
const lastCandleCloseIso = freshness['lastCandleCloseIso'];
const lastCandleOpenUnixMs = freshness['lastCandleOpenUnixMs'];
const lastCandleCloseUnixMs = freshness['lastCandleCloseUnixMs'];
const ageSeconds = freshness['ageSeconds'];
const softStale = freshness['softStale'];
const hardStale = freshness['hardStale'];
const softStaleSeconds = freshness['softStaleSeconds'];
const hardStaleSeconds = freshness['hardStaleSeconds'];

if (!isStrictIso(generatedAtIso)) return null;
if (!isStrictIso(lastCandleOpenIso)) return null;
if (!isStrictIso(lastCandleCloseIso)) return null;
if (
  typeof lastCandleOpenUnixMs !== 'number' ||
  !Number.isFinite(lastCandleOpenUnixMs) ||
  lastCandleOpenUnixMs <= 0
)
  return null;
if (
  typeof lastCandleCloseUnixMs !== 'number' ||
  !Number.isFinite(lastCandleCloseUnixMs) ||
  lastCandleCloseUnixMs <= 0
)
  return null;
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
if (!Number.isFinite(generatedAtUnixMs) || generatedAtUnixMs <= 0) return null;

// ISO/MS parity for candle open and close (upstream sends both forms).
if (Date.parse(lastCandleOpenIso) !== lastCandleOpenUnixMs) return null;
if (Date.parse(lastCandleCloseIso) !== lastCandleCloseUnixMs) return null;

// Window order: close strictly after open.
if (lastCandleCloseUnixMs <= lastCandleOpenUnixMs) return null;

// Generation order: generation at-or-after close.
if (generatedAtUnixMs < lastCandleCloseUnixMs) return null;

// Age parity within tolerance (covers generation-time jitter).
const expectedAgeSeconds = Math.floor((generatedAtUnixMs - lastCandleCloseUnixMs) / 1000);
if (Math.abs(ageSeconds - expectedAgeSeconds) > AGE_PARITY_TOLERANCE_SECONDS) return null;
```

Then replace the `freshness:` field in the returned block (lines 163–171) with:

```ts
    freshness: {
      generatedAtUnixMs,
      generatedAtIso,
      lastCandleOpenUnixMs,
      lastCandleOpenIso,
      lastCandleCloseUnixMs,
      lastCandleCloseIso,
      ageSeconds,
      softStale,
      hardStale,
      softStaleSeconds,
      hardStaleSeconds,
    },
```

Note: timeframe duration validation is added in Task 9 (it requires reading `metadata` after metadata parsing). For now `parseUpstream` will accept any positive `lastCandleCloseUnixMs - lastCandleOpenUnixMs`.

- [ ] **Step 3.4: Run the adapter happy-path test and verify it passes**

Run: `pnpm --filter @clmm/adapters test -- CurrentRegimeAdapter -t "returns kind"`
Expected: PASS.

- [ ] **Step 3.5: Run the full adapter suite — expect known failures**

Run: `pnpm --filter @clmm/adapters test -- CurrentRegimeAdapter`
Expected: most tests pass; failures are limited to the legacy rejection tests (`rejects when lastCandleIso is not parseable`, etc.) — these are migrated/replaced in Tasks 4–9.

- [ ] **Step 3.6: Commit**

```bash
git add packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.ts \
        packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.test.ts
git commit -m "feat(adapters): parse new Regime freshness open/close contract"
```

---

## Task 4: Adapter — Old-shape rejection by key presence

**Files:**

- Modify: `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.test.ts`

The implementation already rejects by key presence (added in Task 3). This task replaces the legacy parseability tests with explicit by-key-presence cases.

- [ ] **Step 4.1: Add the rejection-matrix tests**

In `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.test.ts`, find and **delete** the old test `rejects when lastCandleIso is not parseable` (around line 412). Then add the following block (place it adjacent to the other freshness-rejection tests, near `rejects when generatedAtIso is not parseable`):

```ts
describe.each([
  ['lastCandleIso', 'foo'],
  ['lastCandleIso', null],
  ['lastCandleIso', undefined],
  ['lastCandleIso', ''],
  ['lastCandleUnixMs', 1_700_000_000_000],
  ['lastCandleUnixMs', null],
  ['lastCandleUnixMs', undefined],
  ['lastCandleUnixMs', 0],
])('rejects upstream freshness with legacy key %s = %p', (key, value) => {
  it('returns kind:"upstream-error"', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          ...SAMPLE_UPSTREAM,
          freshness: { ...SAMPLE_UPSTREAM.freshness, [key]: value },
        }),
        { status: 200 },
      ),
    );
    const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent(PARAMS);
    expect(result.kind).toBe('upstream-error');
  });
});
```

- [ ] **Step 4.2: Run the test and verify the matrix passes**

Run: `pnpm --filter @clmm/adapters test -- CurrentRegimeAdapter -t "rejects upstream freshness with legacy key"`
Expected: PASS for all 8 cases (the implementation already rejects by `Object.prototype.hasOwnProperty.call`).

- [ ] **Step 4.3: Commit**

```bash
git add packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.test.ts
git commit -m "test(adapters): adapter rejects legacy freshness keys by presence"
```

---

## Task 5: Adapter — ISO/MS parity violations for candle open and close

**Files:**

- Modify: `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.test.ts`

The implementation enforces parity (added in Task 3). This task adds explicit coverage.

- [ ] **Step 5.1: Add parity tests**

Add two new tests near the existing freshness rejection tests:

```ts
it('rejects when lastCandleOpenIso does not match lastCandleOpenUnixMs', async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(
      JSON.stringify({
        ...SAMPLE_UPSTREAM,
        freshness: {
          ...SAMPLE_UPSTREAM.freshness,
          // ISO/MS divergence: ms still says 11:00, but ISO says 11:00:01.
          lastCandleOpenIso: '2026-05-06T11:00:01Z',
        },
      }),
      { status: 200 },
    ),
  );
  const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent(PARAMS);
  expect(result.kind).toBe('upstream-error');
});

it('rejects when lastCandleCloseIso does not match lastCandleCloseUnixMs', async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(
      JSON.stringify({
        ...SAMPLE_UPSTREAM,
        freshness: {
          ...SAMPLE_UPSTREAM.freshness,
          lastCandleCloseIso: '2026-05-06T12:00:01Z',
        },
      }),
      { status: 200 },
    ),
  );
  const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent(PARAMS);
  expect(result.kind).toBe('upstream-error');
});
```

- [ ] **Step 5.2: Run the tests and verify they pass**

Run: `pnpm --filter @clmm/adapters test -- CurrentRegimeAdapter -t "ISO does not match"`
Expected: PASS for both.

- [ ] **Step 5.3: Commit**

```bash
git add packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.test.ts
git commit -m "test(adapters): adapter rejects ISO/MS parity violations on candle open/close"
```

---

## Task 6: Adapter — Window-order and generation-order rejections

**Files:**

- Modify: `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.test.ts`

- [ ] **Step 6.1: Add ordering tests**

```ts
it('rejects when lastCandleCloseUnixMs equals lastCandleOpenUnixMs', async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(
      JSON.stringify({
        ...SAMPLE_UPSTREAM,
        freshness: {
          ...SAMPLE_UPSTREAM.freshness,
          lastCandleOpenUnixMs: Date.parse('2026-05-06T12:00:00Z'),
          lastCandleOpenIso: '2026-05-06T12:00:00Z',
          lastCandleCloseUnixMs: Date.parse('2026-05-06T12:00:00Z'),
          lastCandleCloseIso: '2026-05-06T12:00:00Z',
        },
      }),
      { status: 200 },
    ),
  );
  const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent(PARAMS);
  expect(result.kind).toBe('upstream-error');
});

it('rejects when lastCandleCloseUnixMs is before lastCandleOpenUnixMs', async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(
      JSON.stringify({
        ...SAMPLE_UPSTREAM,
        freshness: {
          ...SAMPLE_UPSTREAM.freshness,
          lastCandleOpenUnixMs: Date.parse('2026-05-06T13:00:00Z'),
          lastCandleOpenIso: '2026-05-06T13:00:00Z',
          lastCandleCloseUnixMs: Date.parse('2026-05-06T12:00:00Z'),
          lastCandleCloseIso: '2026-05-06T12:00:00Z',
        },
      }),
      { status: 200 },
    ),
  );
  const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent(PARAMS);
  expect(result.kind).toBe('upstream-error');
});

it('rejects when generatedAtUnixMs is before lastCandleCloseUnixMs', async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(
      JSON.stringify({
        ...SAMPLE_UPSTREAM,
        freshness: {
          ...SAMPLE_UPSTREAM.freshness,
          generatedAtIso: '2026-05-06T11:30:00Z', // before close 12:00
        },
      }),
      { status: 200 },
    ),
  );
  const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent(PARAMS);
  expect(result.kind).toBe('upstream-error');
});
```

- [ ] **Step 6.2: Run and verify pass**

Run: `pnpm --filter @clmm/adapters test -- CurrentRegimeAdapter -t "before|equals"`
Expected: PASS for all three.

- [ ] **Step 6.3: Commit**

```bash
git add packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.test.ts
git commit -m "test(adapters): adapter rejects out-of-order freshness timestamps"
```

---

## Task 7: Adapter — Age-parity tolerance window

**Files:**

- Modify: `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.test.ts`

- [ ] **Step 7.1: Add age-parity tests**

`SAMPLE_UPSTREAM` has `ageSeconds: 0`, `generatedAt = lastCandleClose`, so the expected age is `0`. We perturb `ageSeconds` to test the tolerance:

```ts
it('accepts age skew of 1 second within tolerance', async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(
      JSON.stringify({
        ...SAMPLE_UPSTREAM,
        freshness: { ...SAMPLE_UPSTREAM.freshness, ageSeconds: 1 },
      }),
      { status: 200 },
    ),
  );
  const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent(PARAMS);
  expect(result.kind).toBe('block');
});

it('rejects age skew of 3 seconds outside tolerance', async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(
      JSON.stringify({
        ...SAMPLE_UPSTREAM,
        freshness: { ...SAMPLE_UPSTREAM.freshness, ageSeconds: 3 },
      }),
      { status: 200 },
    ),
  );
  const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent(PARAMS);
  expect(result.kind).toBe('upstream-error');
});

it('rejects age skew of 60 seconds outside tolerance', async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(
      JSON.stringify({
        ...SAMPLE_UPSTREAM,
        freshness: { ...SAMPLE_UPSTREAM.freshness, ageSeconds: 60 },
      }),
      { status: 200 },
    ),
  );
  const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent(PARAMS);
  expect(result.kind).toBe('upstream-error');
});
```

- [ ] **Step 7.2: Run and verify pass**

Run: `pnpm --filter @clmm/adapters test -- CurrentRegimeAdapter -t "age skew"`
Expected: PASS for all three.

- [ ] **Step 7.3: Commit**

```bash
git add packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.test.ts
git commit -m "test(adapters): adapter enforces ageSeconds parity within 2s tolerance"
```

---

## Task 8: Adapter — Strict ISO 8601 format check

**Files:**

- Modify: `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.test.ts`

- [ ] **Step 8.1: Add ISO format tests**

`Date.parse` accepts loose strings like `"May 9 2026 02:00:00 GMT"`; the contract is strict ISO 8601.

```ts
describe.each(['generatedAtIso', 'lastCandleOpenIso', 'lastCandleCloseIso'])(
  'rejects parseable-but-non-ISO %s',
  (field) => {
    it('returns kind:"upstream-error"', async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            ...SAMPLE_UPSTREAM,
            freshness: {
              ...SAMPLE_UPSTREAM.freshness,
              [field]: 'May 9 2026 02:00:00 GMT', // Date.parse accepts this; isStrictIso rejects it
            },
          }),
          { status: 200 },
        ),
      );
      const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
      const result = await adapter.fetchCurrent(PARAMS);
      expect(result.kind).toBe('upstream-error');
    });
  },
);
```

- [ ] **Step 8.2: Run and verify pass**

Run: `pnpm --filter @clmm/adapters test -- CurrentRegimeAdapter -t "non-ISO"`
Expected: PASS for all three field names.

- [ ] **Step 8.3: Commit**

```bash
git add packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.test.ts
git commit -m "test(adapters): adapter rejects parseable-but-non-ISO timestamp strings"
```

---

## Task 9: Adapter — Recognized-timeframe duration check

**Files:**

- Modify: `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.ts`
- Modify: `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.test.ts`

This is the only validation rule that needs both metadata and freshness, so it lands after metadata parsing.

- [ ] **Step 9.1: Write the failing tests**

Add to `CurrentRegimeAdapter.test.ts`:

```ts
it('rejects when derivedTimeframe is 1h but candle window is 30 minutes', async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(
      JSON.stringify({
        ...SAMPLE_UPSTREAM,
        freshness: {
          ...SAMPLE_UPSTREAM.freshness,
          // 30-minute window
          lastCandleOpenUnixMs: Date.parse('2026-05-06T11:30:00Z'),
          lastCandleOpenIso: '2026-05-06T11:30:00Z',
          lastCandleCloseUnixMs: Date.parse('2026-05-06T12:00:00Z'),
          lastCandleCloseIso: '2026-05-06T12:00:00Z',
          ageSeconds: 0,
        },
        // derivedTimeframe is '1h' from the existing SAMPLE_UPSTREAM.metadata
      }),
      { status: 200 },
    ),
  );
  const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent(PARAMS);
  expect(result.kind).toBe('upstream-error');
});

it('accepts unrecognized timeframes without duration validation', async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(
      JSON.stringify({
        ...SAMPLE_UPSTREAM,
        freshness: {
          ...SAMPLE_UPSTREAM.freshness,
          // 7-minute window
          lastCandleOpenUnixMs: Date.parse('2026-05-06T11:53:00Z'),
          lastCandleOpenIso: '2026-05-06T11:53:00Z',
          lastCandleCloseUnixMs: Date.parse('2026-05-06T12:00:00Z'),
          lastCandleCloseIso: '2026-05-06T12:00:00Z',
          ageSeconds: 0,
        },
        metadata: {
          ...SAMPLE_UPSTREAM.metadata,
          derivedTimeframe: '7m', // unrecognized
        },
        timeframe: '7m', // also override the top-level for consistency
      }),
      { status: 200 },
    ),
  );
  const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
  const result = await adapter.fetchCurrent({ ...PARAMS, timeframe: '7m' });
  expect(result.kind).toBe('block');
});
```

- [ ] **Step 9.2: Run the tests and verify they fail**

Run: `pnpm --filter @clmm/adapters test -- CurrentRegimeAdapter -t "1h but candle window|unrecognized timeframes"`
Expected: First test FAIL (currently parses as block — duration not validated yet), second test PASS (already accepted).

- [ ] **Step 9.3: Implement the timeframe duration check**

In `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.ts`, find the end of `parseUpstream` — just before `return { regime: regime as MarketRegime, ... }` (around line 158). After all metadata fields have been parsed and before the return statement, add:

```ts
// Recognized-timeframe duration check: skip silently for unknown labels.
const tfKey = derivedTimeframe ?? timeframe;
const expectedDurationMs = RECOGNIZED_TIMEFRAME_MS[tfKey];
if (expectedDurationMs !== undefined) {
  if (lastCandleCloseUnixMs - lastCandleOpenUnixMs !== expectedDurationMs) return null;
}
```

- [ ] **Step 9.4: Run the tests and verify both pass**

Run: `pnpm --filter @clmm/adapters test -- CurrentRegimeAdapter -t "1h but candle window|unrecognized timeframes"`
Expected: PASS for both.

- [ ] **Step 9.5: Run the full adapter suite**

Run: `pnpm --filter @clmm/adapters test`
Expected: PASS — all adapter tests green.

- [ ] **Step 9.6: Commit**

```bash
git add packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.ts \
        packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.test.ts
git commit -m "feat(adapters): validate close-open against recognized timeframe duration"
```

---

## Task 10: Adapter — Fixture updates in `RegimeBlockParity` and `RegimeController` tests

**Files:**

- Modify: `packages/adapters/src/outbound/regime-engine/RegimeBlockParity.test.ts`
- Modify: `packages/adapters/src/inbound/http/RegimeController.test.ts`

Both files contain DTO fixtures with the old `lastCandleUnixMs` field. They need mechanical migration to compile against the new `RegimeFreshness` type.

- [ ] **Step 10.1: Run both files to confirm they fail**

Run: `pnpm --filter @clmm/adapters test -- "RegimeBlockParity|RegimeController"`
Expected: FAIL — type errors / missing fields against new `RegimeFreshness`.

- [ ] **Step 10.2: Update `RegimeBlockParity.test.ts`**

Find the `freshness` block (around line 15) and replace with:

```ts
  freshness: {
    generatedAtUnixMs: 1_700_000_000_000,
    generatedAtIso: '2023-11-14T22:13:20.000Z',
    lastCandleOpenUnixMs: 1_700_000_000_000 - 60 * 60_000,
    lastCandleOpenIso: '2023-11-14T21:13:20.000Z',
    lastCandleCloseUnixMs: 1_700_000_000_000,
    lastCandleCloseIso: '2023-11-14T22:13:20.000Z',
    ageSeconds: 0,
    softStale: false,
    hardStale: false,
    softStaleSeconds: 75 * 60,
    hardStaleSeconds: 90 * 60,
  },
```

(The exact ISO strings must match `new Date(unixMs).toISOString()` for the chosen ms values; if the current fixture uses different ms anchors, derive from those instead. The test is parity-only and does not exercise validation rules.)

Replace any assertions that reference `lastCandleUnixMs` with the new candle-close field. For example, change:

```ts
expect(sampleBlock.freshness.softStaleSeconds).toBeLessThan(sampleBlock.freshness.hardStaleSeconds);
```

(no change needed) — but if there's an assertion on `lastCandleUnixMs`, replace it with `lastCandleCloseUnixMs` and add an assertion for window positivity:

```ts
expect(sampleBlock.freshness.lastCandleCloseUnixMs).toBeGreaterThan(
  sampleBlock.freshness.lastCandleOpenUnixMs,
);
expect(typeof sampleBlock.freshness.lastCandleOpenIso).toBe('string');
expect(typeof sampleBlock.freshness.lastCandleCloseIso).toBe('string');
```

- [ ] **Step 10.3: Update `RegimeController.test.ts`**

Find the `freshness` block (around line 25) and replace with the same shape as Step 10.2, adjusting the timestamp anchor to match the existing test (the existing fixture uses `1_700_000_000_000 - 87 * 60_000` — preserve the anchor relationship by setting `lastCandleCloseUnixMs` to that value, `lastCandleOpenUnixMs` 60 minutes earlier, and `generatedAtUnixMs` at the close):

```ts
  freshness: {
    generatedAtUnixMs: 1_700_000_000_000 - 87 * 60_000,
    generatedAtIso: new Date(1_700_000_000_000 - 87 * 60_000).toISOString(),
    lastCandleOpenUnixMs: 1_700_000_000_000 - 87 * 60_000 - 60 * 60_000,
    lastCandleOpenIso: new Date(1_700_000_000_000 - 87 * 60_000 - 60 * 60_000).toISOString(),
    lastCandleCloseUnixMs: 1_700_000_000_000 - 87 * 60_000,
    lastCandleCloseIso: new Date(1_700_000_000_000 - 87 * 60_000).toISOString(),
    ageSeconds: 0,
    softStale: false,
    hardStale: false,
    softStaleSeconds: 75 * 60,
    hardStaleSeconds: 90 * 60,
  },
```

- [ ] **Step 10.4: Run and verify pass**

Run: `pnpm --filter @clmm/adapters test`
Expected: PASS — full adapter suite green.

- [ ] **Step 10.5: Commit**

```bash
git add packages/adapters/src/outbound/regime-engine/RegimeBlockParity.test.ts \
        packages/adapters/src/inbound/http/RegimeController.test.ts
git commit -m "test(adapters): migrate Regime fixtures to new freshness shape"
```

---

## Task 11: App validator — Strict-ISO helper, old-shape rejection, and migrated fixtures

**Files:**

- Modify: `apps/app/src/api/regime.ts`
- Modify: `apps/app/src/api/regime.test.ts`

- [ ] **Step 11.1: Update the test fixture and add the rejection-matrix tests**

In `apps/app/src/api/regime.test.ts`, replace the `freshness` block in `fixtureBlock()` (lines 42–50) with:

```ts
    freshness: {
      generatedAtUnixMs: 1_745_712_000_000,
      generatedAtIso: new Date(1_745_712_000_000).toISOString(),
      lastCandleOpenUnixMs: 1_745_712_000_000 - 60 * 60_000,
      lastCandleOpenIso: new Date(1_745_712_000_000 - 60 * 60_000).toISOString(),
      lastCandleCloseUnixMs: 1_745_712_000_000,
      lastCandleCloseIso: new Date(1_745_712_000_000).toISOString(),
      ageSeconds: 0,
      softStale: false,
      hardStale: false,
      softStaleSeconds: 75 * 60,
      hardStaleSeconds: 90 * 60,
    },
```

Then, just before the final `});` of the file (after the existing `throws when the response uses the deprecated capturedAtUnixMs freshness shape` test), add:

```ts
describe.each([
  ['lastCandleIso', 'foo'],
  ['lastCandleIso', null],
  ['lastCandleIso', undefined],
  ['lastCandleIso', ''],
  ['lastCandleUnixMs', 1_745_712_000_000],
  ['lastCandleUnixMs', null],
  ['lastCandleUnixMs', undefined],
  ['lastCandleUnixMs', 0],
])('rejects regime block with legacy key %s = %p', (key, value) => {
  it('throws "malformed regime block"', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    const block = fixtureBlock();
    const broken = {
      ...block,
      freshness: { ...block.freshness, [key]: value },
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
});
```

- [ ] **Step 11.2: Run the test file — expect type errors**

Run: `pnpm --filter @clmm/app test -- regime.test`
Expected: FAIL — `RegimeFreshness` type mismatch in `fixtureBlock` (TypeScript) and most positive-path tests fail at runtime because `isRegimeFreshnessBlock` still validates the old shape.

- [ ] **Step 11.3: Update `isRegimeFreshnessBlock`**

In `apps/app/src/api/regime.ts`, add the strict-ISO helper near the top of the file (after the existing `isRecord` helper, around line 38):

```ts
const ISO_8601_UTC_OR_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
function isStrictIso(value: unknown): value is string {
  return typeof value === 'string' && ISO_8601_UTC_OR_OFFSET.test(value);
}
```

Then replace `isRegimeFreshnessBlock` (lines 71–86) with:

```ts
function isRegimeFreshnessBlock(value: unknown): value is RegimeFreshness {
  if (!isRecord(value)) return false;

  // Reject the old ambiguous shape by key presence (not truthiness).
  if (
    Object.prototype.hasOwnProperty.call(value, 'lastCandleIso') ||
    Object.prototype.hasOwnProperty.call(value, 'lastCandleUnixMs')
  ) {
    return false;
  }

  const generatedAtMs = value['generatedAtUnixMs'];
  const generatedAtIso = value['generatedAtIso'];
  const openMs = value['lastCandleOpenUnixMs'];
  const openIso = value['lastCandleOpenIso'];
  const closeMs = value['lastCandleCloseUnixMs'];
  const closeIso = value['lastCandleCloseIso'];
  const age = value['ageSeconds'];
  const softSec = value['softStaleSeconds'];
  const hardSec = value['hardStaleSeconds'];

  if (typeof generatedAtMs !== 'number' || !Number.isFinite(generatedAtMs) || generatedAtMs <= 0)
    return false;
  if (typeof openMs !== 'number' || !Number.isFinite(openMs) || openMs <= 0) return false;
  if (typeof closeMs !== 'number' || !Number.isFinite(closeMs) || closeMs <= 0) return false;
  if (!isStrictIso(generatedAtIso)) return false;
  if (!isStrictIso(openIso)) return false;
  if (!isStrictIso(closeIso)) return false;

  // ISO/MS parity for all three pairs (BFF/client divergence guard).
  if (Date.parse(generatedAtIso) !== generatedAtMs) return false;
  if (Date.parse(openIso) !== openMs) return false;
  if (Date.parse(closeIso) !== closeMs) return false;

  // Window order: close strictly after open.
  if (closeMs <= openMs) return false;
  // Generation order: generation at-or-after close.
  if (generatedAtMs < closeMs) return false;

  if (typeof age !== 'number' || !Number.isFinite(age) || age < 0) return false;
  if (typeof value['softStale'] !== 'boolean') return false;
  if (typeof value['hardStale'] !== 'boolean') return false;
  if (typeof softSec !== 'number' || !Number.isFinite(softSec) || softSec <= 0) return false;
  if (typeof hardSec !== 'number' || !Number.isFinite(hardSec) || hardSec <= softSec) return false;
  return true;
}
```

- [ ] **Step 11.4: Run the tests and verify all pass**

Run: `pnpm --filter @clmm/app test -- regime.test`
Expected: PASS — happy path, deprecated-shape rejections, and new legacy-key matrix.

- [ ] **Step 11.5: Commit**

```bash
git add apps/app/src/api/regime.ts apps/app/src/api/regime.test.ts
git commit -m "feat(app): regime response validator enforces new open/close contract"
```

---

## Task 12: App validator — Additional rejection coverage (parity + ordering + ISO format)

**Files:**

- Modify: `apps/app/src/api/regime.test.ts`

The implementation already enforces these (Task 11). This task adds explicit coverage.

- [ ] **Step 12.1: Add coverage tests**

Append to `apps/app/src/api/regime.test.ts` before the closing `});`:

```ts
describe.each(['generatedAtIso', 'lastCandleOpenIso', 'lastCandleCloseIso'])(
  'rejects regime block with parseable-but-non-ISO %s',
  (field) => {
    it('throws "malformed regime block"', async () => {
      env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
      const block = fixtureBlock();
      const broken = {
        ...block,
        freshness: { ...block.freshness, [field]: 'May 9 2026 02:00:00 GMT' },
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
  },
);

describe.each([
  ['generatedAtIso', 'generatedAtUnixMs'],
  ['lastCandleOpenIso', 'lastCandleOpenUnixMs'],
  ['lastCandleCloseIso', 'lastCandleCloseUnixMs'],
])('rejects regime block with ISO/MS divergence on %s vs %s', (isoField, msField) => {
  it('throws "malformed regime block"', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    const block = fixtureBlock();
    const ms = (block.freshness as unknown as Record<string, number>)[msField];
    const broken = {
      ...block,
      freshness: {
        ...block.freshness,
        // Keep ms identical; offset ISO by 1 second to force divergence.
        [isoField]: new Date(ms + 1000).toISOString(),
      },
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
});

it('rejects when lastCandleCloseUnixMs equals lastCandleOpenUnixMs', async () => {
  env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
  const block = fixtureBlock();
  const broken = {
    ...block,
    freshness: {
      ...block.freshness,
      lastCandleOpenUnixMs: block.freshness.lastCandleCloseUnixMs,
      lastCandleOpenIso: block.freshness.lastCandleCloseIso,
    },
  };
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ regime: broken }),
  }) as typeof fetch;
  const error = await fetchCurrentRegime(POOL_ID).catch((reason: unknown) => reason);
  expect((error as Error).message).toContain('malformed regime block');
});

it('rejects when generatedAtUnixMs is before lastCandleCloseUnixMs', async () => {
  env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
  const block = fixtureBlock();
  const earlierMs = block.freshness.lastCandleCloseUnixMs - 60_000;
  const broken = {
    ...block,
    freshness: {
      ...block.freshness,
      generatedAtUnixMs: earlierMs,
      generatedAtIso: new Date(earlierMs).toISOString(),
    },
  };
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ regime: broken }),
  }) as typeof fetch;
  const error = await fetchCurrentRegime(POOL_ID).catch((reason: unknown) => reason);
  expect((error as Error).message).toContain('malformed regime block');
});
```

- [ ] **Step 12.2: Run and verify pass**

Run: `pnpm --filter @clmm/app test -- regime.test`
Expected: PASS for all new tests.

- [ ] **Step 12.3: Commit**

```bash
git add apps/app/src/api/regime.test.ts
git commit -m "test(app): regime validator rejects parity, ordering, and non-ISO violations"
```

---

## Task 13: View model — Display-age formula and collapsed wording

**Files:**

- Modify: `packages/ui/src/view-models/RegimeViewModel.test.ts`
- Modify: `packages/ui/src/view-models/RegimeViewModel.ts`

This task migrates the test fixture to the new freshness shape and locks the new display-age formula and collapsed wording.

- [ ] **Step 13.1: Migrate the test fixture**

In `packages/ui/src/view-models/RegimeViewModel.test.ts`, replace the constants and `makeBlock` helper (lines 5–37) with:

```ts
const GENERATED = 1_700_000_000_000;
const LAST_CANDLE_CLOSE = GENERATED;
const LAST_CANDLE_OPEN = GENERATED - 60 * 60_000;
const AGE_SECONDS = 0; // generated at close

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
      generatedAtIso: new Date(GENERATED).toISOString(),
      lastCandleOpenUnixMs: LAST_CANDLE_OPEN,
      lastCandleOpenIso: new Date(LAST_CANDLE_OPEN).toISOString(),
      lastCandleCloseUnixMs: LAST_CANDLE_CLOSE,
      lastCandleCloseIso: new Date(LAST_CANDLE_CLOSE).toISOString(),
      ageSeconds: AGE_SECONDS,
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
    ...overrides,
  };
}
```

- [ ] **Step 13.2: Migrate every existing freshness override in the test file**

The test file contains many `freshness: { ... }` overrides (lines 43, 68, 87, 106, 172, 348, 366, 385, 404, 423, 442). Update each to the new shape. The general migration pattern: any override that sets `lastCandleUnixMs: X` becomes `lastCandleOpenUnixMs: X - 60 * 60_000`, `lastCandleOpenIso: new Date(X - 60 * 60_000).toISOString()`, `lastCandleCloseUnixMs: X`, `lastCandleCloseIso: new Date(X).toISOString()`. For each freshness override, also add `generatedAtIso: new Date(generatedAtUnixMs).toISOString()`.

For brevity, the executing engineer should do this with a focused find/replace; verify by reading each test that previously asserted a 87m-old or 150m-old candle and confirm the new candle close + `ageSeconds` make the same age claim.

In particular, replace these tests' `latestCandleAgeLabel` assertions (lines 167 and 184) with the new wording:

```ts
expect(vm.latestCandleAgeLabel).toBe('Latest closed candle is 87m old');
// ...
expect(vm.latestCandleAgeLabel).toBe('Latest closed candle is 150m old');
```

(Computed from `displayAgeSeconds = ageSeconds + (now - generatedAtUnixMs) / 1000`.)

For the test `formats latestCandleAge from live clock (now - lastCandleUnixMs)` (line 165), rename to `'formats latestCandleAge from upstream ageSeconds plus elapsed since generatedAt'` and use a fixture where `ageSeconds = 87 * 60` and `now = generatedAtUnixMs` so the expected label is `'Latest closed candle is 87m old'`.

For the test `computes candle age from live clock, not cached ageSeconds` (line 170), rename to `'advances candle age by elapsed-since-generatedAt'` and use `ageSeconds = 30 * 60`, `now - generatedAtUnixMs = 120 * 60_000` so the expected label is `'Latest closed candle is 150m old'`.

- [ ] **Step 13.3: Run the test file — expect failures**

Run: `pnpm --filter @clmm/ui test -- RegimeViewModel`
Expected: FAIL — multiple tests fail because the view model still uses `lastCandleUnixMs` and the old wording.

- [ ] **Step 13.4: Update the view model**

In `packages/ui/src/view-models/RegimeViewModel.ts`, replace `buildFreshnessRows` (lines 176–199) and `buildRegimeViewModelBlock` (lines 201–231) with the following.

First, add a display-age helper just above `buildFreshnessRows`:

```ts
function computeDisplayAgeSeconds(block: RegimeBlock, now: number): number {
  const elapsedSinceGenerated = Math.max(
    0,
    Math.floor((now - block.freshness.generatedAtUnixMs) / 1000),
  );
  return block.freshness.ageSeconds + elapsedSinceGenerated;
}
```

Then update `buildRegimeViewModelBlock`:

```ts
export function buildRegimeViewModelBlock(block: RegimeBlock, now: number): RegimeViewModelBlock {
  const dataQuality = classifyDataQuality(block.freshness.softStale, block.freshness.hardStale);
  const generatedElapsedMs = Math.max(0, now - block.freshness.generatedAtUnixMs);
  const generatedAgeLabel = `Generated ${formatMinutesAgo(generatedElapsedMs)} ago`;
  const displayAgeSeconds = computeDisplayAgeSeconds(block, now);
  const latestCandleAgeLabel = `Latest closed candle is ${formatMinutesAgo(displayAgeSeconds * 1000)} old`;
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
    expandedFreshnessRows: buildFreshnessRows(block, now),
  };
}
```

Update `buildFreshnessRows` to consume `displayAgeSeconds` (full row-shape replacement happens in Task 15; for now keep the row count the same by using the close timestamp where the old code used `lastCandleUnixMs`):

```ts
function buildFreshnessRows(block: RegimeBlock, now: number): RegimeDetailRow[] {
  const displayAgeSeconds = computeDisplayAgeSeconds(block, now);
  return [
    {
      label: 'Latest candle',
      value: `${formatMinutesAgo(displayAgeSeconds * 1000)} old`,
      tone: block.freshness.hardStale
        ? 'danger'
        : block.freshness.softStale
          ? 'warning'
          : 'default',
    },
    {
      label: 'Soft stale threshold',
      value: formatFreshnessThresholdSeconds(block.freshness.softStaleSeconds),
      tone: 'muted',
    },
    {
      label: 'Hard stale threshold',
      value: formatFreshnessThresholdSeconds(block.freshness.hardStaleSeconds),
      tone: 'muted',
    },
  ];
}
```

(Task 15 expands these rows further — splitting the single "Latest candle" row into open/close/age and renaming. Keeping it minimal here so the display-age formula and collapsed wording change can land cleanly.)

- [ ] **Step 13.5: Run and verify the migrated tests pass**

Run: `pnpm --filter @clmm/ui test -- RegimeViewModel`
Expected: PASS — all view-model tests pass against the new fixture, new wording, and new display-age formula.

- [ ] **Step 13.6: Commit**

```bash
git add packages/ui/src/view-models/RegimeViewModel.ts \
        packages/ui/src/view-models/RegimeViewModel.test.ts
git commit -m "feat(ui): RegimeViewModel uses ageSeconds + elapsed-since-generation for display age"
```

---

## Task 14: View model — Deterministic clock formatter `formatCandleClockTime`

**Files:**

- Modify: `packages/ui/src/view-models/RegimeViewModel.ts`
- Modify: `packages/ui/src/view-models/RegimeViewModel.test.ts`

- [ ] **Step 14.1: Write failing tests for `formatCandleClockTime`**

Append to `packages/ui/src/view-models/RegimeViewModel.test.ts` after the last `describe` block:

```ts
import { formatCandleClockTime } from './RegimeViewModel.js';

describe('formatCandleClockTime', () => {
  const NOON_UTC = Date.parse('2026-05-09T12:00:00Z');

  it('formats same-day timestamps as HH:MM in 24-hour format', () => {
    expect(
      formatCandleClockTime(Date.parse('2026-05-09T02:00:00Z'), NOON_UTC, {
        locale: 'en-US',
        timeZone: 'UTC',
      }),
    ).toBe('02:00');
  });

  it('formats different-day timestamps with a date prefix', () => {
    const open = Date.parse('2026-05-08T23:00:00Z');
    const close = Date.parse('2026-05-09T00:00:00Z');
    const now = Date.parse('2026-05-09T00:30:00Z');
    expect(formatCandleClockTime(open, now, { locale: 'en-US', timeZone: 'UTC' })).toBe(
      'May 8, 23:00',
    );
    expect(formatCandleClockTime(close, now, { locale: 'en-US', timeZone: 'UTC' })).toBe('00:00');
  });

  it('respects the injected timeZone for "today" comparison', () => {
    // 2026-05-09T01:30:00-08:00 is the same calendar day as 2026-05-09T05:00:00-08:00
    // even though they straddle UTC midnight.
    const earlyAm = Date.parse('2026-05-09T09:30:00Z'); // 01:30 PT
    const later = Date.parse('2026-05-09T13:00:00Z'); // 05:00 PT
    expect(
      formatCandleClockTime(earlyAm, later, { locale: 'en-US', timeZone: 'America/Los_Angeles' }),
    ).toBe('01:30');
  });
});
```

- [ ] **Step 14.2: Run the tests and verify they fail**

Run: `pnpm --filter @clmm/ui test -- RegimeViewModel -t "formatCandleClockTime"`
Expected: FAIL — `formatCandleClockTime` is not exported.

- [ ] **Step 14.3: Implement `formatCandleClockTime` and export it**

In `packages/ui/src/view-models/RegimeViewModel.ts`, add (near the other formatter helpers, e.g. after `formatFreshnessThresholdSeconds`, around line 84):

```ts
export type ClockFormatOptions = { locale?: string; timeZone?: string };

export function formatCandleClockTime(
  unixMs: number,
  now: number,
  opts?: ClockFormatOptions,
): string {
  const locale = opts?.locale;
  const timeZone = opts?.timeZone;
  const dayKey = (ms: number): string =>
    new Intl.DateTimeFormat(locale, {
      ...(timeZone ? { timeZone } : {}),
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).format(new Date(ms));
  const time = new Intl.DateTimeFormat(locale, {
    ...(timeZone ? { timeZone } : {}),
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(unixMs));
  if (dayKey(unixMs) === dayKey(now)) return time;
  const datePrefix = new Intl.DateTimeFormat(locale, {
    ...(timeZone ? { timeZone } : {}),
    month: 'short',
    day: 'numeric',
  }).format(new Date(unixMs));
  return `${datePrefix}, ${time}`;
}
```

- [ ] **Step 14.4: Run the tests and verify they pass**

Run: `pnpm --filter @clmm/ui test -- RegimeViewModel -t "formatCandleClockTime"`
Expected: PASS for all three.

If the `Intl.DateTimeFormat` output for `en-US` differs from the expected strings on the runner (e.g. `"May 8"` vs `"May 8,"` shape), pin the expected strings to whatever the runner produces. Prefer adjusting the test expectation over reformatting; the goal is determinism, not a specific glyph.

- [ ] **Step 14.5: Commit**

```bash
git add packages/ui/src/view-models/RegimeViewModel.ts \
        packages/ui/src/view-models/RegimeViewModel.test.ts
git commit -m "feat(ui): add deterministic formatCandleClockTime helper"
```

---

## Task 15: View model — Expanded freshness rows expose open/close window

**Files:**

- Modify: `packages/ui/src/view-models/RegimeViewModel.ts`
- Modify: `packages/ui/src/view-models/RegimeViewModel.test.ts`

This task replaces the single "Latest candle" expanded row with three rows: open, close, close-age.

- [ ] **Step 15.1: Write failing tests for the new expanded-row shape**

Find the existing test `describe('buildRegimeViewModelBlock — expanded rows', () => { ... })` block in `packages/ui/src/view-models/RegimeViewModel.test.ts`. Inside that block, after the last test, add:

```ts
it('expanded freshness rows expose open, close, and close-age (no "Latest candle" row)', () => {
  const open = Date.parse('2026-05-09T01:00:00Z');
  const close = Date.parse('2026-05-09T02:00:00Z');
  const generated = Date.parse('2026-05-09T02:48:00Z');
  const block = makeBlock({
    freshness: {
      generatedAtUnixMs: generated,
      generatedAtIso: '2026-05-09T02:48:00Z',
      lastCandleOpenUnixMs: open,
      lastCandleOpenIso: '2026-05-09T01:00:00Z',
      lastCandleCloseUnixMs: close,
      lastCandleCloseIso: '2026-05-09T02:00:00Z',
      ageSeconds: 48 * 60,
      softStale: false,
      hardStale: false,
      softStaleSeconds: 75 * 60,
      hardStaleSeconds: 90 * 60,
    },
  });
  const vm = buildRegimeViewModelBlock(block, generated, {
    locale: 'en-US',
    timeZone: 'UTC',
  });
  expect(vm.expandedFreshnessRows.map((r) => r.label)).toEqual([
    'Latest candle open',
    'Latest candle close',
    'Latest closed candle age',
    'Soft stale threshold',
    'Hard stale threshold',
  ]);
  expect(vm.expandedFreshnessRows[0]?.value).toBe('01:00');
  expect(vm.expandedFreshnessRows[1]?.value).toBe('02:00');
  expect(vm.expandedFreshnessRows[2]?.value).toBe('48m old');
});
```

- [ ] **Step 15.2: Run the test and verify it fails**

Run: `pnpm --filter @clmm/ui test -- RegimeViewModel -t "expose open, close"`
Expected: FAIL — current rows are `['Latest candle', 'Soft stale threshold', 'Hard stale threshold']` and `buildRegimeViewModelBlock` does not accept `opts`.

- [ ] **Step 15.3: Update `buildRegimeViewModelBlock` to accept `opts` and rebuild `buildFreshnessRows`**

In `packages/ui/src/view-models/RegimeViewModel.ts`, change the signature of `buildRegimeViewModelBlock` to accept an optional `opts` and thread it into `buildFreshnessRows`:

```ts
export function buildRegimeViewModelBlock(
  block: RegimeBlock,
  now: number,
  opts?: ClockFormatOptions,
): RegimeViewModelBlock {
```

…and at the call site:

```ts
    expandedFreshnessRows: buildFreshnessRows(block, now, opts),
```

Replace the body of `buildFreshnessRows` with:

```ts
function buildFreshnessRows(
  block: RegimeBlock,
  now: number,
  opts?: ClockFormatOptions,
): RegimeDetailRow[] {
  const displayAgeSeconds = computeDisplayAgeSeconds(block, now);
  const ageTone: RegimeDetailRow['tone'] = block.freshness.hardStale
    ? 'danger'
    : block.freshness.softStale
      ? 'warning'
      : 'default';
  return [
    {
      label: 'Latest candle open',
      value: formatCandleClockTime(block.freshness.lastCandleOpenUnixMs, now, opts),
    },
    {
      label: 'Latest candle close',
      value: formatCandleClockTime(block.freshness.lastCandleCloseUnixMs, now, opts),
    },
    {
      label: 'Latest closed candle age',
      value: `${formatMinutesAgo(displayAgeSeconds * 1000)} old`,
      tone: ageTone,
    },
    {
      label: 'Soft stale threshold',
      value: formatFreshnessThresholdSeconds(block.freshness.softStaleSeconds),
      tone: 'muted',
    },
    {
      label: 'Hard stale threshold',
      value: formatFreshnessThresholdSeconds(block.freshness.hardStaleSeconds),
      tone: 'muted',
    },
  ];
}
```

- [ ] **Step 15.4: Run the test and verify it passes**

Run: `pnpm --filter @clmm/ui test -- RegimeViewModel -t "expose open, close"`
Expected: PASS.

- [ ] **Step 15.5: Run the full RegimeViewModel test file**

Run: `pnpm --filter @clmm/ui test -- RegimeViewModel`
Expected: PASS — including any prior tests that asserted on the (now-removed) `Latest candle` expanded row label. If a prior test still expects `'Latest candle'`, update it to `'Latest closed candle age'` (the row that carries the same age value).

- [ ] **Step 15.6: Commit**

```bash
git add packages/ui/src/view-models/RegimeViewModel.ts \
        packages/ui/src/view-models/RegimeViewModel.test.ts
git commit -m "feat(ui): Regime expanded rows expose candle open/close window"
```

---

## Task 16: View model — Stale-tone independence (architectural rule test)

**Files:**

- Modify: `packages/ui/src/view-models/RegimeViewModel.test.ts`

- [ ] **Step 16.1: Write the explicit independence test**

Add inside the `describe('buildRegimeViewModelBlock — data quality', ...)` block:

```ts
it('keeps Fresh tone when displayAgeSeconds exceeds hardStaleSeconds but upstream flags are false', () => {
  // Synthetic: ageSeconds=10_000 is far above hardStaleSeconds=5_400, but upstream says fresh.
  const block = makeBlock({
    freshness: {
      generatedAtUnixMs: GENERATED,
      generatedAtIso: new Date(GENERATED).toISOString(),
      lastCandleOpenUnixMs: LAST_CANDLE_OPEN,
      lastCandleOpenIso: new Date(LAST_CANDLE_OPEN).toISOString(),
      lastCandleCloseUnixMs: LAST_CANDLE_CLOSE,
      lastCandleCloseIso: new Date(LAST_CANDLE_CLOSE).toISOString(),
      ageSeconds: 10_000,
      softStale: false,
      hardStale: false,
      softStaleSeconds: 75 * 60,
      hardStaleSeconds: 90 * 60,
    },
  });
  const vm = buildRegimeViewModelBlock(block, GENERATED, { locale: 'en-US', timeZone: 'UTC' });
  expect(vm.dataQualityLabel).toMatch(/fresh/i);
  expect(vm.dataQualityTone).toBe('success');
  const ageRow = vm.expandedFreshnessRows.find((r) => r.label === 'Latest closed candle age');
  expect(ageRow?.tone).toBe('default');
});
```

- [ ] **Step 16.2: Run and verify pass**

Run: `pnpm --filter @clmm/ui test -- RegimeViewModel -t "Fresh tone when displayAgeSeconds"`
Expected: PASS — `classifyDataQuality` and `ageTone` both consume only upstream flags.

- [ ] **Step 16.3: Commit**

```bash
git add packages/ui/src/view-models/RegimeViewModel.test.ts
git commit -m "test(ui): RegimeViewModel never infers stale from displayAgeSeconds"
```

---

## Task 17: View model — Pin `formatMinutesAgo` rounding behavior

**Files:**

- Modify: `packages/ui/src/view-models/RegimeViewModel.test.ts`

- [ ] **Step 17.1: Write the rounding tests**

Append a new `describe` block at the end of the file:

```ts
describe('formatMinutesAgo (via expandedFreshnessRows close-age)', () => {
  function ageRowValue(ageSeconds: number): string {
    const block = makeBlock({
      freshness: {
        generatedAtUnixMs: GENERATED,
        generatedAtIso: new Date(GENERATED).toISOString(),
        lastCandleOpenUnixMs: LAST_CANDLE_OPEN,
        lastCandleOpenIso: new Date(LAST_CANDLE_OPEN).toISOString(),
        lastCandleCloseUnixMs: LAST_CANDLE_CLOSE,
        lastCandleCloseIso: new Date(LAST_CANDLE_CLOSE).toISOString(),
        ageSeconds,
        softStale: false,
        hardStale: false,
        softStaleSeconds: 75 * 60,
        hardStaleSeconds: 90 * 60,
      },
    });
    const vm = buildRegimeViewModelBlock(block, GENERATED, {
      locale: 'en-US',
      timeZone: 'UTC',
    });
    const row = vm.expandedFreshnessRows.find((r) => r.label === 'Latest closed candle age');
    return row?.value ?? '';
  }

  it('rounds 29 seconds down to 0m', () => {
    expect(ageRowValue(29)).toBe('0m old');
  });
  it('rounds 30 seconds up to 1m (Math.round half-up)', () => {
    expect(ageRowValue(30)).toBe('1m old');
  });
  it('rounds 89 seconds to 1m', () => {
    expect(ageRowValue(89)).toBe('1m old');
  });
  it('rounds 90 seconds to 2m', () => {
    expect(ageRowValue(90)).toBe('2m old');
  });
});
```

- [ ] **Step 17.2: Run and verify pass**

Run: `pnpm --filter @clmm/ui test -- RegimeViewModel -t "formatMinutesAgo"`
Expected: PASS — current `formatMinutesAgo` uses `Math.round`.

- [ ] **Step 17.3: Commit**

```bash
git add packages/ui/src/view-models/RegimeViewModel.test.ts
git commit -m "test(ui): pin formatMinutesAgo rounding boundaries"
```

---

## Task 18: Component — `RegimeSection` fixture and copy assertions

**Files:**

- Modify: `packages/ui/src/components/RegimeSection.test.tsx`

The component itself is unchanged in source. The test file uses a fixture with the old freshness shape and asserts on the old `'Latest candle is …'` copy.

- [ ] **Step 18.1: Run the file to confirm it fails**

Run: `pnpm --filter @clmm/ui test -- RegimeSection`
Expected: FAIL — type errors against new `RegimeFreshness`, copy mismatch.

- [ ] **Step 18.2: Migrate the fixture**

In `packages/ui/src/components/RegimeSection.test.tsx`, find the freshness block (around line 28) and replace with:

```ts
  freshness: {
    generatedAtUnixMs: GENERATED,
    generatedAtIso: new Date(GENERATED).toISOString(),
    lastCandleOpenUnixMs: LAST_CANDLE - 60 * 60_000,
    lastCandleOpenIso: new Date(LAST_CANDLE - 60 * 60_000).toISOString(),
    lastCandleCloseUnixMs: LAST_CANDLE,
    lastCandleCloseIso: new Date(LAST_CANDLE).toISOString(),
    ageSeconds: 87 * 60,
    softStale: false,
    hardStale: false,
    softStaleSeconds: 75 * 60,
    hardStaleSeconds: 90 * 60,
  },
```

(Where `LAST_CANDLE` is the existing constant in the file. If the existing constant relationship was `LAST_CANDLE = GENERATED - 87*60_000`, this preserves the 87-minute close-age claim with `ageSeconds=87*60` and `now=GENERATED`.)

- [ ] **Step 18.3: Update copy assertions**

Find any assertion on the substring `'Latest candle is'` and change it to `'Latest closed candle is'`. If the file asserts on the expanded "Latest candle" row label, change it to `'Latest closed candle age'`.

- [ ] **Step 18.4: Run and verify pass**

Run: `pnpm --filter @clmm/ui test -- RegimeSection`
Expected: PASS.

- [ ] **Step 18.5: Commit**

```bash
git add packages/ui/src/components/RegimeSection.test.tsx
git commit -m "test(ui): RegimeSection fixture and copy match new freshness contract"
```

---

## Task 19: Full-repo verification

**Files:** None.

This is the final gate — confirm cross-package boundaries hold and the full suite is green.

- [ ] **Step 19.1: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS across all packages.

- [ ] **Step 19.2: Run lint**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 19.3: Run boundaries**

Run: `pnpm boundaries`
Expected: PASS — no boundary violations introduced.

- [ ] **Step 19.4: Run build**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 19.5: Run full test suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 19.6: Push the branch and open a PR**

```bash
git push -u origin "$(git rev-parse --abbrev-ref HEAD)"
gh pr create --title "Consume explicit Regime freshness open/close contract (closes #87)" \
  --body "$(cat <<'EOF'
## Summary
- Adopts the new explicit Regime freshness open/close contract from regime-engine #52 across DTO, adapter, app validator, and Regime view model.
- Strict immediate adoption: rejects the old `lastCandleIso` / `lastCandleUnixMs` shape by key presence at both the adapter and app-validator boundaries.
- View-model display age = upstream `ageSeconds` + elapsed-since-generation; stale classification stays strictly upstream.
- Expanded freshness rows expose Latest candle open / close as local HH:MM (with date prefix when not today), plus Latest closed candle age and the existing thresholds (per #86 formatting).

## Test plan
- [x] `pnpm --filter @clmm/application test`
- [x] `pnpm --filter @clmm/adapters test`
- [x] `pnpm --filter @clmm/app test`
- [x] `pnpm --filter @clmm/ui test`
- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [x] `pnpm boundaries`
- [x] `pnpm build`
- [x] `pnpm test`

Closes #87.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Checklist

Spec coverage (each spec section/AC mapped to a task):

- DTO type change → Task 1.
- Adapter strict-ISO + helpers → Task 2.
- Adapter happy-path + old-shape rejection → Tasks 3, 4.
- Adapter ISO/MS parity (open + close) → Task 5.
- Adapter window-order + generation-order → Task 6.
- Adapter age-parity tolerance → Task 7.
- Adapter strict-ISO format check → Task 8.
- Adapter recognized-timeframe duration → Task 9.
- Adapter sibling-fixture migration → Task 10.
- App validator strict-ISO + old-shape rejection + new-contract validation → Task 11.
- App validator parity + ordering + ISO format coverage → Task 12.
- View-model display-age formula + collapsed wording → Task 13.
- View-model `formatCandleClockTime` deterministic options → Task 14.
- View-model expanded freshness rows (open/close/age) → Task 15.
- View-model stale-tone independence → Task 16.
- View-model `formatMinutesAgo` rounding pin → Task 17.
- Component fixture + copy → Task 18.
- Full-repo verification → Task 19.

Architectural rules from the spec:

- Strict new contract; no tolerance window → Tasks 3 + 4 (adapter), Task 11 (app).
- No domain changes → no domain task; out of scope.
- Boundary-only ISO parsing — adapter and app validator use `Date.parse`; view model never does. The view model's `formatCandleClockTime` uses `new Date(unixMs)` (constructor from ms), confirmed in Task 14.
- Stale classification upstream-only → Task 16 explicit test; Task 13/15 inherit by not reading `displayAgeSeconds` in `classifyDataQuality`.

No placeholders, every step has runnable code or commands, type signatures (`RegimeFreshness`, `ClockFormatOptions`, `buildRegimeViewModelBlock`) match across tasks.
