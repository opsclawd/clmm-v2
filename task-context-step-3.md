# Task Context: Task 3

Title: Verify screen-level association and fallback behavior
## Workspace & Scope Constraints

## WORKSPACE CONSTRAINTS

Your working directory is a dedicated git worktree with the repository's complete history. Run all commands from it. Do NOT cd to or read paths outside this directory — external-directory access is automatically rejected. git log, git diff, etc. work here directly.

.ai-orchestrator.local.json, if one exists, lives only in the main checkout and is intentionally not copied into your worktree — it is operator-machine-specific and not part of your task. Do not search for it or read it outside this directory. Reason about configuration using only .ai-orchestrator.json in your own working directory; treat it as the effective config for your task.

Working Directory: /home/gary/.openclaw/workspace/clmm-superpowers-v2/.ai-worktrees/issue-150
Repository: opsclawd/clmm-v2
Branch: ai/issue-150
Start Commit: 9b07ffc44e500e4ab99f1c7f70fd0cd317fafc72

## Task Requirements

**Files:**

- Modify: `packages/ui/src/screens/EvidenceScreen.tsx`
- Modify: `packages/ui/src/screens/EvidenceScreen.test.tsx`
- Reference only: `packages/ui/src/view-models/EvidenceViewModel.ts`
- Reference only: `packages/ui/src/components/EvidenceFamilyCard.tsx`
- Reference only: `schemas/regime-engine/evidence-bundle.v1/fixtures/valid/deterministic-only.json`
- Reference only: `apps/app/app/evidence.tsx`

- [ ] **Step 1: Write the two failing screen integration tests named in the invariant table**

For warning placement, clone the deterministic fixture and add one warning targeted to `market_state`, one targeted to `supportResistance`, one mixed warning targeted to `['market_state', 'unknown_target']`, and one with an unknown target only. Assert `market_state` contains both its targeted warning and the mixed warning, `supportResistance` contains its warning, the fallback box contains only the unknown-target-only message, and associated/mixed warnings are absent from `evidence-general-warnings`.

For derivation, clone the fixture, replace its feature lineage with two source references 61 minutes apart, give each an explicit 64-character hash locator, render the canonical screen, press `evidence-derivation-toggle-feat-price-001`, and assert the explanation includes:

```text
feat-price-001 = 150.25 usd, from 2 observations spanning 61 minutes, computed by price-aggregator v1.0.0, observed 2024-01-15T10:00:00Z, fresh until 2024-01-15T11:00:00Z.
```

Assert both exact hashes render and no link role exists.

- [ ] **Step 2: Run only the screen tests and confirm the fallback-label assertion fails**

Run:

```bash
pnpm --filter @clmm/ui exec vitest run src/screens/EvidenceScreen.test.tsx
```

Expected: the integration behavior supplied by Tasks 1 and 2 is present, but the new fallback-region naming assertion fails until the screen copy is updated.

- [ ] **Step 3: Clarify that the top-level warning box is only the fallback**

Keep the existing conditional `vm.warnings.length > 0` rendering, but change its heading from `Warnings:` to `General warnings:` and add `testID="evidence-general-warnings"` to the containing `View`. Do not independently filter or reassociate warnings in the screen; the view-model remains the single projection boundary.

- [ ] **Step 4: Run focused screen verification**

Run:

```bash
pnpm --filter @clmm/ui exec vitest run src/screens/EvidenceScreen.test.tsx
pnpm --filter @clmm/ui exec eslint src/screens/EvidenceScreen.tsx src/screens/EvidenceScreen.test.tsx
```

Expected: the screen test file passes and both screen files lint cleanly. The implement loop's automatic `pnpm -r typecheck` gate must also pass before this task is committed.

- [ ] **Step 5: Live-check the existing Evidence route without changing it**

With the repository's normal live API configuration available, launch the dev server in a bounded process with explicit lifecycle cleanup:

```bash
pnpm --filter @clmm/app dev:web
```

Open the existing Evidence route, expand at least one multi-input deterministic feature, and verify the displayed count equals `inputLineage.length`, the span matches the earliest/latest matching `sourceReferences[].observedAt`, calculator and feature timestamps match the bundle, each locator is non-clickable, and targeted warnings appear in the correct card. Upon completing visual inspection, shut down the dev server process cleanly (e.g. terminating the process task or sending SIGINT). Record the checked run ID in the implementation/PR notes, not in source. If no live environment is available, report this acceptance item as unverified rather than substituting fixture results or inventing data.

- [ ] **Step 6: Commit the screen integration slice**

```bash
git add packages/ui/src/screens/EvidenceScreen.tsx packages/ui/src/screens/EvidenceScreen.test.tsx
git commit -m "test(ui): verify evidence lineage presentation"
```

## Tests to add or update

- `packages/ui/src/view-models/EvidenceViewModel.test.ts`: add exactly the four named derivation/warning projection cases from the invariant table while preserving all existing canonical-family, staleness, confidence, and research-brief coverage.
- `packages/ui/src/components/EvidenceFamilyCard.test.tsx`: add exactly the four named presentation/state cases; update existing hand-built card objects only as needed for the optional fields.
- `packages/ui/src/screens/EvidenceScreen.test.tsx`: add the two named integration cases and retain the existing screen-state, position-feature, and raw-telemetry-order cases.
- No schema, DTO, adapter, app-route, or end-to-end fixture test changes are planned.

## Validation commands

Run these after the implementing tasks; they are listed here for handoff clarity and are also acceptance criteria within the relevant tasks:

```bash
pnpm --filter @clmm/ui exec vitest run src/view-models/EvidenceViewModel.test.ts src/components/EvidenceFamilyCard.test.tsx src/screens/EvidenceScreen.test.tsx
pnpm --filter @clmm/ui exec eslint src/view-models/EvidenceViewModel.ts src/view-models/EvidenceViewModel.test.ts src/components/EvidenceFamilyCard.tsx src/components/EvidenceFamilyCard.test.tsx src/screens/EvidenceScreen.tsx src/screens/EvidenceScreen.test.tsx src/index.ts
pnpm --filter @clmm/ui typecheck
pnpm -r typecheck
```

For live manual acceptance when configured (must be shut down after inspection):

```bash
pnpm --filter @clmm/app dev:web
```

## Risk areas

- **Warning vocabulary drift:** `affectedFamilies` is typed as arbitrary strings. The explicit known-family/feature/umbrella partition must preserve unknown targets in fallback instead of silently discarding them.
- **Timestamp edge cases:** invalid or unmatched timestamps can yield `NaN`; filter to finite parsed values and expose `Unknown time span` rather than arithmetic garbage.
- **Lineage resolution integrity:** `inputCount` is `feature.inputLineage.length`, and `inputs` contains an entry for every lineage ID (projecting `Unresolved reference (${referenceId})` for unresolved IDs). This ensures input list length matches `inputCount` without fake data.
- **Staleness conflation:** derivation staleness is feature-local; existing card/bundle staleness remains unchanged.
- **Mobile layout:** long hashes must wrap or shrink inside the card without being truncated into an unusable value or turned into a URL action.
- **Accessibility/state correctness:** every interactive derivation row needs a 44-point target, button role/label, expanded state, stable test ID, and independent transitions.
- **Concurrent view-model work:** issues #141 and #142 touch the same view-model. Preserve their current family/scope behavior and resolve overlap narrowly rather than restructuring the file.
- **Old fixtures with URL-shaped locators:** presentation must stay opaque regardless of string shape; tests should include both hash-like and URL-shaped values to guard against auto-linking.

## Stop conditions

- Stop if completing the behavior would require changing an application DTO, vendored schema/fixture, adapter, API, backend, or app composition file; that violates the issue boundary and needs a revised design.
- Stop if canonical validated production bundles contain unresolved lineage IDs or non-parseable canonical timestamps often enough that the required count/span claim cannot be made reliably; report the contract/data mismatch rather than inventing references or timestamps.
- Stop if live locators are not actually hash identifiers as asserted by the issue. Continue treating them as opaque text in code, but do not claim live hash verification until the upstream discrepancy is resolved.
- Stop if `affectedFamilies` uses a production vocabulary incompatible with the documented family/feature/`deterministic` matching rules; capture examples and seek a contract decision rather than guessing associations.
- Stop if implementing expansion would require global state or navigation changes. The approved behavior is local, reversible UI state only.
- Stop if any change touches or re-derives exit direction; this feature must remain presentation-only and cannot affect `DirectionalExitPolicyService` behavior.

## Completion criteria

The work is complete only when every named invariant test passes, lint and both scoped/workspace typechecks pass, only the seven affected UI files changed, no locator is actionable, associated warnings are localized with an explicit fallback for unassociated warnings, and the live check is either recorded with a real run ID or explicitly reported as unavailable.

## Repository Targets

### Expected Files
- packages/ui/src/screens/EvidenceScreen.tsx
- packages/ui/src/screens/EvidenceScreen.test.tsx

### Reference Files
- packages/ui/src/view-models/EvidenceViewModel.ts
- packages/ui/src/components/EvidenceFamilyCard.tsx
- schemas/regime-engine/evidence-bundle.v1/fixtures/valid/deterministic-only.json
- apps/app/app/evidence.tsx

## Validation Commands

```bash
["pnpm","--filter","@clmm/ui","exec","vitest","run","src/screens/EvidenceScreen.test.tsx"]
["pnpm","--filter","@clmm/ui","exec","eslint","src/screens/EvidenceScreen.tsx","src/screens/EvidenceScreen.test.tsx"]
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **screen warning fallback**: Associated warnings render inside the affected cards and only warnings with no renderable target appear in the General warnings region. (Test: `renders associated warnings inside family cards and only unmatched warnings in the screen fallback`)
- **end-to-end evidence explanation**: Expanding a deterministic feature from a canonical bundle renders its exact value, input count, time span, calculator, feature timestamps, and opaque input hashes. (Test: `expands a deterministic feature to explain a canonical bundle derivation end to end`)

