# fix: align PolicyInsights adapter and DTOs with regime-engine canonical output

## Summary

Update clmm-v2 so its PolicyInsights adapter, DTOs, and app API parser consume the exact canonical output contract emitted by Regime Engine after contract normalization.

Additionally, eliminate duplicated hand-written PolicyInsight runtime validation across the BFF/app boundary by consuming one canonical contract artifact/fixture set from Regime Engine.

## Current problem

The current reader expects a payload shape that does not match Regime Engine's current live output. This can cause valid policy insight responses to be rejected before the user sees them.

There is also duplicated hand-rolled validation of the PolicyInsight shape across the adapter and the app layer, which creates a second source of contract truth that drifts independently from the Regime Engine output.

## Scope

In scope:

- `CurrentPolicyInsightsAdapter`;
- application DTOs;
- app API parser;
- contract validation/tests;
- any BFF controller shape updates needed for the canonical contract;
- consume one shared contract artifact/fixture set from Regime Engine (JSON Schema, fixtures);
- centralize parser/validation in one shared module rather than duplicating across boundaries.

Out of scope:

- UI design;
- evidence ingestion;
- synthesis rules.

## Acceptance criteria

- [ ] clmm-v2 consumes the exact canonical Regime Engine wire shape.
- [ ] No silent field-name or unit conversion remains undocumented.
- [ ] No duplicated hand-written validation exists across BFF and app boundaries.
- [ ] Adapter tests include a real canonical payload fixture from Regime Engine.
- [ ] Malformed payloads still fail closed.
- [ ] Freshness/status semantics remain intact.

## Parent

Part of opsclawd/clmm-v2#90.

## Blocked by

- opsclawd/regime-engine#63

## References

See the canonical design spec and execution plan for the full architecture boundary and delivery roadmap:

- [Evidence-Driven Policy Pipeline — Design Spec](https://github.com/opsclawd/regime-engine/blob/main/docs/superpowers/specs/2026-05-09-evidence-driven-policy-pipeline-design.md)
- [Evidence-Driven Policy Pipeline — Execution Plan](https://github.com/opsclawd/regime-engine/blob/main/docs/superpowers/plans/2026-05-09-evidence-driven-policy-pipeline-execution-plan.md)
