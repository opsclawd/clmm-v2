# Design: Evidence Adapter Response Unwrapping

## Problem Statement
`CurrentEvidenceAdapter.fetchCurrent()` currently validates the *entire* response envelope from the `regime-engine` API using `parseEvidenceBundle()`. However, `parseEvidenceBundle()` is strictly typed to validate only the inner `bundle` object, not the wrapper. As a result, when the API returns real evidence wrapped in its expected envelope (containing `schemaVersion`, `pair`, `scope`, `queriedAt`, and an `items` array), the shape validation fails. This causes the adapter to reject all valid responses as `"malformed"`, breaking the Evidence UI and preventing users from seeing their real position data.

## Key Design Decisions & Trade-offs
1. **Option A: Define and vendor a new schema for the response envelope.** We could create an `EvidenceResponseWrapper` schema, validate the outer shape, and then extract the bundle. This is the most "correct" approach conceptually, but adds complexity and maintenance overhead for a wrapper shape that only exists as a transport detail.
2. **Option B: Treat the envelope as an opaque JSON object and safely extract the nested bundle.** This approach involves duck-typing the response envelope to look for `body.items`, extracting the first element's `bundle`, and passing that into the existing `parseEvidenceBundle()`. This is much simpler, avoids introducing new schemas, and keeps validation strictly focused on the domain object (`EvidenceBundle`) that the application actually consumes.
3. **Handling an empty `items` array.** The endpoint could theoretically return an empty `items` array on a 200 OK if there is no current evidence for the pair. This should not be treated as `"malformed"`, but rather as a normal `"not-found"` state.

## Proposed Approach
We will proceed with **Option B** (Opaque extraction). 

1. Update `CurrentEvidenceAdapter.fetchCurrent()` to inspect the parsed JSON `body`.
2. Ensure `body` is an object and contains an `items` array.
3. If `items` is empty, return `{ kind: 'not-found' }`.
4. If `items` is not empty, extract `body.items[0].bundle` and pass *that* to `parseEvidenceBundle()`.
5. If the extracted bundle passes validation, return `{ kind: 'block', block }`.
6. Update the unit tests in `CurrentEvidenceAdapter.test.ts` to use a fixture resembling the full API wrapper, ensuring we don't regress to expecting a bare bundle.

### Rationale
This approach minimizes structural changes to the codebase and avoids creating new schemas for transport-level envelopes. Since `parseEvidenceBundle` already provides robust schema validation for the `EvidenceBundle`, extracting it from an opaque envelope safely covers all requirements. 

## Assumptions Made
1. **Single Bundle Consumption:** The UI (`EvidenceScreen`, `EvidenceFamilyCard`) and `EvidenceReadPort` only expect and consume a single `EvidenceBundle`. If the `items` array contains multiple bundles (e.g., from different sources), selecting the first item (`items[0].bundle`) satisfies the current architectural expectations and intended UI behavior without requiring a full application rewrite.
2. **Empty Items Array:** A 200 OK response with an empty `items` array (`[]`) signifies that no evidence exists for the queried pair/scope, cleanly mapping to the `{ kind: 'not-found' }` port result.
3. **Envelope Schema:** The rest of the envelope (`schemaVersion`, `queriedAt`, etc.) does not need strict runtime schema validation as long as the internal `EvidenceBundle` is present and passes its rigorous validation.

## Scope
**In Scope:**
- Modifying `CurrentEvidenceAdapter.fetchCurrent()` to unwrap the `items` array before calling `parseEvidenceBundle`.
- Handling the empty `items` array case gracefully by mapping it to `{ kind: 'not-found' }`.
- Updating `CurrentEvidenceAdapter.test.ts` to use a realistic full-wrapper fixture instead of a bare bundle fixture for the valid 200 OK test cases.

**Out of Scope:**
- Modifying `EvidenceScreen`, `EvidenceViewModel`, or `EvidenceReadPort` to support multiple bundles concurrently.
- Defining a formal JSON schema for the API envelope.

## Risks & Concerns
- **Multiple Items Data Loss:** By plucking only `items[0]`, any additional evidence items returned by the API will be ignored. Given the UI currently only supports a single bundle, this is acceptable for now, but may require revisiting if the backend starts emitting multi-source evidence bundles intended for side-by-side comparison.
