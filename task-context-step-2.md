# Task Context: Task 2

Title: Build the complete display-ready PolicyInsight view model

## Workspace & Scope Constraints

## WORKSPACE CONSTRAINTS

Your working directory is a dedicated git worktree with the repository's complete history. Run all commands from it. Do NOT cd to or read paths outside this directory — external-directory access is automatically rejected. git log, git diff, etc. work here directly.

.ai-orchestrator.local.json, if one exists, lives only in the main checkout and is intentionally not copied into your worktree — it is operator-machine-specific and not part of your task. Do not search for it or read it outside this directory. Reason about configuration using only .ai-orchestrator.json in your own working directory; treat it as the effective config for your task.

Working Directory: /home/gary/.openclaw/workspace/clmm-superpowers-v2/.ai-worktrees/issue-93
Repository: opsclawd/clmm-v2
Branch: ai/issue-93
Start Commit: ea439d93e9d2ece2778fd487e370173c295002c9

## Task Requirements

**Files:**

- Modify: `packages/ui/src/view-models/PolicyInsightsViewModel.ts`
- Modify: `packages/ui/src/view-models/PolicyInsightsViewModel.test.ts`

**Behavioral invariants:**

- Basis points format exactly without floating-point rounding: `0 -> 0%`, `1 -> 0.01%`, `3750 -> 37.5%`, and `10000 -> 100%`.
- Market, fundamental, posture, range-bias, and sensitivity enums map to stable title/sentence-case labels in the view model; the component never interprets raw enums.
- Canonical level strings retain their supplied precision and order, while lexical zero values (`0`, `0.0`, `0.00`) are removed. A side with valid values gets one comma-separated `USDC/SOL` label; when both sides are empty, one `No eligible support or resistance levels` label is supplied.
- Evidence copy maps `FULL`, `PARTIAL`, and `DEGRADED` to `Full`, `Partial`, and `Limited evidence coverage`, appending pluralized aggregate bundle/source counts only; raw IDs never enter the view model.
- `isDegraded` is true for `PARTIAL`/`DEGRADED` evidence or non-`COMPLETE` data quality. `isLowConfidence` is true below 5000 bps.
- `isStale` is true when canonical freshness is `STALE` or `expiresAt <= now`; as-of and expiry labels are always display-ready UTC strings.
- Stable warning copy is keyed by warning/reason code, upstream free-form warning messages are ignored, duplicates are removed, and at most three items are returned in canonical order.
- Reasoning is unchanged through 240 characters and becomes the first 239 characters plus `…` when longer.
- Critical risk and exit recommendations remain `danger`; otherwise stale, degraded, low-confidence, elevated-risk, or stand-down insights are `warning`; only fresh/full/complete/high-confidence normal insights are `neutral`.

- [ ] **Step 1: Write the failing view-model tests**

Add exact tests named:

```text
formats basis points exactly without rounding away precision
maps market and fundamental regimes to display-ready labels
preserves canonical decimal levels while filtering zero placeholders
marks both empty level arrays unavailable instead of rendering zero
summarizes evidence coverage and aggregate counts without raw identifiers
marks partial degraded and low-confidence insights as visually weaker
marks an expired insight stale even when freshness.status is FRESH
maps deduplicates and bounds warning and reason-code copy
bounds long reasoning for display
keeps critical and exit actions at danger precedence
```

Use `current-pair.json` for fresh/full/empty-level coverage, `current-position.json` for multiple levels/partial evidence/exit action, and `history.json` item 2 for degraded/stale coverage. Clone before overrides so imported fixtures remain immutable.

- [ ] **Step 2: Run the focused view-model test and confirm it fails**

Run:

```bash
pnpm --filter @clmm/ui test -- src/view-models/PolicyInsightsViewModel.test.ts
```

Expected: failures identify missing fields, the current rounded `3750 -> 38%` behavior, missing expiry handling, and absent evidence/warning/level formatting.

- [ ] **Step 3: Add display-ready fields and pure formatting helpers**

Extend the exported `PolicyInsightsViewModel` with this required shape:

```ts
type PolicyInsightsViewModel = {
  actionLabel: string;
  severity: PolicyInsightsSeverity;
  marketRegimeLabel: string;
  fundamentalRegimeLabel: string;
  postureLabel: string;
  rangeBiasLabel: string;
  rebalanceSensitivityLabel: string;
  maxDeploymentLabel: string;
  riskLabel: string;
  confidenceLabel: string;
  dataQualityLabel: string;
  freshnessLabel: string;
  asOfLabel: string;
  expiresLabel: string;
  isStale: boolean;
  isDegraded: boolean;
  isLowConfidence: boolean;
  supportsLabel: string | null;
  resistancesLabel: string | null;
  levelsUnavailableLabel: string | null;
  evidenceSummary: string;
  warningLabels: string[];
  reasoning: string;
  subtitle: string;
};
```

Implement small pure helpers for exact basis-point formatting, enum labels, UTC timestamp labels, lexical-zero level filtering, evidence-count pluralization, stable code mapping/deduplication, and bounded text. Use this advisory subtitle:

```text
Advisory policy context only. Nothing is signed or applied; deterministic stop-loss monitoring continues independently.
```

Do not return evidence reference objects or free-form warning messages.

- [ ] **Step 4: Run focused verification**

Run:

```bash
pnpm --filter @clmm/ui test -- src/view-models/PolicyInsightsViewModel.test.ts
pnpm --filter @clmm/ui typecheck
```

Expected: all view-model tests pass with exact basis-point values, canonical fixture coverage, bounded copy, no fake zero levels, and no raw evidence identifiers.

- [ ] **Step 5: Commit the view-model delta**

```bash
git add packages/ui/src/view-models/PolicyInsightsViewModel.ts packages/ui/src/view-models/PolicyInsightsViewModel.test.ts
git commit -m "feat: format canonical policy insight context"
```

## Repository Targets

### Expected Files

- packages/ui/src/view-models/PolicyInsightsViewModel.ts
- packages/ui/src/view-models/PolicyInsightsViewModel.test.ts

## Validation Commands

```bash
pnpm --filter @clmm/ui test -- src/view-models/PolicyInsightsViewModel.test.ts
pnpm --filter @clmm/ui typecheck
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **basis points retain exact precision**: Basis points render exact hundredths of a percent without floating-point rounding. (Test: `formats basis points exactly without rounding away precision`)
- **canonical enums become display labels**: Market, fundamental, posture, range-bias, and sensitivity enums are mapped centrally to stable human-readable labels. (Test: `maps market and fundamental regimes to display-ready labels`)
- **zero levels are missing not prices**: Lexical zero level strings are filtered, valid decimal strings preserve precision and order, and both empty sides produce one unavailable label. (Test: `preserves canonical decimal levels while filtering zero placeholders`)
- **evidence is summarized without internals**: Evidence status and aggregate counts are shown without bundle hashes, reference IDs, locators, or selection-policy details. (Test: `summarizes evidence coverage and aggregate counts without raw identifiers`)
- **weak evidence and low confidence are explicit**: Partial or degraded evidence, incomplete data, and confidence below 5000 bps produce explicit weak-state flags. (Test: `marks partial degraded and low-confidence insights as visually weaker`)
- **expiry is stale**: An insight whose expiresAt is at or before now is stale even if the read-time freshness enum says FRESH. (Test: `marks an expired insight stale even when freshness.status is FRESH`)
- **warning copy is stable and bounded**: Warning and reason codes map to stable copy, deduplicate in canonical order, ignore free-form messages, and return no more than three items. (Test: `maps deduplicates and bounds warning and reason-code copy`)
- **reasoning is bounded**: Reasoning longer than 240 characters is truncated to 239 characters plus an ellipsis. (Test: `bounds long reasoning for display`)
- **danger has precedence**: Critical risk and both exit recommendations remain danger even when stale, degraded, or low confidence. (Test: `keeps critical and exit actions at danger precedence`)
