# Task Context: Task 6

Title: Project evidence into deterministic UI view models

## Workspace & Scope Constraints

## WORKSPACE CONSTRAINTS

Your working directory is a dedicated git worktree with the repository's complete history. Run all commands from it. Do NOT cd to or read paths outside this directory — external-directory access is automatically rejected. git log, git diff, etc. work here directly.

.ai-orchestrator.local.json, if one exists, lives only in the main checkout and is intentionally not copied into your worktree — it is operator-machine-specific and not part of your task. Do not search for it or read it outside this directory. Reason about configuration using only .ai-orchestrator.json in your own working directory; treat it as the effective config for your task.

Working Directory: /home/gary/.openclaw/workspace/clmm-superpowers-v2/.ai-worktrees/issue-131
Repository: opsclawd/clmm-v2
Branch: ai/issue-131
Start Commit: cb481028648d88de06c9049de1b83b5931dcfb1b

## Task Requirements

**Files:**

- Create: `packages/ui/src/view-models/EvidenceViewModel.ts`
- Create: `packages/ui/src/view-models/EvidenceViewModel.test.ts`
- Reference only: `packages/application/src/dto/evidence.ts`
- Reference only: canonical valid Evidence fixture under `schemas/regime-engine/evidence-bundle.v1/fixtures/valid/`
- Reference only: `packages/ui/src/view-models/PolicyInsightsViewModel.ts`

**Exported API change:** Add UI-local `EvidenceScreenViewModel`, `EvidenceFamilyCardViewModel`, and `buildEvidenceViewModel(bundle, now)`.

- [ ] Write tests first for canonical family ordering, last-collected formatting, each deterministic group, all contextual claims, empty/unavailable families, stale/fresh boundary behavior, confidence bounds, and observed/expiry display. Use an injected fixed `now` and mutate the canonical fixture one field at a time; do not reproduce schema validation in the view-model test.
- [ ] Define card view models with stable UI fields: `id`, `title`, `availability`, `freshnessLabel`, `stale`, `rows`, and contextual `claims`. Each row is a user label plus a string value; each claim exposes upstream direction verbatim plus formatted confidence, observed time, and expiry time.
- [ ] Implement `buildEvidenceViewModel` as a pure exhaustive projection. Always emit the ten families in the invariant order, render unavailable values as `—`, and derive stale labels only from canonical status/timestamps/expiry rules. Formatting may normalize case and dates for readability but must retain raw numeric/string values and must not convert claim direction into policy meaning.
- [ ] Commit with `git commit -m "feat(ui): project evidence view model"`.

**Task validation:**

- `pnpm --filter @clmm/ui exec vitest run src/view-models/EvidenceViewModel.test.ts`
- `pnpm --filter @clmm/ui exec eslint src/view-models/EvidenceViewModel.ts src/view-models/EvidenceViewModel.test.ts`

Expected: all ten cards are deterministic, unavailable families remain visible, and time-sensitive assertions use the injected clock.

## Repository Targets

### Expected Files

- packages/ui/src/view-models/EvidenceViewModel.ts
- packages/ui/src/view-models/EvidenceViewModel.test.ts

### Reference Files

- packages/application/src/dto/evidence.ts
- schemas/regime-engine/evidence-bundle.v1/fixtures/valid/
- packages/ui/src/view-models/PolicyInsightsViewModel.ts

## Validation Commands

```bash
pnpm --filter @clmm/ui exec vitest run src/view-models/EvidenceViewModel.test.ts
pnpm --filter @clmm/ui exec eslint src/view-models/EvidenceViewModel.ts src/view-models/EvidenceViewModel.test.ts
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **family order is canonical**: The projection always emits the five deterministic groups followed by the five contextual groups in the documented order. (Test: `projects all evidence families in canonical order`)
- **unavailable coverage stays visible**: Missing or unavailable data produces a named unavailable card with an em dash and explanation instead of omitting the family. (Test: `preserves unavailable families instead of dropping them`)
- **staleness follows canonical time semantics**: Fresh/stale labels use only contract status, observed/collected/expiry timestamps, and injected now. (Test: `marks stale evidence from canonical timestamps`)
- **contextual direction remains display-only**: Direction, confidence, observed time, and expiry are formatted without producing posture, recommendation, or swap-direction fields. (Test: `renders contextual claims without deriving policy`)
