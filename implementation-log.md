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
