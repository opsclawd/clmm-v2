# Vendored position-plan.v1 schema requires fabricated exitIntent field, blocking real REQUEST_EXIT_CLMM plans

## Summary

Position-scoped plan requests for the actual breach-qualified exit case (`REQUEST_EXIT_CLMM`) are still rejected client-side after #119/PR #120, due to a second, independent vendoring-drift bug in the same schema: `schemas/regime-engine/position-plan.v1/schema.json` requires a fabricated `exitIntent` field on `REQUEST_EXIT_CLMM` actions that does not exist anywhere in `regime-engine`'s real contract.

This means the #116 → #118 → #119/#120 fix chain resolved the routine/no-op plan path (`STAND_DOWN`, confirmed live via in-container diagnostic returning `{"kind":"ok", ...}`), but the one scenario the whole plan-submission feature exists for — a position actually breaching its range and needing `REQUEST_EXIT_CLMM` — is still silently dropped by `parseRegimePlanResponse`.

## Evidence

Live diagnostic run inside the deployed `clmm-worker` container (position `57DoQihsbyFy53R5DbcvoCbJDdscuNhd37GvxNX6nhqF`, wallet `EHu1D4EkjM3pQpQxTioFR2e2gAARFRx76wkZUYbPtXsg`), POSTing a real `breachQualified: true` request directly to `regime-engine`'s `/v1/plan`, on top of the current deployed/merged fix (PR #120, commit `a0f9c59`):

`regime-engine` returns HTTP 200 with:

```json
{ "type": "REQUEST_EXIT_CLMM", "reasonCode": "POSITION_RANGE_BREACH_QUALIFIED" }
```

No `exitIntent` field — because `regime-engine`'s authoritative type does not have one. From `regime-engine`'s `src/contract/v1/types.ts`:

```ts
export interface PlanAction {
  type: PlanActionType;
  reasonCode: string;
}
```

There is no `exitIntent`/`PlanExitIntent` type anywhere in `regime-engine`'s contract.

But `clmm-v2`'s vendored schema (`schemas/regime-engine/position-plan.v1/schema.json`, `$defs.PlanAction`) has:

```json
"allOf": [
  {
    "if": { "properties": { "type": { "const": "REQUEST_EXIT_CLMM" } }, "required": ["type"] },
    "then": { "properties": { "exitIntent": { "$ref": "#/$defs/PlanExitIntent" } }, "required": ["exitIntent"] }
  }
]
```

This causes `validatePlanResponse` to fail, so `parseRegimePlanResponse` returns `null`, and `RegimePlanAdapter` reports `{"kind":"permanent","reason":"schema-invalid"}` even though `regime-engine` answered correctly.

The fixture `schemas/regime-engine/position-plan.v1/fixtures/valid/request-exit.json` also encodes this fabricated field (and a stale `expiresAtUnixMs` that #120 already removed from `required` elsewhere), and `packages/application/src/dto/regimePlanValidator.test.ts` has a test (`rejects a request-exit plan without canonical exit intent`) asserting the fabricated requirement as correct behavior.

## Root cause

Same bug class as #119: the vendored `position-plan.v1` schema was never generated from `regime-engine`'s real contract and includes an invented field/requirement that doesn't exist in the live API.

## Fix

- Remove the `exitIntent` property, `PlanExitIntent` `$defs` entry, and the conditional `allOf`/`if`/`then` block entirely from `schemas/regime-engine/position-plan.v1/schema.json`.
- Update `schemas/regime-engine/position-plan.v1/fixtures/valid/request-exit.json` to match a real `REQUEST_EXIT_CLMM` response shape (drop `exitIntent`, drop stale `expiresAtUnixMs`).
- Update/remove the now-incorrect `missing-exit-intent.json` invalid fixture and the `rejects a request-exit plan without canonical exit intent` test in `packages/application/src/dto/regimePlanValidator.test.ts` (same treatment as #117/#118: delete the test asserting fabricated behavior, don't add a compatibility shim).
- Per #119's acceptance criteria point 4 (not yet done): also audit `schemas/regime-engine/execution-result.v1/schema.json` and `schemas/regime-engine/plan-request.v1/schema.json` against `regime-engine`'s real `src/contract/v1/types.ts` for the same class of drift, since two independent instances of it have now been found in `position-plan.v1` alone.

## Acceptance criteria

- [ ] `exitIntent`/`PlanExitIntent` removed from `position-plan.v1/schema.json`.
- [ ] Fixtures updated to match real `regime-engine` response shapes (no fabricated fields).
- [ ] Validator tests updated to reflect the real contract, not invented requirements.
- [ ] `execution-result.v1` and `plan-request.v1` schemas spot-checked against `regime-engine`'s `src/contract/v1/types.ts` for equivalent drift.
- [ ] Live-verified: a real breach-qualified position produces a `{"kind":"ok"}` `RegimePlanAdapter` result with a `REQUEST_EXIT_CLMM` action, not just `STAND_DOWN`/`HOLD`.
