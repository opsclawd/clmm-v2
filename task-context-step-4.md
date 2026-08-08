# Task Context: Task 4

Title: Apply deterministic thresholds and suppress available collector labels
## Workspace & Scope Constraints

## WORKSPACE CONSTRAINTS

Your working directory is a dedicated git worktree with the repository's complete history. Run all commands from it. Do NOT cd to or read paths outside this directory — external-directory access is automatically rejected. git log, git diff, etc. work here directly.

.ai-orchestrator.local.json, if one exists, lives only in the main checkout and is intentionally not copied into your worktree — it is operator-machine-specific and not part of your task. Do not search for it or read it outside this directory. Reason about configuration using only .ai-orchestrator.json in your own working directory; treat it as the effective config for your task.

Working Directory: /home/gary/.openclaw/workspace/clmm-superpowers-v2/.ai-worktrees/issue-157
Repository: opsclawd/clmm-v2
Branch: ai/issue-157
Start Commit: c3d7d33f2ed24136e55a99b91b2917fa17b565b2

## Task Requirements

**Files:**

- Modify: `packages/ui/src/view-models/EvidenceViewModel.ts`
- Modify: `packages/ui/src/components/EvidenceFamilyCard.tsx`
- Read only: `packages/ui/src/screens/EvidenceLivenessContract.regression.test.tsx`
- Read only: `packages/ui/src/screens/EvidenceLiveness.regression.test.tsx`
- Read only: `packages/ui/src/screens/EvidenceScreen.tsx`
- Read only: `packages/ui/src/index.ts`

- [ ] **Step 1: Add explicit deterministic-family thresholds**

  Replace the obsolete comment saying deterministic ids intentionally have no entries. Add all six ids to `FAMILY_COLLECTION_STALE_AFTER_MS`, each as `30 * 60 * 1_000`, with comments recording the deployed source/cadence mapping:

  ```ts
  risk: 30 * 60 * 1_000, // binance-fapi + drift-api: */5
  market_state: 30 * 60 * 1_000, // pyth-hermes + jupiter-quote: */5
  price_quality: 30 * 60 * 1_000, // pyth-hermes + jupiter-quote: */5
  clmm_economics: 30 * 60 * 1_000, // clmm-v2-bundle + solana-rpc: * * * * *
  position_state: 30 * 60 * 1_000, // clmm-v2-bundle: * * * * *
  liquidity: 30 * 60 * 1_000, // clmm-v2-bundle + orca-public-api: * * * * *
  ```

  Keep `collectionStaleAfterMs`'s default for unknown future ids and keep the exact `livenessMap?.[id]` lookup. Do not introduce any access to `livenessMap?.deterministic` inside the deterministic-card loop.

- [ ] **Step 2: Make family-card collector labels explicitly nullable**

  Change the exported member to `lastCollectedLabel: string | null` on `EvidenceFamilyCardViewModel`; do not change the screen-level `EvidenceScreenViewModel.lastCollectedLabel`. In deterministic card assembly, compute the resolved availability first, then set the family-card label to `null` only when availability is `available`; otherwise retain `formatLastCollectedLabel(livenessRecord, now)`. Contextual card assembly must retain its existing behavior (`formatLastCollectedLabel(livenessRecord, now)`) without suppressing labels for available contextual cards, preserving contextual-family liveness behavior delivered in #156.

- [ ] **Step 3: Render and announce only present labels**

  In `EvidenceFamilyCard`, build the accessibility label from an array of present segments and join with `, ` so null suppression does not produce doubled punctuation. Render the collector `<Text>` only when `card.lastCollectedLabel` is non-null. Preserve status, freshness, warning, and row rendering exactly.

- [ ] **Step 4: Run focused UI verification**

  Run: `pnpm --filter @clmm/ui exec vitest run src/screens/EvidenceLivenessContract.regression.test.tsx src/screens/EvidenceLiveness.regression.test.tsx`

  Expected: PASS for the six-family boundary matrix, specific-over-aggregate precedence, missing-specific `liveness_unknown`, non-unavailable preservation, available-label suppression, contextual liveness, and accessibility assertions.

  Run: `pnpm --filter @clmm/ui exec eslint src/view-models/EvidenceViewModel.ts src/components/EvidenceFamilyCard.tsx src/screens/EvidenceLivenessContract.regression.test.tsx`

  Expected: PASS with no lint errors in the changed UI paths.

- [ ] **Step 5: Commit the implementation**

  ```bash
  git add packages/ui/src/view-models/EvidenceViewModel.ts packages/ui/src/components/EvidenceFamilyCard.tsx
  git commit -m "fix(ui): render deterministic family collector liveness"
  ```

**Task acceptance:** Every deterministic id has an explicit 30-minute threshold; the specific id remains the only lookup key; `available` cards omit collector status visually and accessibly; contextual behavior is unchanged; the focused regression files pass.

## Tests to add or update

- Add `packages/application/src/dto/evidenceBundleSubfamilyLiveness.regression.test.ts` with one programmatic, non-mutating contract payload covering all six new keys.
- Update `packages/ui/src/screens/EvidenceLivenessContract.regression.test.tsx` rather than the 602-line `EvidenceViewModel.test.ts`; this keeps the test-update task below the oversized-file threshold and places the contract/UI regression beside #156's aggregate-fallback proof.
- Preserve `packages/ui/src/screens/EvidenceLiveness.regression.test.tsx` as a focused contextual and accessibility regression suite; run it as a non-modified blast-radius check.
- Keep canonical fixtures immutable. Existing `packages/application/src/dto/evidenceBundleContract.test.ts` remains the checksum and all-fixture verification gate.

## Validation commands

Run these after all implementation tasks complete; they are a validation phase, not a standalone task:

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm boundaries
pnpm test
```

Expected: all commands exit 0. If this fresh worktree lacks `node_modules` or workspace build outputs, run `pnpm install --frozen-lockfile` before the commands above; do not alter the lockfile.

For the issue's live-production acceptance check, use the operator-provided backend-only `REGIME_ENGINE_BASE_URL` and run a read-only fetch after the automated suite:

```bash
test -n "${REGIME_ENGINE_BASE_URL:-}" && curl -fsS "${REGIME_ENGINE_BASE_URL%/}/v1/evidence/sol-usdc/current" | pnpm --filter @clmm/ui exec tsx --eval 'import { readFileSync } from "node:fs"; import { parseEvidenceBundle } from "@clmm/application/public"; import { buildEvidenceViewModel } from "./src/view-models/EvidenceViewModel.ts"; const bundle = parseEvidenceBundle(JSON.parse(readFileSync(0, "utf8"))); if (!bundle) throw new Error("live evidence bundle failed canonical validation"); const vm = buildEvidenceViewModel(bundle, Date.now()); const risk = vm.cards.find((card) => card.id === "risk"); const liquidity = vm.cards.find((card) => card.id === "liquidity"); console.log(JSON.stringify({ risk, liquidity }, null, 2)); if (risk?.availability !== "collection_stopped" || liquidity?.availability !== "available" || liquidity.stale) throw new Error("live deterministic-family liveness does not show stopped risk beside fresh liquidity");'
```

Expected while the documented perp outage remains active: `risk.availability` is `collection_stopped`, `risk.lastCollectedLabel` reports its own stale run, and `liquidity` is available/fresh with `lastCollectedLabel: null`. If production has recovered by execution time, record the fetched per-family timestamps and automated regression result; do not fabricate or persist a stale live payload.

## Risk areas

- **Canonical drift:** Copying from the wrong upstream commit or formatting JSON will invalidate the supplied schema digest and provenance checks.
- **Fixture contamination:** Editing `liveness.json` or another canonical fixture to add the six keys will create an asset-hash mismatch and erase the evidence that the payload is constructed in-test.
- **False freshness:** Any fallback from a missing sub-family key to `deterministic` can hide a long-lived source outage behind a frequently updated collector.
- **Silent default threshold:** Omitting even one deterministic id makes it use the two-hour default; the six-id boundary matrix must fail on such an omission.
- **Boundary semantics:** Staleness uses `>=`; exactly 30 minutes is stopped, while one millisecond younger is not.
- **Exported view-model change:** Widening `EvidenceFamilyCardViewModel.lastCollectedLabel` to `string | null` is structurally breaking for consumers that assume a string. Repository consumers are `EvidenceFamilyCard`, `EvidenceScreen`, tests, and the public re-export; inspect all during Task 4 and update the renderer in the same commit.
- **Accessibility regression:** Visual conditional rendering alone can leave “Collector status unavailable” in `aria-label`; test both surfaces.
- **Live-state volatility:** The documented perp outage may recover before implementation finishes. Automated deterministic tests remain authoritative for the transition logic; live output must be reported honestly.

## Stop conditions

- Stop before vendoring if `dc79ce5` cannot resolve to a full upstream commit or the copied schema does not hash to `42df76fa2a5b24d866c8f0a6e2f0458fe4486f65035075016f9a2b35093c7b17`.
- Stop if pinned upstream assets show a shape materially different from the given additive 13-key contract (for example, required liveness, allowed additional properties, or renamed family keys); do not reconcile it locally.
- Stop if a fixture differs after synchronization and its byte provenance cannot be established directly from the pinned upstream checkout; never edit it to satisfy tests.
- Stop if implementation would require an adapter, application-port, domain, or Expo-shell change. Reassess the architecture rather than crossing repository boundaries.
- Stop if any proposed logic reads or derives the directional exit mapping outside `packages/domain/src/exit-policy/DirectionalExitPolicyService`.
- Stop and report rather than weakening assertions if a deterministic id still falls through to the default threshold, a missing specific record borrows `deterministic`, or a canonical payload fails validation after the verified vendor sync.

## Completion criteria

- Four ordered commits preserve red contract proof, canonical contract sync, red UI proof, and implementation separately.
- The canonical schema and provenance verify byte-for-byte at `dc79ce5` with the supplied digest.
- All named behavioral invariants pass.
- Focused application/UI checks and the full repository validation commands pass.
- Live verification is recorded when the production endpoint and active-outage state are available; otherwise the environmental limitation is reported without weakening automated coverage.

## Repository Targets

### Expected Files
- packages/ui/src/view-models/EvidenceViewModel.ts
- packages/ui/src/components/EvidenceFamilyCard.tsx

### Reference Files
- packages/ui/src/screens/EvidenceLivenessContract.regression.test.tsx
- packages/ui/src/screens/EvidenceLiveness.regression.test.tsx
- packages/ui/src/screens/EvidenceScreen.tsx
- packages/ui/src/index.ts

## Validation Commands

```bash
pnpm --filter @clmm/ui exec vitest run src/screens/EvidenceLivenessContract.regression.test.tsx src/screens/EvidenceLiveness.regression.test.tsx
pnpm --filter @clmm/ui exec eslint src/view-models/EvidenceViewModel.ts src/components/EvidenceFamilyCard.tsx src/screens/EvidenceLivenessContract.regression.test.tsx
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **specific-key threshold transition**: All six deterministic family ids use an explicit 30-minute threshold with no default fallthrough. (Test: `classifies every unavailable deterministic family at its own 30-minute boundary`)
- **no aggregate fallback**: The deterministic card loop reads only livenessMap[id], so missing specific liveness remains liveness_unknown even when deterministic is present. (Test: `uses a deterministic sub-family record and never falls back to the aggregate record`)
- **non-unavailable preservation**: Liveness classification runs only for unavailable feature-derived state and preserves available, partial, and invalid states. (Test: `preserves available partial and invalid deterministic states when liveness is present`)
- **available-label suppression**: Available deterministic family cards project null for lastCollectedLabel and the component omits null labels visually and accessibly. (Test: `suppresses the collector label for an available deterministic family`)

