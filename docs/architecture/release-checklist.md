# Release Checklist

## Architecture Invariants

- [ ] `pnpm install --frozen-lockfile` exits 0
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` executes package lint tasks and exits 0
- [ ] `pnpm boundaries` exits 0
- [ ] `pnpm --filter @clmm/config test` exits 0 (banned-concept scan)
- [ ] `pnpm test` exits 0
- [ ] Temporary `@solana/*` import under `packages/domain/src` makes `pnpm boundaries` fail
- [ ] Temporary `ExecutionReceipt` in scanned source makes `pnpm --filter @clmm/config test` fail

## Historical Epic Audits

- [ ] Treat Epic 1 scaffold-only checks as historical once the MVP is implemented
- [ ] Do not fail completed-product audits for expected evolution such as populated barrels, live app composition, or non-stub adapter mains
- [ ] Continue failing audits for broken enduring guardrails: install reproducibility, lint, boundaries, banned-concept scan, and negative smoke tests

## Directional Exit Policy

- [ ] `applyDirectionalExitPolicy(LOWER_BOUND_BREACH)` → `exit-to-usdc` + `SOL→USDC`
- [ ] `applyDirectionalExitPolicy(UPPER_BOUND_BREACH)` → `exit-to-sol` + `USDC→SOL`
- [ ] DirectionalExitPolicyService has 100% branch coverage
- [ ] Lower-bound smoke scenario: preview posture = `exit-to-usdc`
- [ ] Upper-bound smoke scenario: preview posture = `exit-to-sol`

## Non-Custodial Invariants

- [ ] Backend stores no wallet private keys, seeds, or signing authority
- [ ] All signing flows return signed payload to client — never backend-held
- [ ] No execution occurs without explicit user signature (decline path tested)

## Off-Chain History Only

- [ ] No `receipt`, `attestation`, `proof`, `claim`, or `canonical_cert` fields in any Drizzle schema
- [ ] Banned-concept scanner passes on all source files
- [ ] History UI labels all records as "off-chain operational history — not an on-chain receipt"

## Failure Handling

- [ ] Partial execution state: `showRetry = false` always
- [ ] Submission state does not say "confirmed"
- [ ] Stale preview blocks signing until refreshed
- [ ] Expired preview forces re-creation, not reuse

## Observability

- [ ] Breach detection time and notification delivery time stored as separate fields
- [ ] History events preserve `breachDirection` for every entry

## Platform Honesty

- [ ] Mobile web capability adapter returns `isMobileWeb: true` + `browserWalletAvailable: false`
- [ ] Native capability adapter returns `nativeWalletAvailable: true`
- [ ] `ExecutionStateViewModel` for `partial` always has `partialCompletionWarning` set
