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

## Deploy / Schema Readiness

- [ ] API service Railway config has `preDeployCommand = "pnpm --filter @clmm/adapters db:migrate"`
- [ ] API service Railway config has `startCommand = "pnpm --filter @clmm/adapters start:api"` (not `dev:api`)
- [ ] Worker service Railway config has no `preDeployCommand`
- [ ] Database migration (`pnpm --filter @clmm/adapters db:migrate`) completed before API/worker rollout
- [ ] `REGIME_ENGINE_INTERNAL_TOKEN` private authentication verified on internal POST /v1/execution-result endpoint
- [ ] Manual drill: induce retryable result timeout and verify exponential backoff with preserved idempotency key
- [ ] Manual drill: restart worker process during result sync and confirm outbox resumes delivery without duplicate execution
- [ ] `GET /health` returns 503 with `missing` list when any schema table is missing in the target DB (verify in staging by pointing the API at an unmigrated DB)
- [ ] Worker exits non-zero with the structured fatal log when schema is missing (same verification)
- [ ] `wallet_challenges` table exists in production DB after deploy
- [ ] No `READINESS_REQUIRED_TABLES` env var or hardcoded allowlist exists in production code paths
