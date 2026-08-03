# Task Context: Task 1

Title: Unwrap and validate the first evidence response item
## Workspace & Scope Constraints

## WORKSPACE CONSTRAINTS

Your working directory is a dedicated git worktree with the repository's complete history. Run all commands from it. Do NOT cd to or read paths outside this directory — external-directory access is automatically rejected. git log, git diff, etc. work here directly.

.ai-orchestrator.local.json, if one exists, lives only in the main checkout and is intentionally not copied into your worktree — it is operator-machine-specific and not part of your task. Do not search for it or read it outside this directory. Reason about configuration using only .ai-orchestrator.json in your own working directory; treat it as the effective config for your task.

Working Directory: /home/gary/.openclaw/workspace/clmm-superpowers-v2/.ai-worktrees/issue-139
Repository: opsclawd/clmm-v2
Branch: ai/issue-139
Start Commit: ce0a92312cc290da5b4c610b8cd5cf72704106c8

## Task Requirements

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

## Repository Targets

### Expected Files
- packages/adapters/src/outbound/regime-engine/CurrentEvidenceAdapter.test.ts
- packages/adapters/src/outbound/regime-engine/CurrentEvidenceAdapter.ts

### Reference Files
- packages/application/src/dto/evidenceBundleValidator.ts
- packages/application/src/ports/index.ts
- packages/adapters/src/inbound/http/EvidenceController.ts
- apps/app/src/api/evidence.ts
- packages/ui/src/view-models/EvidenceViewModel.ts
- schemas/regime-engine/evidence-bundle.v1/schema.json
- schemas/regime-engine/evidence-bundle.v1/fixtures/valid/contextual.json
- schemas/regime-engine/evidence-bundle.v1/fixtures/valid/deterministic-only.json

## Validation Commands

```bash
pnpm --filter @clmm/adapters exec vitest run src/outbound/regime-engine/CurrentEvidenceAdapter.test.ts
["pnpm","--filter","@clmm/adapters","exec","eslint","src/outbound/regime-engine/CurrentEvidenceAdapter.ts","src/outbound/regime-engine/CurrentEvidenceAdapter.test.ts"]
pnpm --filter @clmm/adapters typecheck
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **valid envelope selects first bundle**: A 200 response with a non-empty items array returns block for the schema-valid bundle at items[0].bundle and ignores later items. (Test: `returns the first validated bundle from a realistic 200 response envelope`)
- **valid deterministic-only envelope succeeds**: A schema-valid deterministic-only bundle at items[0].bundle returns block without requiring contextual evidence. (Test: `returns a deterministic-only bundle from a realistic 200 response envelope`)
- **empty envelope is absence**: A 200 response with items: [] returns not-found rather than malformed. (Test: `maps an empty 200 items array to not-found`)
- **malformed transport or inner bundle is rejected**: An unsafe envelope shape, unsafe first item, missing bundle, or schema-invalid nested bundle returns malformed without throwing. (Test: `maps malformed 200 response envelopes or invalid nested bundles to malformed`)
- **existing non-success behavior is stable**: 404, 503, other non-2xx, invalid JSON, timeout, and network results retain their existing discriminated-union mappings without retries. (Test: `maps evidence status responses without retry`)
- **sensitive values stay out of logs**: Degraded response handling does not log bundle contents, response secrets, or the internal token. (Test: `does not log evidence bundle contents or internal tokens when logging degraded outcomes`)

