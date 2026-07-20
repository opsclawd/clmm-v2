# Task Context: Task 2

Title: Add the Orca full-liquidity principal quote helper

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

- Create: `packages/adapters/src/outbound/solana-position-reads/OrcaPositionPrincipalQuoteHelper.ts`
- Create: `packages/adapters/src/outbound/solana-position-reads/OrcaPositionPrincipalQuoteHelper.test.ts`

**Invariants to test first:** `returns estimated principal amounts for full liquidity`, `preserves successful zero principal amounts`, `rejects invalid principal quote inputs before calling Orca`, `sanitizes a thrown principal quote failure`.

- [ ] **Step 1: Consult the installed-version official Orca API before coding.** Use Context7/current official Orca documentation for `@orca-so/whirlpools-core` v3.1.0 and confirm the installed `decreaseLiquidityQuote(liquidity, slippageToleranceBps, sqrtPrice, tickLowerIndex, tickUpperIndex)` signature and that `tokenEstA`/`tokenEstB` are estimated principal amounts. Do not use `closePositionInstructions`, `tokenMinA`, `tokenMinB`, fee quotes, or reward quotes. If the official v3.1.0 API does not expose an instruction-free estimated-amount function with these semantics, stop under the documented stop condition instead of improvising protocol math.

- [ ] **Step 2: Write the new helper tests first.** Mock `decreaseLiquidityQuote` and test exact forwarding of liquidity, current sqrt price, lower tick, and upper tick; assert returned estimates are unchanged. Add separate zero, invalid-liquidity/invalid-bounds, and thrown-error cases. Use these exact test names:

  ```ts
  it('returns estimated principal amounts for full liquidity', async () => {});
  it('preserves successful zero principal amounts', async () => {});
  it('rejects invalid principal quote inputs before calling Orca', async () => {});
  it('sanitizes a thrown principal quote failure', async () => {});
  ```

- [ ] **Step 3: Run the new test and verify it fails because the helper is absent.**

  ```bash
  pnpm --filter @clmm/adapters test -- src/outbound/solana-position-reads/OrcaPositionPrincipalQuoteHelper.test.ts
  ```

  Expected: FAIL with the helper module missing.

- [ ] **Step 4: Implement the focused discriminated-union helper.** Keep it synchronous internally because the core quote is pure, but expose `quote` as a normal method. Use the documented estimated fields and a zero-bps argument only because the SDK signature requires it; the returned contract must never expose minimum amounts:

  ```ts
  import { decreaseLiquidityQuote } from '@orca-so/whirlpools-core';

  export type PrincipalTokenAmountsQuoteResult =
    | { kind: 'ok'; amountA: bigint; amountB: bigint }
    | {
        kind: 'unavailable';
        reason: 'quote-input-invalid' | 'principal-quote-failed';
        errorName?: string;
        errorMessage?: string;
      };

  export type PrincipalQuoteArgs = {
    liquidity: bigint;
    sqrtPrice: bigint;
    tickLowerIndex: number;
    tickUpperIndex: number;
  };

  export class OrcaPositionPrincipalQuoteHelper {
    quote(args: PrincipalQuoteArgs): PrincipalTokenAmountsQuoteResult {
      if (args.liquidity < 0n || args.tickLowerIndex >= args.tickUpperIndex) {
        return { kind: 'unavailable', reason: 'quote-input-invalid' };
      }
      try {
        const quote = decreaseLiquidityQuote(
          args.liquidity,
          0,
          args.sqrtPrice,
          args.tickLowerIndex,
          args.tickUpperIndex,
        );
        return { kind: 'ok', amountA: quote.tokenEstA, amountB: quote.tokenEstB };
      } catch (error) {
        const described =
          error instanceof Error
            ? { errorName: error.name, errorMessage: error.message.slice(0, 200) }
            : { errorMessage: String(error).slice(0, 200) };
        return { kind: 'unavailable', reason: 'principal-quote-failed', ...described };
      }
    }
  }
  ```

  If official typing uses a named bps wrapper or a different parameter order, mirror that exact official signature while preserving the tested inputs and `tokenEstA`/`tokenEstB` output contract.

- [ ] **Step 5: Verify the helper only.**

  ```bash
  pnpm --filter @clmm/adapters test -- src/outbound/solana-position-reads/OrcaPositionPrincipalQuoteHelper.test.ts
  pnpm exec eslint packages/adapters/src/outbound/solana-position-reads/OrcaPositionPrincipalQuoteHelper.ts packages/adapters/src/outbound/solana-position-reads/OrcaPositionPrincipalQuoteHelper.test.ts
  pnpm exec prettier --check packages/adapters/src/outbound/solana-position-reads/OrcaPositionPrincipalQuoteHelper.ts packages/adapters/src/outbound/solana-position-reads/OrcaPositionPrincipalQuoteHelper.test.ts
  ```

  Expected: all four named cases pass; lint and formatting pass. The automatic workspace typecheck gate must pass before commit.

- [ ] **Step 6: Commit the adapter-local quote primitive.**

  ```bash
  git add packages/adapters/src/outbound/solana-position-reads/OrcaPositionPrincipalQuoteHelper.ts packages/adapters/src/outbound/solana-position-reads/OrcaPositionPrincipalQuoteHelper.test.ts
  git commit -m "feat: quote Orca position principal amounts"
  ```

## Repository Targets

### Expected Files

- packages/adapters/src/outbound/solana-position-reads/OrcaPositionPrincipalQuoteHelper.ts
- packages/adapters/src/outbound/solana-position-reads/OrcaPositionPrincipalQuoteHelper.test.ts

## Validation Commands

```bash
pnpm --filter @clmm/adapters test -- src/outbound/solana-position-reads/OrcaPositionPrincipalQuoteHelper.test.ts
pnpm exec eslint packages/adapters/src/outbound/solana-position-reads/OrcaPositionPrincipalQuoteHelper.ts packages/adapters/src/outbound/solana-position-reads/OrcaPositionPrincipalQuoteHelper.test.ts
pnpm exec prettier --check packages/adapters/src/outbound/solana-position-reads/OrcaPositionPrincipalQuoteHelper.ts packages/adapters/src/outbound/solana-position-reads/OrcaPositionPrincipalQuoteHelper.test.ts
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **principal quote is principal-only**: Valid full-liquidity inputs return Orca tokenEstA and tokenEstB unchanged without fees, rewards, or minimum outputs. (Test: `returns estimated principal amounts for full liquidity`)
- **principal zero is data**: A successful quote with zero on either side remains an ok result containing 0n. (Test: `preserves successful zero principal amounts`)
- **principal invalid input is classified**: Negative liquidity or non-ascending bounds returns quote-input-invalid before Orca math is called, while zero liquidity remains quotable. (Test: `rejects invalid principal quote inputs before calling Orca`)
- **principal quote failure is bounded**: Thrown Orca errors become principal-quote-failed with error name and at most 200 message characters. (Test: `sanitizes a thrown principal quote failure`)
