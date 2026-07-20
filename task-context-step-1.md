# Task Context: Task 1

Title: Preserve USD price source and cache observation time

## Workspace & Scope Constraints

## WORKSPACE CONSTRAINTS

Your working directory is a dedicated git worktree with the repository's complete history. Run all commands from it. Do NOT cd to or read paths outside this directory — external-directory access is automatically rejected. git log, git diff, etc. work here directly.

.ai-orchestrator.local.json, if one exists, lives only in the main checkout and is intentionally not copied into your worktree — it is operator-machine-specific and not part of your task. Do not search for it or read it outside this directory. Reason about configuration using only .ai-orchestrator.json in your own working directory; treat it as the effective config for your task.

Working Directory: /home/gary/.openclaw/workspace/clmm-superpowers-v2/.ai-worktrees/issue-91
Repository: opsclawd/clmm-v2
Branch: ai/issue-91
Start Commit: 57d292c93728379cfe3b77d288586aac649a5d46

## Task Requirements

**Files:**

- Modify: `packages/domain/src/positions/index.ts` (`PriceQuote` only)
- Modify: `packages/testing/src/fixtures/positions.ts` (`FIXTURE_SOL_PRICE_QUOTE` and `FIXTURE_USDC_PRICE_QUOTE` only)
- Modify: `packages/adapters/src/outbound/price/JupiterPriceAdapter.ts`
- Modify: `packages/adapters/src/outbound/price/JupiterPriceAdapter.test.ts`

**Invariants to test first:** `returns Jupiter source on every quote`, `reuses the original fetchedAt as quotedAt on a cache hit`.

- [ ] **Step 1: Add failing provider and cache-time tests.** In `JupiterPriceAdapter.test.ts`, use `vi.spyOn(Date, 'now')` with values `1_000` for the first request and `2_000` for the cache hit. Assert the first and second quote both equal `makeClockTimestamp(1_000)` and both have `source === 'jupiter_price_v3'`; restore the spy in `afterEach`.

- [ ] **Step 2: Run the focused test before implementation.**

  ```bash
  pnpm --filter @clmm/adapters test -- src/outbound/price/JupiterPriceAdapter.test.ts -t 'source|original fetchedAt'
  ```

  Expected: FAIL because `source` is absent and cache hits currently stamp a new `quotedAt`.

- [ ] **Step 3: Extend the exported domain quote and all typed producers together.** Add the required member to `PriceQuote`:

  ```ts
  export type PriceQuote = {
    readonly tokenMint: string;
    readonly usdValue: number;
    readonly symbol: string;
    readonly quotedAt: ClockTimestamp;
    readonly source: string;
  };
  ```

  Add `source: 'test_price_fixture'` to both shared fixtures. In `JupiterPriceAdapter.getPrices`, delete the request-wide `quotedAt` variable and build each result from its cache entry:

  ```ts
  results.push({
    tokenMint: mint,
    usdValue: entry.price,
    symbol: entry.symbol,
    quotedAt: makeClockTimestamp(entry.fetchedAt),
    source: 'jupiter_price_v3',
  });
  ```

- [ ] **Step 4: Verify only this contract slice.**

  ```bash
  pnpm --filter @clmm/adapters test -- src/outbound/price/JupiterPriceAdapter.test.ts
  pnpm exec eslint packages/domain/src/positions/index.ts packages/testing/src/fixtures/positions.ts packages/adapters/src/outbound/price/JupiterPriceAdapter.ts packages/adapters/src/outbound/price/JupiterPriceAdapter.test.ts
  pnpm exec prettier --check packages/domain/src/positions/index.ts packages/testing/src/fixtures/positions.ts packages/adapters/src/outbound/price/JupiterPriceAdapter.ts packages/adapters/src/outbound/price/JupiterPriceAdapter.test.ts
  ```

  Expected: all Jupiter tests pass, including unchanged batching/error behavior; lint and formatting pass. The implement loop's automatic `pnpm -r typecheck` gate must also pass before commit.

- [ ] **Step 5: Commit the truthful quote contract.**

  ```bash
  git add packages/domain/src/positions/index.ts packages/testing/src/fixtures/positions.ts packages/adapters/src/outbound/price/JupiterPriceAdapter.ts packages/adapters/src/outbound/price/JupiterPriceAdapter.test.ts
  git commit -m "feat: preserve price quote provenance"
  ```

## Repository Targets

### Expected Files

- packages/domain/src/positions/index.ts
- packages/testing/src/fixtures/positions.ts
- packages/adapters/src/outbound/price/JupiterPriceAdapter.ts
- packages/adapters/src/outbound/price/JupiterPriceAdapter.test.ts

## Validation Commands

```bash
pnpm --filter @clmm/adapters test -- src/outbound/price/JupiterPriceAdapter.test.ts
pnpm exec eslint packages/domain/src/positions/index.ts packages/testing/src/fixtures/positions.ts packages/adapters/src/outbound/price/JupiterPriceAdapter.ts packages/adapters/src/outbound/price/JupiterPriceAdapter.test.ts
pnpm exec prettier --check packages/domain/src/positions/index.ts packages/testing/src/fixtures/positions.ts packages/adapters/src/outbound/price/JupiterPriceAdapter.ts packages/adapters/src/outbound/price/JupiterPriceAdapter.test.ts
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **cached quote time is truthful**: A cache hit returns the cache entry's original fetchedAt as quotedAt and never stamps the later lookup time. (Test: `reuses the original fetchedAt as quotedAt on a cache hit`)
- **Jupiter provider provenance**: Every quote produced by JupiterPriceAdapter reports the stable source jupiter_price_v3. (Test: `returns Jupiter source on every quote`)
