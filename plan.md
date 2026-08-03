# Evidence Adapter Response Unwrapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `CurrentEvidenceAdapter.fetchCurrent()` unwrap the regime-engine response envelope and validate its first nested evidence bundle so the Evidence page receives real SOL/USDC data instead of a false `malformed` result.

**Architecture:** Keep the regime-engine response envelope as an adapter-owned transport detail. The adapter will perform only enough structural checking to safely locate `items[0].bundle`, continue using the application-owned `parseEvidenceBundle()` as the authoritative runtime validator, and preserve the existing single-bundle `EvidenceReadPort` contract through the BFF and UI.

**Tech Stack:** TypeScript, Fetch API, Vitest, AJV-backed `parseEvidenceBundle`, pnpm workspaces.

---

## Goal

Accept the live regime-engine shape `{ schemaVersion, pair, scope, queriedAt, items: [{ bundle }] }`, return the validated first bundle as `{ kind: 'block', block }`, and classify an empty `items` array as `{ kind: 'not-found' }`.

## Non-goals

- Do not change `EvidenceReadPort`, `EvidenceReadResult`, the BFF response, the app API client, or the UI view model.
- Do not add an envelope JSON Schema or modify the vendored `evidence-bundle.v1` contract.
- Do not combine or render multiple response items; the current application contract intentionally consumes only `items[0].bundle`.
- Do not accept the former bare-bundle mock shape as a successful upstream response.
- Do not add retries, persistence, external writes, or any directional exit-policy logic.

## Affected files

- `packages/adapters/src/outbound/regime-engine/CurrentEvidenceAdapter.test.ts` — replace bare-bundle HTTP mocks with realistic envelopes and add empty/malformed envelope regression coverage.
- `packages/adapters/src/outbound/regime-engine/CurrentEvidenceAdapter.ts` — safely inspect `body.items`, map an empty array to `not-found`, and validate only the first item's `bundle`.

Read-only references:

- `packages/application/src/dto/evidenceBundleValidator.ts` — authoritative inner-bundle validation behavior.
- `packages/application/src/ports/index.ts` — stable single-bundle `EvidenceReadPort` and result union.
- `packages/adapters/src/inbound/http/EvidenceController.ts` — confirms `block` and `not-found` already map correctly to the BFF response.
- `apps/app/src/api/evidence.ts` — confirms the client consumes one validated bundle.
- `packages/ui/src/view-models/EvidenceViewModel.ts` — confirms the UI builds one screen model from one bundle.
- `schemas/regime-engine/evidence-bundle.v1/schema.json` and `schemas/regime-engine/evidence-bundle.v1/fixtures/valid/contextual.json` — canonical contract and realistic valid inner bundle.
- `schemas/regime-engine/evidence-bundle.v1/fixtures/valid/deterministic-only.json` — canonical deterministic-only inner bundle.

## Behavioral invariants

These names are the exact Vitest test-case names to write before changing the adapter:

1. **Valid envelope selects first bundle** — when a 200 JSON object has a non-empty `items` array and `items[0].bundle` passes `parseEvidenceBundle()`, transition from the upstream-response state to `{ kind: 'block', block: items[0].bundle }`; later items are ignored. Test: `returns the first validated bundle from a realistic 200 response envelope`.
2. **Valid deterministic-only envelope succeeds** — when the first bundle is the valid deterministic-only fixture, transition to `block` without requiring contextual evidence. Test: `returns a deterministic-only bundle from a realistic 200 response envelope`.
3. **Empty envelope is absence, not corruption** — when a 200 JSON object has `items: []`, transition to `{ kind: 'not-found' }` without calling the bundle validator on a synthetic value. Test: `maps an empty 200 items array to not-found`.
4. **Malformed transport or inner bundle is rejected** — when the 200 body is not a record, `items` is missing or not an array, the first item is not a record, `bundle` is absent, or the nested bundle fails canonical schema validation, transition to `{ kind: 'malformed' }`. Test: `maps malformed 200 response envelopes or invalid nested bundles to malformed`.
5. **Existing non-success behavior is stable** — 404 remains `not-found`; 503 remains `store-unavailable`; other non-2xx, invalid JSON, timeout, and network failures remain `upstream-error`; no retries are introduced. Test: `maps evidence status responses without retry`.
6. **Sensitive values stay out of logs** — degraded paths must not log response bodies, bundle contents, or the internal token. Test: `does not log evidence bundle contents or internal tokens when logging degraded outcomes`.

## Task 1: Unwrap and validate the first evidence response item

**Files:**

- Modify: `packages/adapters/src/outbound/regime-engine/CurrentEvidenceAdapter.test.ts`
- Modify: `packages/adapters/src/outbound/regime-engine/CurrentEvidenceAdapter.ts`
- Reference: `packages/application/src/dto/evidenceBundleValidator.ts`
- Reference: `packages/application/src/ports/index.ts`
- Reference: `packages/adapters/src/inbound/http/EvidenceController.ts`
- Reference: `apps/app/src/api/evidence.ts`
- Reference: `packages/ui/src/view-models/EvidenceViewModel.ts`
- Reference: `schemas/regime-engine/evidence-bundle.v1/schema.json`
- Reference: `schemas/regime-engine/evidence-bundle.v1/fixtures/valid/contextual.json`
- Reference: `schemas/regime-engine/evidence-bundle.v1/fixtures/valid/deterministic-only.json`

No exported API signature changes are required. `CurrentEvidenceAdapter`, `EvidenceReadPort`, `EvidenceReadResult`, and `parseEvidenceBundle` retain their declarations.

- [ ] **Step 1: Write the envelope regressions first**

  In `CurrentEvidenceAdapter.test.ts`, add a local factory that models the live transport envelope without introducing a new production type or schema:

  ```ts
  function createEvidenceEnvelope(items: unknown[]) {
    return {
      schemaVersion: 'evidence-bundle.v1',
      pair: 'SOL/USDC',
      scope: { kind: 'pair' },
      queriedAt: '2026-08-03T15:59:17.755Z',
      items,
    };
  }
  ```

  Replace every successful 200 mock that currently serializes a bare canonical bundle with `createEvidenceEnvelope([{ bundle: canonicalEvidenceContextual }])` or `createEvidenceEnvelope([{ bundle: canonicalEvidenceDeterministic }])`. This includes the URL/header and trailing-slash tests so all success-path mocks honor the real upstream contract.

  Replace the first success test with a two-item envelope and assert that only the first bundle is returned:

  ```ts
  it('returns the first validated bundle from a realistic 200 response envelope', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify(
          createEvidenceEnvelope([
            { bundle: canonicalEvidenceContextual },
            { bundle: canonicalEvidenceDeterministic },
          ]),
        ),
        { status: 200 },
      ),
    );
    const adapter = new CurrentEvidenceAdapter(
      'https://regime.example.com',
      'test-internal-token',
      obs.port,
    );

    const result = await adapter.fetchCurrent();

    expect(result).toEqual({ kind: 'block', block: canonicalEvidenceContextual });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  ```

  Keep the deterministic-only case separate and rename it to the invariant name:

  ```ts
  it('returns a deterministic-only bundle from a realistic 200 response envelope', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify(
          createEvidenceEnvelope([{ bundle: canonicalEvidenceDeterministic }]),
        ),
        { status: 200 },
      ),
    );
    const adapter = new CurrentEvidenceAdapter(
      'https://regime.example.com',
      'test-internal-token',
      obs.port,
    );

    const result = await adapter.fetchCurrent();

    expect(result).toEqual({ kind: 'block', block: canonicalEvidenceDeterministic });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  ```

  Add the empty-items transition:

  ```ts
  it('maps an empty 200 items array to not-found', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(createEvidenceEnvelope([])), { status: 200 }),
    );
    const adapter = new CurrentEvidenceAdapter(
      'https://regime.example.com',
      'test-token',
      obs.port,
    );

    await expect(adapter.fetchCurrent()).resolves.toEqual({ kind: 'not-found' });
  });
  ```

  Move the current schema-invalid assertion out of the broad status test and cover all unsafe extraction shapes in one table-driven test:

  ```ts
  it('maps malformed 200 response envelopes or invalid nested bundles to malformed', async () => {
    const cases: Array<[string, unknown]> = [
      ['non-object body', null],
      ['array body', []],
      ['missing items', { pair: 'SOL/USDC' }],
      ['non-array items', { ...createEvidenceEnvelope([]), items: {} }],
      ['non-object first item', createEvidenceEnvelope([null])],
      ['missing bundle', createEvidenceEnvelope([{}])],
      ['invalid nested bundle', createEvidenceEnvelope([{ bundle: { pair: 'SOL/USDC' } }])],
    ];

    for (const [_case, body] of cases) {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify(body), { status: 200 }),
      );
      const adapter = new CurrentEvidenceAdapter(
        'https://regime.example.com',
        'test-token',
        obs.port,
      );

      await expect(adapter.fetchCurrent(), _case).resolves.toEqual({ kind: 'malformed' });
    }
  });
  ```

- [ ] **Step 2: Run the focused test and confirm the intended failures**

  Run:

  ```bash
  pnpm --filter @clmm/adapters exec vitest run src/outbound/regime-engine/CurrentEvidenceAdapter.test.ts
  ```

  Expected: FAIL because the existing adapter validates the whole envelope, so both realistic valid-envelope tests return `malformed`, and the empty-items test returns `malformed` instead of `not-found`. Existing non-200 and logging cases should remain passing.

- [ ] **Step 3: Implement minimal safe extraction in the adapter**

  Add this private module helper above the class in `CurrentEvidenceAdapter.ts`:

  ```ts
  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
  ```

  Replace only the existing `const block = parseEvidenceBundle(body)` success-body validation section with:

  ```ts
  if (!isRecord(body) || !Array.isArray(body['items'])) {
    this.observability.log('warn', 'Evidence response failed envelope validation');
    return { kind: 'malformed' };
  }

  const items = body['items'];
  if (items.length === 0) {
    this.observability.log('warn', 'Evidence upstream returned no current items');
    return { kind: 'not-found' };
  }

  const firstItem = items[0];
  const block = parseEvidenceBundle(isRecord(firstItem) ? firstItem['bundle'] : undefined);
  if (!block) {
    this.observability.log('warn', 'Evidence response failed shape validation');
    return { kind: 'malformed' };
  }
  return { kind: 'block', block };
  ```

  Do not validate the envelope's other fields, fall back to later items, mutate the bundle, or change any status handling outside the 200 branch.

- [ ] **Step 4: Verify the focused behavior, lint, and adapter type safety**

  Run these exact task-scoped commands:

  ```bash
  pnpm --filter @clmm/adapters exec vitest run src/outbound/regime-engine/CurrentEvidenceAdapter.test.ts
  pnpm --filter @clmm/adapters exec eslint src/outbound/regime-engine/CurrentEvidenceAdapter.ts src/outbound/regime-engine/CurrentEvidenceAdapter.test.ts
  pnpm --filter @clmm/adapters typecheck
  ```

  Expected: the focused Vitest file passes all existing and new cases; ESLint exits 0 for the two modified files; adapter typecheck exits 0. The implementation loop will additionally run its automatic workspace gate `pnpm -r typecheck` after the task; this is not a separate implementation task.

- [ ] **Step 5: Perform the live acceptance check without changing repository files**

  In an existing authorized environment configured for the deployed regime-engine and BFF, open the app's `/evidence` route for SOL/USDC. Confirm the BFF response contains a non-null `evidence` object, does not contain `unavailableReason: "malformed"`, and the Evidence screen renders its family cards from real data. Do not add tokens, response captures, or environment-specific URLs to the repository. If the environment or credentials are unavailable, record this acceptance criterion as pending rather than claiming live verification.

- [ ] **Step 6: Commit the self-contained change**

  ```bash
  git add packages/adapters/src/outbound/regime-engine/CurrentEvidenceAdapter.ts packages/adapters/src/outbound/regime-engine/CurrentEvidenceAdapter.test.ts
  git commit -m "fix(adapters): unwrap current evidence response"
  ```

## Tests to add or update

- Update all successful fetch mocks in `CurrentEvidenceAdapter.test.ts` to use the realistic response envelope.
- Assert valid contextual and deterministic-only nested bundles return `block`.
- Assert multiple items select the first bundle only.
- Assert `items: []` returns `not-found`.
- Assert unsafe envelope shapes and an invalid nested bundle return `malformed` without throwing.
- Preserve the existing status, no-retry, request URL/header, configuration, and sensitive-log regression coverage.

## Validation commands

Task-local verification:

```bash
pnpm --filter @clmm/adapters exec vitest run src/outbound/regime-engine/CurrentEvidenceAdapter.test.ts
pnpm --filter @clmm/adapters exec eslint src/outbound/regime-engine/CurrentEvidenceAdapter.ts src/outbound/regime-engine/CurrentEvidenceAdapter.test.ts
pnpm --filter @clmm/adapters typecheck
```

Automatic implement-loop gate after the implementation task:

```bash
pnpm -r typecheck
```

No full repository build, lint, boundaries, or test run is required for this two-file adapter-local correction unless the implementer discovers a broader contract change.

## Risk areas

- The envelope is deliberately duck-typed. Checking too little can throw on `null`, arrays, or a missing first item; checking too much can reject forward-compatible transport metadata.
- A bare bundle must no longer pass as a valid upstream response, or the original incorrect mock contract remains hidden.
- Selecting only the first item intentionally discards later items. Changing this requires a separate application/UI design because the stable port carries one bundle.
- `200 + items: []` and HTTP 404 converge on `not-found`; malformed non-empty data must remain distinguishable as `malformed`.
- Logs must describe failure categories only and must never include the response body, inner bundle, or internal token.
- Live verification depends on authorized runtime configuration and deployed upstream data; unit success alone must not be reported as live verification.

## Stop conditions

- Stop if the actual upstream contract does not put the consumable bundle at `items[0].bundle`, or if upstream ordering does not define the first item as the current bundle; obtain the authoritative contract instead of inventing selection rules.
- Stop if satisfying the acceptance criteria requires widening `EvidenceReadPort` to return multiple bundles, changing the BFF/client/UI contract, or vendoring a new schema; that is an architectural expansion beyond this design.
- Stop if either canonical valid fixture fails `parseEvidenceBundle()` before adapter changes; investigate contract/schema drift separately.
- Stop before claiming release readiness if the live Evidence route cannot be checked in an authorized configured environment; report the live criterion as pending.
- Stop immediately if any proposed change reaches `DirectionalExitPolicyService` or re-derives the lower/upper breach mapping; this issue has no directional-policy scope.
