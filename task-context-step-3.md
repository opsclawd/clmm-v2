# Task Context: Task 3

Title: Attach optional principal amounts to the existing detail read

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

- Modify: `packages/domain/src/positions/index.ts` (`PositionDetail` only)
- Modify: `packages/testing/src/fixtures/positions.ts` (`FIXTURE_POSITION_DETAIL` only)
- Modify: `packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.ts`
- Modify: `packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.test.ts` (`fetchPositionDetail` describe block only)
- Modify: `packages/adapters/src/composition/AdaptersModule.ts` (constructor call for `SolanaPositionSnapshotReader`; add principal helper as 4th arg)
- Modify: `packages/adapters/src/inbound/http/AppModule.ts` (provider registration for `SolanaPositionSnapshotReader`; add principal helper as 4th arg)
- Modify: `packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.test.ts` (update reader instantiation to pass 4th principal helper arg)
- Modify: `packages/adapters/src/outbound/solana-position-reads/SolanaReadPathEfficiency.integration.test.ts` (integration assertions; update reader instantiation)
- Modify: `packages/adapters/src/outbound/swap-execution/SolanaExecutionPreparationAdapter.test.ts` (position detail fixture updates; update reader instantiation)

**Invariants to test first:** `returns principal amounts and their completion time with a successful detail`, `preserves zero amounts from a successful principal quote`, `returns detail with null principal amounts and one warning when principal quoting is unavailable`, `keeps live fee reward failure as a null detail`.

- [ ] **Step 1: Extend the existing reader test setup with an injected principal helper.** Add the four named cases above only inside `describe('fetchPositionDetail')`. Stub `Date.now()` at `1_700_000_000_123` for the success case and assert the principal helper receives `pos.liquidity`, `w.sqrtPrice`, and the fetched bounds. In the unavailable case, assert the detail is non-null, principal is null, and the sole new log call is:

  ```ts
  expect(observability.log).toHaveBeenCalledWith(
    'warn',
    'orca_position_principal_quote_unavailable',
    expect.objectContaining({
      positionId: MOCK_POSITION_MINT,
      walletId: MOCK_WALLET,
      poolId: MOCK_WHIRLPOOL,
      lowerTick: -18304,
      upperTick: -17956,
      currentTick: -18130,
      reason: 'principal-quote-failed',
    }),
  );
  ```

  Also serialize the log arguments with a bigint-safe replacer and prove they contain no raw account/RPC payload.

- [ ] **Step 2: Run only the new reader cases and confirm failure.**

  ```bash
  pnpm --filter @clmm/adapters test -- src/outbound/solana-position-reads/SolanaPositionSnapshotReader.test.ts -t 'principal|live fee reward failure'
  ```

  Expected: FAIL because the reader has no principal helper/result yet.

- [ ] **Step 3: Change the exported `PositionDetail` shape and its shared fixture in the same task.** Add:

  ```ts
  readonly principalTokenAmounts: {
    readonly amountA: bigint;
    readonly amountB: bigint;
    readonly observedAt: ClockTimestamp;
  } | null;
  ```

  Set the shared fixture to `{ amountA: 250_000_000n, amountB: 12_500_000n, observedAt: makeClockTimestamp(1_000_100) }`. Do not add these fields to the older `PositionDetailDto`; this issue extends the insight read model, while the existing position-detail endpoint may continue ignoring the additional raw domain member.

- [ ] **Step 4: Inject and invoke the helper without refetching accounts.** Add a fourth optional constructor parameter after the existing fee/reward helper:

  ```ts
  private readonly principalQuoteHelper: OrcaPositionPrincipalQuoteHelper =
    new OrcaPositionPrincipalQuoteHelper(),
  ```

  After the live fee/reward quote succeeds, call it with `pos.liquidity`, `w.sqrtPrice`, `pos.tickLowerIndex`, and `pos.tickUpperIndex`. On `ok`, capture `makeClockTimestamp(Date.now())` immediately after completion. On `unavailable`, set the field to `null`, emit one bounded `orca_position_principal_quote_unavailable` warning with position/wallet/pool IDs, bounds, current tick, stable reason, and already-sanitized optional error metadata, then continue returning the detail. Do not include account objects, RPC responses, or liquidity values in the log.

- [ ] **Step 5: Update all `SolanaPositionSnapshotReader` call sites to pass the principal helper (or let the optional default apply).** In `AdaptersModule.ts` and `AppModule.ts`, pass the principal helper as the 4th constructor argument after the fee/reward helper. In `OrcaPositionReadAdapter.test.ts`, `SolanaReadPathEfficiency.integration.test.ts`, and `SolanaExecutionPreparationAdapter.test.ts`, update each `new SolanaPositionSnapshotReader(...)` instantiation to pass the principal helper (or a mock thereof). Since the parameter is optional with a default, 1-arg test instantiations remain valid TypeScript — but test files that want to control or verify the helper should explicitly construct and pass it.

- [ ] **Step 6: Keep primary failure ordering unchanged.** Position fetch, ownership, Whirlpool fetch, and live fee/reward quote must still return `null` before principal quoting. Return the new member beside the existing fields:

  ```ts
  return {
    position,
    poolData,
    fees: quote.fees,
    positionLiquidity: pos.liquidity,
    principalTokenAmounts,
  };
  ```

- [ ] **Step 7: Verify the modified detail slice.** Although `SolanaPositionSnapshotReader.test.ts` exceeds 500 lines, this is an implementation task and touches only its existing `fetchPositionDetail` block; do not refactor unrelated reader cases.

  ```bash
  pnpm --filter @clmm/adapters test -- src/outbound/solana-position-reads/SolanaPositionSnapshotReader.test.ts
  pnpm --filter @clmm/testing test -- src/contracts/PositionReadPortContract.ts
  pnpm exec eslint packages/domain/src/positions/index.ts packages/testing/src/fixtures/positions.ts packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.ts packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.test.ts packages/adapters/src/composition/AdaptersModule.ts packages/adapters/src/inbound/http/AppModule.ts packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.test.ts packages/adapters/src/outbound/solana-position-reads/SolanaReadPathEfficiency.integration.test.ts packages/adapters/src/outbound/swap-execution/SolanaExecutionPreparationAdapter.test.ts
  pnpm exec prettier --check packages/domain/src/positions/index.ts packages/testing/src/fixtures/positions.ts packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.ts packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.test.ts packages/adapters/src/composition/AdaptersModule.ts packages/adapters/src/inbound/http/AppModule.ts packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.test.ts packages/adapters/src/outbound/solana-position-reads/SolanaReadPathEfficiency.integration.test.ts packages/adapters/src/outbound/swap-execution/SolanaExecutionPreparationAdapter.test.ts
  ```

  Expected: reader and port-contract tests pass; lint and formatting pass; no owner/position/pool refetch is introduced. The automatic workspace typecheck gate must pass before commit.

- [ ] **Step 8: Commit the complete domain-to-adapter detail contract.**

  ```bash
  git add packages/domain/src/positions/index.ts packages/testing/src/fixtures/positions.ts packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.ts packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.test.ts packages/adapters/src/composition/AdaptersModule.ts packages/adapters/src/inbound/http/AppModule.ts packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.test.ts packages/adapters/src/outbound/solana-position-reads/SolanaReadPathEfficiency.integration.test.ts packages/adapters/src/outbound/swap-execution/SolanaExecutionPreparationAdapter.test.ts
  git commit -m "feat: enrich position details with principal amounts"
  ```

## Repository Targets

### Expected Files

- packages/domain/src/positions/index.ts
- packages/testing/src/fixtures/positions.ts
- packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.ts
- packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.test.ts
- packages/adapters/src/composition/AdaptersModule.ts
- packages/adapters/src/inbound/http/AppModule.ts
- packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.test.ts
- packages/adapters/src/outbound/solana-position-reads/SolanaReadPathEfficiency.integration.test.ts
- packages/adapters/src/outbound/swap-execution/SolanaExecutionPreparationAdapter.test.ts

## Validation Commands

```bash
pnpm --filter @clmm/adapters test -- src/outbound/solana-position-reads/SolanaPositionSnapshotReader.test.ts
pnpm --filter @clmm/testing test -- src/contracts/PositionReadPortContract.ts
pnpm exec eslint packages/domain/src/positions/index.ts packages/testing/src/fixtures/positions.ts packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.ts packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.test.ts packages/adapters/src/composition/AdaptersModule.ts packages/adapters/src/inbound/http/AppModule.ts packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.test.ts packages/adapters/src/outbound/solana-position-reads/SolanaReadPathEfficiency.integration.test.ts packages/adapters/src/outbound/swap-execution/SolanaExecutionPreparationAdapter.test.ts
pnpm exec prettier --check packages/domain/src/positions/index.ts packages/testing/src/fixtures/positions.ts packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.ts packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.test.ts packages/adapters/src/composition/AdaptersModule.ts packages/adapters/src/inbound/http/AppModule.ts packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.test.ts packages/adapters/src/outbound/solana-position-reads/SolanaReadPathEfficiency.integration.test.ts packages/adapters/src/outbound/swap-execution/SolanaExecutionPreparationAdapter.test.ts
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **principal detail observation**: A successful principal quote is attached to the detail with the timestamp captured after quote completion. (Test: `returns principal amounts and their completion time with a successful detail`)
- **principal detail zero preservation**: Zero values returned by a successful principal helper remain successful detail facts. (Test: `preserves zero amounts from a successful principal quote`)
- **principal failure is optional**: When fee and reward quoting succeeds but principal quoting is unavailable, detail succeeds with null principal amounts and one bounded warning. (Test: `returns detail with null principal amounts and one warning when principal quoting is unavailable`)
- **primary detail failures remain primary**: A live fee or reward quote failure still returns null and does not proceed as optional enrichment. (Test: `keeps live fee reward failure as a null detail`)
