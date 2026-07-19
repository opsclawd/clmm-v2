# Task Context: Task 2

Title: Build a fail-closed RangeBar display model

## Workspace & Scope Constraints

## WORKSPACE CONSTRAINTS

Your working directory is a dedicated git worktree with the repository's complete history. Run all commands from it. Do NOT cd to or read paths outside this directory — external-directory access is automatically rejected. git log, git diff, etc. work here directly.

.ai-orchestrator.local.json, if one exists, lives only in the main checkout and is intentionally not copied into your worktree — it is operator-machine-specific and not part of your task. Do not search for it or read it outside this directory. Reason about configuration using only .ai-orchestrator.json in your own working directory; treat it as the effective config for your task.

Working Directory: /home/gary/.openclaw/workspace/clmm-superpowers-v2/.ai-worktrees/issue-72
Repository: opsclawd/clmm-v2
Branch: ai/issue-72
Start Commit: 572b4b6664dc6ca14583b483060acbf48ef7c47e

## Task Requirements

**Files:**

- Create: `packages/ui/src/components/RangeBarUtils.ts`
- Create: `packages/ui/src/components/RangeBarUtils.test.ts`

**Invariants to test first:**

- `returns field-specific non-finite reasons in validation order`
- `rejects zero and negative required prices`
- `rejects equal and inverted bounds`
- `fails closed when finite inputs overflow the visual domain`
- `keeps valid lower midpoint upper and out-of-domain prices available`
- `clamps only finite derived marker percentages`
- `returns an available marker at exactly 50 percent for a genuine midpoint`

- [ ] **Step 1: Create focused failing tests for every reason and valid coordinate class.** Use table cases for `NaN`, positive infinity, and negative infinity in each field; zero/negative values in each field; equal/inverted bounds; `Number.MAX_VALUE` overflow; lower/midpoint/upper; and far-below/far-above current prices. Assert the exact union shape and exact reason strings rather than merely checking truthiness:

```ts
expect(
  buildRangeBarDisplayState({ currentPrice: 150, lowerBoundPrice: 100, upperBoundPrice: 200 }),
).toMatchObject({ kind: 'available', markerPercent: 50 });

expect(
  buildRangeBarDisplayState({ currentPrice: Number.NaN, lowerBoundPrice: 0, upperBoundPrice: 0 }),
).toEqual({ kind: 'unavailable', reason: 'current_price_non_finite' });

expect(
  buildRangeBarDisplayState({
    currentPrice: Number.MAX_VALUE,
    lowerBoundPrice: 1,
    upperBoundPrice: Number.MAX_VALUE,
  }),
).toEqual({ kind: 'unavailable', reason: 'derived_percentage_non_finite' });
```

- [ ] **Step 2: Run the new test and confirm it fails because the module does not exist.**

Run: `pnpm --filter @clmm/ui exec vitest run src/components/RangeBarUtils.test.ts`

Expected: FAIL with module-not-found or missing-export errors.

- [ ] **Step 3: Implement the discriminated model with the fixed validation order.** Keep constants and numeric helpers private; never return a midpoint fallback:

```ts
export type RangeBarUnavailableReason =
  | 'current_price_non_finite'
  | 'lower_price_non_finite'
  | 'upper_price_non_finite'
  | 'current_price_non_positive'
  | 'lower_price_non_positive'
  | 'upper_price_non_positive'
  | 'bounds_not_ascending'
  | 'derived_percentage_non_finite';

export type RangeBarDisplayState =
  | {
      kind: 'available';
      bandLeftPercent: number;
      bandRightPercent: number;
      markerPercent: number;
    }
  | { kind: 'unavailable'; reason: RangeBarUnavailableReason };

export type RangeBarPriceInput = {
  currentPrice: number;
  lowerBoundPrice: number;
  upperBoundPrice: number;
};

const VISUAL_PAD_FRACTION = 0.35;

function finitePercent(price: number, lo: number, hi: number): number | undefined {
  const value = ((price - lo) / (hi - lo)) * 100;
  if (!Number.isFinite(value)) return undefined;
  return Math.min(100, Math.max(0, value));
}

export function buildRangeBarDisplayState(input: RangeBarPriceInput): RangeBarDisplayState {
  const { currentPrice, lowerBoundPrice, upperBoundPrice } = input;
  if (!Number.isFinite(currentPrice))
    return { kind: 'unavailable', reason: 'current_price_non_finite' };
  if (!Number.isFinite(lowerBoundPrice))
    return { kind: 'unavailable', reason: 'lower_price_non_finite' };
  if (!Number.isFinite(upperBoundPrice))
    return { kind: 'unavailable', reason: 'upper_price_non_finite' };
  if (currentPrice <= 0) return { kind: 'unavailable', reason: 'current_price_non_positive' };
  if (lowerBoundPrice <= 0) return { kind: 'unavailable', reason: 'lower_price_non_positive' };
  if (upperBoundPrice <= 0) return { kind: 'unavailable', reason: 'upper_price_non_positive' };
  if (upperBoundPrice <= lowerBoundPrice)
    return { kind: 'unavailable', reason: 'bounds_not_ascending' };

  const width = upperBoundPrice - lowerBoundPrice;
  const pad = width * VISUAL_PAD_FRACTION;
  const lo = lowerBoundPrice - pad;
  const hi = upperBoundPrice + pad;
  if (![width, pad, lo, hi].every(Number.isFinite) || hi <= lo) {
    return { kind: 'unavailable', reason: 'derived_percentage_non_finite' };
  }
  const bandLeftPercent = finitePercent(lowerBoundPrice, lo, hi);
  const bandRightPercent = finitePercent(upperBoundPrice, lo, hi);
  const markerPercent = finitePercent(currentPrice, lo, hi);
  if (bandLeftPercent == null || bandRightPercent == null || markerPercent == null) {
    return { kind: 'unavailable', reason: 'derived_percentage_non_finite' };
  }
  return { kind: 'available', bandLeftPercent, bandRightPercent, markerPercent };
}
```

- [ ] **Step 4: Verify every numeric branch and lint only the new helper files.**

Run: `pnpm --filter @clmm/ui exec vitest run src/components/RangeBarUtils.test.ts`

Expected: PASS for every invalid reason, deterministic precedence, overflow, clamping, and the exact midpoint.

Run: `pnpm --filter @clmm/ui exec eslint src/components/RangeBarUtils.ts src/components/RangeBarUtils.test.ts`

Expected: PASS with no lint errors.

- [ ] **Step 5: Commit the pure display model.**

```bash
git add packages/ui/src/components/RangeBarUtils.ts packages/ui/src/components/RangeBarUtils.test.ts
git commit -m "feat(ui): classify unavailable range bars"
```

## Repository Targets

### Expected Files

- packages/ui/src/components/RangeBarUtils.ts
- packages/ui/src/components/RangeBarUtils.test.ts

## Validation Commands

```bash
pnpm --filter @clmm/ui exec vitest run src/components/RangeBarUtils.test.ts
pnpm --filter @clmm/ui exec eslint src/components/RangeBarUtils.ts src/components/RangeBarUtils.test.ts
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **non-finite validation order**: Non-finite current, lower, and upper inputs fail closed with the first field-specific reason in the fixed validation order. (Test: `returns field-specific non-finite reasons in validation order`)
- **positive-price contract**: Zero or negative current, lower, or upper prices cannot create an available display model. (Test: `rejects zero and negative required prices`)
- **ascending bounds**: Equal or inverted bounds return bounds_not_ascending and never produce coordinates. (Test: `rejects equal and inverted bounds`)
- **derived overflow guard**: Finite inputs whose subtraction, padding, visual domain, or percentages become non-finite return derived_percentage_non_finite. (Test: `fails closed when finite inputs overflow the visual domain`)
- **valid coordinate classes**: Valid lower, midpoint, upper, far-below, and far-above prices all remain available. (Test: `keeps valid lower midpoint upper and out-of-domain prices available`)
- **finite-only clamping**: Only finite derived marker percentages may be clamped to track edges. (Test: `clamps only finite derived marker percentages`)
- **genuine midpoint**: A valid price at the visual-domain midpoint produces an available marker at exactly 50 percent. (Test: `returns an available marker at exactly 50 percent for a genuine midpoint`)
