# Task Context: Task 1

Title: Add current-tick reserve math to the domain

## Workspace & Scope Constraints

## WORKSPACE CONSTRAINTS

Your working directory is a dedicated git worktree with the repository's complete history. Run all commands from it. Do NOT cd to or read paths outside this directory — external-directory access is automatically rejected. git log, git diff, etc. work here directly.

.ai-orchestrator.local.json, if one exists, lives only in the main checkout and is intentionally not copied into your worktree — it is operator-machine-specific and not part of your task. Do not search for it or read it outside this directory. Reason about configuration using only .ai-orchestrator.json in your own working directory; treat it as the effective config for your task.

Working Directory: /home/gary/.openclaw/workspace/clmm-superpowers-v2/.ai-worktrees/issue-127
Repository: opsclawd/clmm-v2
Branch: ai/issue-127
Start Commit: bf2932b65f922b628b36c57594867186f4c43149

## Task Requirements

**Files:**

- Modify: `packages/domain/src/positions/enrichment.test.ts` (`calculateInRangeReserves` import and a focused describe block after the price helpers)
- Modify: `packages/domain/src/positions/enrichment.ts` (new pure exported helper beside the existing CLMM price helpers)
- Modify: `packages/domain/src/positions/index.ts` (enrichment export list only)

**Exported API change:** Add the backward-compatible `calculateInRangeReserves` export with signature `(liquidity: bigint, sqrtPriceX64: bigint, tickCurrentIndex: number, tickSpacing: number) => { amountA: bigint; amountB: bigint }`. There are no port or adapter changes.

- [ ] **Step 1: Write failing known-value tests first**

  Extend the existing import and add a dedicated describe block with literal expected values so the test does not reproduce the implementation formula as its oracle:

  ```ts
  import {
    calculateInRangeReserves,
    // existing imports remain
  } from './enrichment.js';

  describe('calculateInRangeReserves', () => {
    it('calculates both reserves for a price inside the current tick bucket', () => {
      expect(
        calculateInRangeReserves(1_000_000_000_000n, 18_476_281_010_653_904_896n, 32, 64),
      ).toEqual({ amountA: 1_596_085_163n, amountB: 1_601_200_560n });
    });

    it('uses floor division to select the active bucket for negative ticks', () => {
      expect(
        calculateInRangeReserves(1_000_000_000_000n, 18_358_416_274_770_382_848n, -96, 64),
      ).toEqual({ amountA: 1_606_332_351n, amountB: 1_590_986_108n });
    });

    it('clamps boundary rounding artifacts to zero', () => {
      expect(calculateInRangeReserves(1_000_000_000_000n, 2n ** 64n, 0, 64)).toEqual({
        amountA: 3_194_725_978n,
        amountB: 0n,
      });
    });
  });
  ```

- [ ] **Step 2: Run only the new domain cases and confirm red**

  Run: `pnpm --filter @clmm/domain exec vitest run src/positions/enrichment.test.ts -t calculateInRangeReserves`

  Expected: FAIL because `calculateInRangeReserves` is not exported.

- [ ] **Step 3: Implement the minimal pure reserve helper**

  Add the exact bucket and raw-square-root calculation to `enrichment.ts`; do not call `priceFromSqrtPrice` because its decimal scaling is invalid for these formulas:

  ```ts
  export function calculateInRangeReserves(
    liquidity: bigint,
    sqrtPriceX64: bigint,
    tickCurrentIndex: number,
    tickSpacing: number,
  ): { amountA: bigint; amountB: bigint } {
    const tickLower = Math.floor(tickCurrentIndex / tickSpacing) * tickSpacing;
    const tickUpper = tickLower + tickSpacing;
    const sqrtPrice = Number(sqrtPriceX64) / 2 ** 64;
    const sqrtPriceLower = Math.pow(1.0001, tickLower / 2);
    const sqrtPriceUpper = Math.pow(1.0001, tickUpper / 2);
    const liquidityNumber = Number(liquidity);

    const amountA = liquidityNumber * (1 / sqrtPrice - 1 / sqrtPriceUpper);
    const amountB = liquidityNumber * (sqrtPrice - sqrtPriceLower);

    return {
      amountA: BigInt(Math.max(0, Math.floor(amountA))),
      amountB: BigInt(Math.max(0, Math.floor(amountB))),
    };
  }
  ```

  This helper assumes valid Orca `PoolData`: positive tick spacing, finite protocol tick values, and a positive X64 square-root price. Do not widen scope with defensive behavior for impossible adapter data unless a failing repository test demonstrates that contract is not enforced.

- [ ] **Step 4: Re-export the helper from the domain package**

  Add `calculateInRangeReserves` to the existing export block in `packages/domain/src/positions/index.ts`, allowing the application layer to import it only through `@clmm/domain`.

- [ ] **Step 5: Verify the focused domain change**

  Run: `pnpm --filter @clmm/domain exec vitest run src/positions/enrichment.test.ts`

  Expected: PASS, including all existing enrichment cases and the three new reserve cases.

  Run: `pnpm --filter @clmm/domain exec eslint src/positions/enrichment.ts src/positions/enrichment.test.ts src/positions/index.ts`

  Expected: PASS with no lint errors.

  Run: `pnpm --filter @clmm/domain typecheck`

  Expected: PASS with the new exported signature represented in the domain build surface.

- [ ] **Step 6: Commit the domain unit**

  ```bash
  git add packages/domain/src/positions/enrichment.ts packages/domain/src/positions/enrichment.test.ts packages/domain/src/positions/index.ts
  git commit -m "feat(domain): calculate current tick pool reserves"
  ```

## Repository Targets

### Expected Files

- packages/domain/src/positions/enrichment.test.ts
- packages/domain/src/positions/enrichment.ts
- packages/domain/src/positions/index.ts

## Validation Commands

```bash
["pnpm","--filter","@clmm/domain","exec","vitest","run","src/positions/enrichment.test.ts"]
["pnpm","--filter","@clmm/domain","exec","eslint","src/positions/enrichment.ts","src/positions/enrichment.test.ts","src/positions/index.ts"]
["pnpm","--filter","@clmm/domain","typecheck"]
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **in-bucket reserve calculation**: A valid square-root price inside the current tick-spacing bucket yields floored, non-negative token A and token B reserves using raw CLMM square-root ratios. (Test: `calculates both reserves for a price inside the current tick bucket`)
- **negative tick floor division**: A negative current tick is assigned to the bucket whose lower bound is computed with mathematical floor division, not truncation toward zero. (Test: `uses floor division to select the active bucket for negative ticks`)
- **non-negative boundary reserves**: Floating-point artifacts at a tick-bucket boundary are clamped so neither returned raw reserve can be negative. (Test: `clamps boundary rounding artifacts to zero`)
