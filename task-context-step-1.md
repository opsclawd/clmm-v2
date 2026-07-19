# Task Context: Task 1

Title: Enforce adapter response-body deadlines

## Workspace & Scope Constraints

## WORKSPACE CONSTRAINTS

Your working directory is a dedicated git worktree with the repository's complete history. Run all commands from it. Do NOT cd to or read paths outside this directory — external-directory access is automatically rejected. git log, git diff, etc. work here directly.

.ai-orchestrator.local.json, if one exists, lives only in the main checkout and is intentionally not copied into your worktree — it is operator-machine-specific and not part of your task. Do not search for it or read it outside this directory. Reason about configuration using only .ai-orchestrator.json in your own working directory; treat it as the effective config for your task.

Working Directory: /home/gary/.openclaw/workspace/clmm-superpowers-v2/.ai-worktrees/issue-76
Repository: opsclawd/clmm-v2
Branch: ai/issue-76
Start Commit: 01846b23aac66642ce52d003d000be4a621b777a

## Task Requirements

**Files:**

- Modify: `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.ts` (`isRecord` helper area, `CurrentRegimeAdapter.fetchCurrent`, and `readErrorEnvelope` only)
- Modify: `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.test.ts` (top-level transport/status cases only)
- Modify: `packages/adapters/src/outbound/regime-engine/CurrentSrLevelsAdapter.test.ts` (timeout case and timer teardown only)

**Invariants covered:** `adapter success body aborts to the existing fail-soft result`, `regime error-envelope body abort is not swallowed`, `adapter timers clear after body settlement`.

- [ ] **Step 1: Add the failing regime adapter success-body timeout test**

In `CurrentRegimeAdapter.test.ts`, make timer restoration unconditional by adding `vi.useRealTimers()` to the existing `afterEach`. Add this named case near the existing network/JSON transport tests:

```ts
it('returns kind:"upstream-error" when a 200 body stalls until the 2s deadline', async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  vi.mocked(fetch).mockImplementation((_input, init) => {
    signal = init?.signal as AbortSignal;
    return Promise.resolve({
      status: 200,
      json: () =>
        new Promise((_, reject) => {
          signal!.addEventListener('abort', () => reject({ name: 'AbortError' }), { once: true });
        }),
    } as Response);
  });
  const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);

  const pending = adapter.fetchCurrent(PARAMS);
  await vi.advanceTimersByTimeAsync(2_000);

  await expect(pending).resolves.toEqual({ kind: 'upstream-error' });
  expect(signal?.aborted).toBe(true);
  expect(obs.logs.some((entry) => entry.level === 'warn')).toBe(true);
});
```

- [ ] **Step 2: Add the failing regime error-envelope timeout test**

Add a separate named case beside the existing `404` envelope tests. It must use a `404` response double whose `json()` rejects with `{ name: 'AbortError' }` only after the supplied signal aborts:

```ts
it('returns kind:"upstream-error" when a 404 error body stalls until the 2s deadline', async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  vi.mocked(fetch).mockImplementation((_input, init) => {
    signal = init?.signal as AbortSignal;
    return Promise.resolve({
      status: 404,
      json: () =>
        new Promise((_, reject) => {
          signal!.addEventListener('abort', () => reject({ name: 'AbortError' }), { once: true });
        }),
    } as Response);
  });
  const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);

  const pending = adapter.fetchCurrent(PARAMS);
  await vi.advanceTimersByTimeAsync(2_000);

  await expect(pending).resolves.toEqual({ kind: 'upstream-error' });
  expect(signal?.aborted).toBe(true);
});
```

- [ ] **Step 3: Run the two new regime adapter tests and verify the pre-fix failure**

Run:

```bash
pnpm --filter @clmm/adapters test -- src/outbound/regime-engine/CurrentRegimeAdapter.test.ts -t 'body stalls until the 2s deadline'
```

Expected: both tests fail or remain pending before implementation because `fetchCurrent` clears its timeout immediately after headers; the captured signal never transitions to `aborted` during body consumption.

- [ ] **Step 4: Keep `CurrentRegimeAdapter`'s timer alive through status handling and JSON reads**

Add this structural helper beside `isRecord` so React Native/test-double aborts are recognized without relying on `DOMException` identity:

```ts
function isAbortError(error: unknown): boolean {
  return isRecord(error) && error['name'] === 'AbortError';
}
```

Refactor only the transport/status portion of `fetchCurrent` so one outer `try/finally` owns the timer. Keep URL construction before controller creation. Inside the protected `try`, await `fetch`, classify `200`/`404`/`400`/other statuses, and await every `response.json()` before leaving the scope. Keep the current logs and return unions. The success-body parse catch must rethrow aborts and preserve ordinary invalid-JSON behavior:

```ts
try {
  const response = await fetch(url.toString(), { signal: controller.signal });

  if (response.status === 200) {
    let body: unknown;
    try {
      body = await response.json();
    } catch (error: unknown) {
      if (isAbortError(error)) throw error;
      this.observability.log('warn', 'Regime response was not valid JSON');
      return { kind: 'upstream-error' };
    }
    const block = parseUpstream(body);
    if (!block) {
      this.observability.log('warn', 'Regime response failed shape validation');
      return { kind: 'upstream-error' };
    }
    return { kind: 'block', block };
  }

  if (response.status === 404) {
    const envelope = await this.readErrorEnvelope(response);
    if (envelope?.code === 'CANDLES_NOT_FOUND') {
      return { kind: 'not-found' };
    }
    this.observability.log('warn', 'Regime upstream 404 with unexpected code', { envelope });
    return { kind: 'upstream-error' };
  }

  if (response.status === 400) {
    const envelope = await this.readErrorEnvelope(response);
    if (envelope?.code === 'VALIDATION_ERROR') {
      this.observability.log('warn', 'Regime upstream rejected request as VALIDATION_ERROR', {
        envelope,
      });
      return { kind: 'config-error' };
    }
    this.observability.log('warn', 'Regime upstream 400 with unexpected code', { envelope });
    return { kind: 'upstream-error' };
  }

  this.observability.log('warn', 'Regime upstream non-2xx', { status: response.status });
  return { kind: 'upstream-error' };
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  this.observability.log('warn', 'Regime fetch network error', { message });
  return { kind: 'upstream-error' };
} finally {
  clearTimeout(timeout);
}
```

Update `readErrorEnvelope` to preserve `null` for ordinary malformed JSON but rethrow an abort to the request-level catch:

```ts
} catch (error: unknown) {
  if (isAbortError(error)) throw error;
  return null;
}
```

Remove the old `let response`, fetch-only `try/catch/finally`, and all status/body work that sat after its `finally`. Do not add additional `clearTimeout` calls.

- [ ] **Step 5: Run the focused regime adapter file and verify all existing classifications still pass**

Run:

```bash
pnpm --filter @clmm/adapters test -- src/outbound/regime-engine/CurrentRegimeAdapter.test.ts
```

Expected: PASS, including the named 200 and 404 body-stall tests and all pre-existing block/config/not-found/upstream-error cases.

- [ ] **Step 6: Add the S/R adapter regression test without changing its implementation**

In `CurrentSrLevelsAdapter.test.ts`, add `vi.useRealTimers()` to `afterEach` and add this named case beside `returns null on 2s timeout (AbortError)`:

```ts
it('returns null when a 200 body stalls until the 2s deadline', async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  vi.mocked(fetch).mockImplementation((_input, init) => {
    signal = init?.signal as AbortSignal;
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        new Promise((_, reject) => {
          signal!.addEventListener('abort', () => reject({ name: 'AbortError' }), { once: true });
        }),
    } as Response);
  });
  const adapter = new CurrentSrLevelsAdapter('https://regime.example.com', obs.port);

  const pending = adapter.fetchCurrent('SOL/USDC', 'mco');
  await vi.advanceTimersByTimeAsync(2_000);

  await expect(pending).resolves.toBeNull();
  expect(signal?.aborted).toBe(true);
  expect(obs.logs.some((entry) => entry.message === 'SR levels fetch error')).toBe(true);
});
```

This should pass against the current `CurrentSrLevelsAdapter.ts`, proving its existing inner `try/finally` already covers body consumption. Do not create a cosmetic source diff.

- [ ] **Step 7: Add an adapter timer-cleanup regression and run scoped checks**

Add this focused case; it proves early success cannot leave a live timer:

```ts
it('clears the adapter deadline after the response body settles', async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  vi.mocked(fetch).mockImplementation((_input, init) => {
    signal = init?.signal as AbortSignal;
    return Promise.resolve(new Response(JSON.stringify(SAMPLE_UPSTREAM), { status: 200 }));
  });
  const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);

  await expect(adapter.fetchCurrent(PARAMS)).resolves.toMatchObject({ kind: 'block' });
  await vi.advanceTimersByTimeAsync(2_001);

  expect(signal?.aborted).toBe(false);
});
```

Run:

```bash
pnpm --filter @clmm/adapters test -- src/outbound/regime-engine/CurrentRegimeAdapter.test.ts src/outbound/regime-engine/CurrentSrLevelsAdapter.test.ts
pnpm exec eslint packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.ts packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.test.ts packages/adapters/src/outbound/regime-engine/CurrentSrLevelsAdapter.test.ts
pnpm exec prettier --check packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.ts packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.test.ts packages/adapters/src/outbound/regime-engine/CurrentSrLevelsAdapter.test.ts
```

Expected: all focused tests pass, ESLint reports no errors, and Prettier reports all three files formatted. The implement loop's automatic `pnpm -r typecheck` gate must also pass before committing.

- [ ] **Step 8: Commit the adapter behavior and regression coverage**

```bash
git add packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.ts packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.test.ts packages/adapters/src/outbound/regime-engine/CurrentSrLevelsAdapter.test.ts
git commit -m "fix: keep insight adapter deadlines through body reads"
```

## Repository Targets

### Expected Files

- packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.ts
- packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.test.ts
- packages/adapters/src/outbound/regime-engine/CurrentSrLevelsAdapter.test.ts

## Validation Commands

```bash
pnpm --filter @clmm/adapters test -- src/outbound/regime-engine/CurrentRegimeAdapter.test.ts src/outbound/regime-engine/CurrentSrLevelsAdapter.test.ts
pnpm exec eslint packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.ts packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.test.ts packages/adapters/src/outbound/regime-engine/CurrentSrLevelsAdapter.test.ts
pnpm exec prettier --check packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.ts packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.test.ts packages/adapters/src/outbound/regime-engine/CurrentSrLevelsAdapter.test.ts
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **regime success-body deadline**: When the regime adapter has received 200 headers but its JSON body remains pending, the original 2-second signal aborts and the adapter settles as upstream-error with warning telemetry. (Test: `returns kind:"upstream-error" when a 200 body stalls until the 2s deadline`)
- **regime error-envelope deadline**: When the regime adapter has received 404 headers but its error-envelope JSON remains pending, the original 2-second signal aborts and the abort is not swallowed as an unparseable envelope. (Test: `returns kind:"upstream-error" when a 404 error body stalls until the 2s deadline`)
- **S/R adapter success-body deadline**: When the S/R adapter has received 200 headers but its JSON body remains pending, its existing 2-second deadline aborts the body read and the fail-soft result remains null with warning telemetry. (Test: `returns null when a 200 body stalls until the 2s deadline`)
- **adapter deadline cleanup**: When a valid regime body settles before the deadline, terminal cleanup clears the timer so later fake-time advancement cannot abort the captured signal. (Test: `clears the adapter deadline after the response body settles`)
