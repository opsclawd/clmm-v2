# Regime Threshold Formatting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render Regime card freshness thresholds (soft/hard stale) as exact minute labels (e.g. `90m`) so they are directly comparable to the existing `Xm old` latest-candle label.

**Architecture:** Replace the existing `formatSecondsThreshold` helper in `packages/ui/src/view-models/RegimeViewModel.ts` (which switches to hours past 60 minutes) with a narrow `formatFreshnessThresholdSeconds` helper that always returns minutes. Only `buildFreshnessRows` consumes the helper, so no component, DTO, adapter, or domain code is touched. Tests are colocated in `RegimeViewModel.test.ts`.

**Tech Stack:** TypeScript, Vitest, pnpm workspaces (`@clmm/ui`).

---

## Spec Reference

Source spec: `docs/superpowers/specs/2026-05-09-regime-threshold-formatting-design.md`
Source GitHub issue: https://github.com/opsclawd/clmm-v2/issues/86

## File Structure

- Modify: `packages/ui/src/view-models/RegimeViewModel.ts` (lines 81–86 helper, lines 192–199 call sites)
- Modify: `packages/ui/src/view-models/RegimeViewModel.test.ts` (add tests inside the existing `buildRegimeViewModelBlock — expanded rows` describe block at line 298)

No new files. No exports change. The helper stays module-private (not exported).

---

## Task 1: Add failing tests for minute-only threshold formatting

**Files:**

- Modify: `packages/ui/src/view-models/RegimeViewModel.test.ts` (append new tests inside the `buildRegimeViewModelBlock — expanded rows` describe block, after the existing `expandedFreshnessRows computes candle age from live clock` test ending at line 359)

- [ ] **Step 1: Open the test file and locate the insertion point**

Open `packages/ui/src/view-models/RegimeViewModel.test.ts`. Find the closing `});` of the test `expandedFreshnessRows computes candle age from live clock, not cached ageSeconds` (around line 359), which is the last test inside the `buildRegimeViewModelBlock — expanded rows` describe block. Insert the new tests **before** the describe block's closing `});` (around line 360).

The existing `makeBlock` helper at the top of the file already accepts a `freshness` override and is what the new tests will use.

- [ ] **Step 2: Add the failing tests**

Insert this code block before the closing `});` of the `buildRegimeViewModelBlock — expanded rows` describe block:

```ts
it('renders soft stale threshold as exact minutes (75m, not 1h)', () => {
  const vm = buildRegimeViewModelBlock(
    makeBlock({
      freshness: {
        generatedAtUnixMs: GENERATED,
        lastCandleUnixMs: LAST_CANDLE,
        ageSeconds: 60,
        softStale: false,
        hardStale: false,
        softStaleSeconds: 4500,
        hardStaleSeconds: 5400,
      },
    }),
    GENERATED,
  );
  const soft = vm.expandedFreshnessRows.find((r) => r.label === 'Soft stale threshold');
  expect(soft?.value).toBe('75m');
});

it('renders hard stale threshold as exact minutes (90m, not 2h)', () => {
  const vm = buildRegimeViewModelBlock(
    makeBlock({
      freshness: {
        generatedAtUnixMs: GENERATED,
        lastCandleUnixMs: LAST_CANDLE,
        ageSeconds: 60,
        softStale: false,
        hardStale: false,
        softStaleSeconds: 4500,
        hardStaleSeconds: 5400,
      },
    }),
    GENERATED,
  );
  const hard = vm.expandedFreshnessRows.find((r) => r.label === 'Hard stale threshold');
  expect(hard?.value).toBe('90m');
});

it('renders 7200s as 120m (not 2h) for the hard stale threshold', () => {
  const vm = buildRegimeViewModelBlock(
    makeBlock({
      freshness: {
        generatedAtUnixMs: GENERATED,
        lastCandleUnixMs: LAST_CANDLE,
        ageSeconds: 60,
        softStale: false,
        hardStale: false,
        softStaleSeconds: 4500,
        hardStaleSeconds: 7200,
      },
    }),
    GENERATED,
  );
  const hard = vm.expandedFreshnessRows.find((r) => r.label === 'Hard stale threshold');
  expect(hard?.value).toBe('120m');
});

it('renders 9000s as 150m (not 3h) for the hard stale threshold', () => {
  const vm = buildRegimeViewModelBlock(
    makeBlock({
      freshness: {
        generatedAtUnixMs: GENERATED,
        lastCandleUnixMs: LAST_CANDLE,
        ageSeconds: 60,
        softStale: false,
        hardStale: false,
        softStaleSeconds: 4500,
        hardStaleSeconds: 9000,
      },
    }),
    GENERATED,
  );
  const hard = vm.expandedFreshnessRows.find((r) => r.label === 'Hard stale threshold');
  expect(hard?.value).toBe('150m');
});

it('rounds threshold seconds with Math.round at the minute boundary', () => {
  const vm = buildRegimeViewModelBlock(
    makeBlock({
      freshness: {
        generatedAtUnixMs: GENERATED,
        lastCandleUnixMs: LAST_CANDLE,
        ageSeconds: 60,
        softStale: false,
        hardStale: false,
        softStaleSeconds: 4529,
        hardStaleSeconds: 4531,
      },
    }),
    GENERATED,
  );
  const soft = vm.expandedFreshnessRows.find((r) => r.label === 'Soft stale threshold');
  const hard = vm.expandedFreshnessRows.find((r) => r.label === 'Hard stale threshold');
  expect(soft?.value).toBe('75m');
  expect(hard?.value).toBe('76m');
});
```

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `pnpm --filter @clmm/ui test -- RegimeViewModel`

Expected: all five new tests fail. The current `formatSecondsThreshold` returns minutes only when `minutes < 60` and otherwise switches to `Math.round(minutes / 60)` hours, so:

- 4500s (75 min) → received `1h`, expected `75m`
- 5400s (90 min) → received `2h`, expected `90m`
- 7200s (120 min) → received `2h`, expected `120m`
- 9000s (150 min) → received `3h`, expected `150m`
- 4529s/4531s (~75/76 min) → received `1h`/`1h`, expected `75m`/`76m`

If any test unexpectedly passes, double-check that the new tests are inside the `expanded rows` describe block (not after the file's final `});`) and that vitest is actually picking them up.

- [ ] **Step 4: Commit the failing tests**

```bash
git add packages/ui/src/view-models/RegimeViewModel.test.ts
git commit -m "test(ui): pin Regime freshness thresholds to exact minutes"
```

---

## Task 2: Replace `formatSecondsThreshold` with `formatFreshnessThresholdSeconds`

**Files:**

- Modify: `packages/ui/src/view-models/RegimeViewModel.ts:81-86` (replace helper)
- Modify: `packages/ui/src/view-models/RegimeViewModel.ts:193,198` (update call sites in `buildFreshnessRows`)

- [ ] **Step 1: Replace the helper definition**

In `packages/ui/src/view-models/RegimeViewModel.ts`, replace the `formatSecondsThreshold` function (lines 81–86):

```ts
function formatSecondsThreshold(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}
```

with:

```ts
function formatFreshnessThresholdSeconds(seconds: number): string {
  return `${Math.round(seconds / 60)}m`;
}
```

The new helper is intentionally specific to Regime freshness thresholds — do not generalize it, do not switch to hours, do not add mixed units. The point is comparability with the existing `Xm old` candle-age label.

- [ ] **Step 2: Update the two call sites in `buildFreshnessRows`**

Inside `buildFreshnessRows` (around lines 193 and 198), change both call sites from `formatSecondsThreshold(...)` to `formatFreshnessThresholdSeconds(...)`. After the edit, the relevant section looks like:

```ts
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
```

There are no other call sites for `formatSecondsThreshold` in the file or repo (the helper was module-private). After this edit, the old name should appear nowhere.

- [ ] **Step 3: Verify the old helper name is gone**

Run: `grep -n "formatSecondsThreshold" packages/ui/src/view-models/RegimeViewModel.ts`

Expected: no matches. If any matches remain, finish renaming them — leaving the old name behind would be a rename oversight, not a deliberate alias.

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run: `pnpm --filter @clmm/ui test -- RegimeViewModel`

Expected: all `RegimeViewModel` tests pass, including the five added in Task 1.

- [ ] **Step 5: Run the UI typecheck**

Run: `pnpm --filter @clmm/ui typecheck`

Expected: clean. The signature `(seconds: number) => string` is unchanged, so call sites remain type-correct.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/view-models/RegimeViewModel.ts
git commit -m "fix(ui): render Regime freshness thresholds as exact minutes"
```

---

## Verification (final)

These are the narrow UI checks the spec calls out. Run both before declaring the change complete.

- [ ] **Step 1: Run the full RegimeViewModel test file**

Run: `pnpm --filter @clmm/ui test -- RegimeViewModel`

Expected: all tests pass, including the five added in Task 1 and the existing data-quality, label, display-reason, and expanded-row tests.

- [ ] **Step 2: Run the UI typecheck**

Run: `pnpm --filter @clmm/ui typecheck`

Expected: clean.

If either fails, do not push or open a PR — diagnose first. Per the spec, broader cross-package checks are not required because this change is confined to the view model and its tests; if you ended up touching DTOs, adapters, components, or app code, escalate to the full repo checks listed in `AGENTS.md`.
