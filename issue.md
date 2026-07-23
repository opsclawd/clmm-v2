# feat: complete the PolicyInsight UI delta for the canonical v1 contract

## Summary

Complete the **remaining UI delta** needed to render the canonical Regime Engine `PolicyInsight v1` after #92 centralizes contract parsing and DTO mapping.

The positions experience already renders much of the decision-relevant policy content. This issue must inspect and extend the existing components rather than build a second PolicyInsight surface or replace working presentation unnecessarily.

## Correct dependency boundary

```text
Regime #63 -> canonical PolicyInsight v1 schema and fixtures
Regime #61 -> synthesized canonical insights
clmm #92   -> one validated adapter/DTO/parser boundary
clmm #93   -> concise user-facing delta only
```

UI code must consume the internal validated view model from #92. It must not fetch Regime directly or maintain another handwritten runtime parser.

## Required pre-implementation audit

Before modifying components, document which canonical fields and states are already rendered correctly and which are missing.

At minimum inspect existing support for:

- recommended action;
- freshness/stale status;
- posture;
- range bias;
- rebalance sensitivity;
- maximum capital deployment;
- risk;
- confidence;
- data quality;
- reasoning;
- unavailable/degraded handling.

Only implement the gap against `PolicyInsight v1`.

## Required UI delta

Add or correct presentation for canonical fields that are not already handled:

- market regime;
- fundamental regime;
- canonical `supportsUsdcPerSol` and `resistancesUsdcPerSol` arrays;
- evidence-selection status (`FULL`, `DEGRADED`, `NONE`, or exact canonical enum);
- selected evidence/bundle summary appropriate for a user, without dumping raw IDs or every metric;
- machine-readable warning/reason-code mapping where needed for stable copy;
- canonical basis-point formatting for confidence and maximum capital deployment;
- strict malformed-contract state supplied by #92.

Do not render empty level arrays as zero-price levels. Omit or mark levels unavailable when no valid level evidence exists.

## Required presentation states

Implement or verify explicit states:

### Loading

The canonical request is in progress. Do not show stale placeholder values as current.

### Ready/fresh

Show concise decision context and the insight `asOf` time/freshness.

### Stale

The last valid insight may be shown only with visibly weaker stale treatment and expiry/as-of context. It must not look current.

### Degraded

Show the valid insight with explicit partial/low-coverage evidence context and warnings.

### Unavailable/not found

Show that policy analysis is unavailable while making clear that position monitoring and deterministic stop-loss protection continue independently.

### Invalid/malformed upstream

Fail closed. Do not partially render fields from a payload rejected by #92. Show a stable unavailable/error state and emit observability for the contract failure.

### Upstream/store error

Render a bounded retry/error state without fabricating policy guidance.

## Product rules

- Keep the UI concise and decision-focused.
- Do not dump raw evidence bundles, internal IDs, or all feature values.
- Do not present contextual evidence as deterministic certainty.
- Make stale, degraded, and low-confidence output visibly weaker than fresh/high-quality output.
- Preserve the distinction between advisory PolicyInsight and the deterministic execution/approval flow.
- An `EXIT_TO_*` recommendation is not a signed or automatically executable instruction.

## View-model behavior

Prefer one existing/extended `PolicyInsightViewModel` that provides display-ready values and stable states.

The view model should centralize:

- basis-point formatting;
- price-level decimal-string formatting;
- freshness/status mapping;
- concise evidence coverage labels;
- reason/warning copy selection;
- maximum reasoning-item limits;
- unavailable versus true-zero distinctions.

Components should not reinterpret raw contract enums independently.

## Contract fixtures and tests

Tests must consume the canonical fixtures pinned through #92 or view-model fixtures derived directly from them.

Cover at minimum:

- fresh full-evidence insight;
- fresh deterministic-only/degraded insight;
- stale insight;
- no evidence/`NONE` selection;
- empty support/resistance arrays;
- multiple support/resistance levels;
- `EXIT_TO_USDC` and `EXIT_TO_SOL` advisory actions;
- unavailable/not found;
- store/upstream error;
- malformed payload rejected by #92;
- out-of-range/invalid basis points rejected before UI;
- long reasoning/warning lists bounded for display.

## Scope

In scope:

- audit of existing PolicyInsight presentation;
- minimal view-model additions;
- targeted existing screen/component updates;
- loading/fresh/stale/degraded/unavailable/invalid/error states;
- accessibility and concise copy affected by the delta;
- fixture-driven unit/component tests.

Out of scope:

- another PolicyInsight parser or Regime HTTP adapter;
- changing the canonical wire contract;
- new synthesis rules;
- raw evidence collector work;
- raw analytics dashboards;
- execution preview/sign/submit changes;
- a broad redesign of the positions screen.

## Guardrails

- Reuse the validated boundary from #92.
- Do not duplicate existing PolicyInsight components or fields.
- Missing is not zero.
- Invalid contract payloads fail closed.
- Policy guidance cannot obscure or disable deterministic stop-loss behavior.

## Acceptance criteria

- [ ] A pre-implementation audit identifies existing coverage and the exact UI delta.
- [ ] Existing PolicyInsight components are extended rather than duplicated or replaced without need.
- [ ] Market/fundamental regime, canonical level arrays, and evidence-selection context render when available.
- [ ] Basis-point and decimal-string values are formatted centrally and correctly.
- [ ] Loading, fresh, stale, degraded, unavailable, malformed, not-found, store-error, and upstream-error states are distinct and tested.
- [ ] Empty/missing levels never render as fake zero values.
- [ ] Invalid payloads rejected by #92 are never partially displayed.
- [ ] Contextual evidence is visually and textually qualified.
- [ ] The UI remains concise and does not expose raw evidence internals.
- [ ] Copy states that policy analysis is advisory and independent from deterministic stop-loss monitoring/execution where relevant.

## Parent

Part of #90.

## Blocked by

- #92
- `opsclawd/regime-engine#61`
