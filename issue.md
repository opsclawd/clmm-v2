# CurrentEvidenceAdapter validates the full response wrapper instead of the nested bundle, rejecting all real evidence as 'malformed'

## Summary

`CurrentEvidenceAdapter.fetchCurrent()` validates the *entire* `regime-engine` response wrapper against the vendored `evidence-bundle.v1` schema, instead of extracting and validating the actual bundle object nested inside it. This causes the Evidence page (#131) to report `"unavailableReason": "malformed"` for every real evidence response, even when the underlying bundle is perfectly valid.

## Evidence

Live response from `regime-engine`'s `/v1/evidence/sol-usdc/current?scope=pair` (now returning real data for the first time, after `sol-usdc-clmm-intelligence` issue #131's fix deployed):
```json
{
  "schemaVersion": "evidence-bundle.v1",
  "pair": "SOL/USDC",
  "scope": { "kind": "pair" },
  "queriedAt": "2026-08-03T15:59:17.755Z",
  "items": [
    { "bundle": { "asOf": "...", "pair": "SOL/USDC", "assessment": { ... }, ... } }
  ]
}
```
The vendored schema (`schemas/regime-engine/evidence-bundle.v1/schema.json`) validates the shape of a single `bundle` object (confirmed: `parseEvidenceBundle(real.items[0].bundle)` returns non-null). But `CurrentEvidenceAdapter.ts`:
```ts
const block = parseEvidenceBundle(body);
if (!block) {
  this.observability.log('warn', 'Evidence response failed shape validation');
  return { kind: 'malformed' };
}
```
passes `body` — the full wrapper object with `schemaVersion`/`pair`/`scope`/`queriedAt`/`items` at the top level — directly into `parseEvidenceBundle`. Confirmed: `parseEvidenceBundle(real)` (the full wrapper) returns `null`, reproducing the exact live `"malformed"` result, while `parseEvidenceBundle(real.items[0].bundle)` succeeds.

This never surfaced during #131's development because no real pair-scope evidence bundle existed to test the live response shape against until `sol-usdc-clmm-intelligence`#131 was fixed and deployed — presumably unit tests mocked/constructed fixtures already in the wrong (bundle-only, non-wrapped) shape, matching the adapter's incorrect assumption rather than the real API's actual response envelope.

## Fix

`CurrentEvidenceAdapter.fetchCurrent()` should extract the bundle from `body.items[0].bundle` (handling the case where `items` is empty — should probably be treated the same as `not-found`, distinct from the 404 status-code path, since `/v1/evidence/sol-usdc/current` can return 200 with `items: []` in principle) before calling `parseEvidenceBundle`, not validate the raw wrapper.

Also worth checking: does the `EvidenceScreen`/`EvidenceViewModel`/`EvidenceFamilyCard` code (also from #131) assume a single bundle or need to handle multiple `items`? The endpoint's shape suggests `items` could contain more than one bundle (e.g. across sources), worth confirming the intended UI behavior for that case while fixing this.

## Acceptance criteria

- [ ] `CurrentEvidenceAdapter` correctly unwraps the response envelope before schema validation.
- [ ] Regression test using a realistic full-wrapper fixture (not just a bare bundle object) asserting `fetchCurrent()` returns `{ kind: 'block', block }` for a valid real-shaped response.
- [ ] Live-verified: the Evidence page renders real data for SOL/USDC pair scope, not "malformed."

