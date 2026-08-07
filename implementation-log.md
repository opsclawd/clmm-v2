# Task 1 Implementation Log: Land the failing family-liveness regression proof

## Overview

Implemented Task 1 by updating the focused simulated-outage regression proof test in `packages/ui/src/screens/EvidenceLiveness.regression.test.tsx`.

## Key Changes

- Fixed typecheck issues (resolved TS2322, TS2353, and TS4111) while preserving test-local structural casting.
- Added three named behavioral regression tests:
  1. `configured stale unavailable family is rendered as Collection stopped with its last run`
  2. `configured fresh unavailable family is rendered as No qualifying data`
  3. `unconfigured unavailable family is rendered as Not configured`
- Verified that `@clmm/ui` typecheck passes cleanly with exit code 0 (`pnpm --filter @clmm/ui typecheck`).
- Verified that running vitest produces the expected 3 behavioral test failures reproducing the evidence collector outage state prior to Task 2 implementation.
- Committed the failing regression proof on `ai/issue-153` (`fd065b2`).

# Task 2 Implementation Log: Vendor the canonical liveness contract and mirror its public DTO

## Overview

Checked for the approved canonical liveness contract commit in `opsclawd/regime-engine`.

## Findings & Stop Condition Triggered

- According to `plan.md` assumptions: "The upstream owner first publishes `contracts/evidence-bundle/v1/` with required `assessment.liveness` records. The local implementation starts only after that commit exists."
- According to `plan.md` stop conditions: "Abort if no merged/pinned `opsclawd/regime-engine` commit contains the canonical liveness contract and fixtures; do not fabricate or locally author canonical assets."
- According to `AGENTS.md`: "Canonical contracts owned by sibling `opsclawd/*` repositories ... are checked into that repository's own `contracts/<name>/v<n>/` directory ... never published as npm packages ... Consume a sibling repo's contract by vendoring it: fetch the pinned commit".
- Inspected `opsclawd/regime-engine` repository (up to latest HEAD `f3f822f041d746fb105f55b57a9bfefcbc73c7f8` on `main`) as well as all git branches.
- `contracts/evidence-bundle/v1/evidence-bundle.schema.json` in `opsclawd/regime-engine` does not yet contain the `assessment.liveness` property or fixtures.
- Triggered stop condition per `plan.md`: Aborted Task 2 implementation without locally fabricating canonical contract assets.
