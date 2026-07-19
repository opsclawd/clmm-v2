<!-- plan-review-required -->

# Market Insight Response-Body Timeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep each existing market-regime and support/resistance request deadline active until every required response body has been consumed, while preserving all current adapter results, client error messages, timeout durations, and graceful-degradation behavior.

**Architecture:** Keep the existing local `AbortController` pattern at each HTTP boundary instead of introducing a shared abstraction. Each request owns one timer from immediately before `fetch()` through status classification and `json()`/`text()` consumption, clears that timer once in `finally`, and translates a body-read abort through the same public contract already used for a fetch abort. `CurrentSrLevelsAdapter` already has the correct lifetime, so its implementation remains unchanged and receives regression coverage alongside the corrected regime adapter.

**Tech Stack:** TypeScript, Fetch API `AbortController`, Vitest fake timers, pnpm workspaces, ESLint, Prettier.

---

## Goal

Ensure the existing 2-second outbound-adapter deadlines and 10-second app-client deadlines cover both receipt of response headers and completion of the selected response-body reader. The result must be an end-to-end deadline for one request attempt, not a timer that resets after headers.

## Non-goals

- Do not change domain or application contracts, DTOs, BFF endpoints, UI state, TanStack Query behavior, cache policy, or supported-pool configuration.
- Do not add retries, recovery/backoff loops, circuit breakers, streaming support, timeout configuration, or a new HTTP dependency.
- Do not harden neighboring policy-insight, S/R-thesis, execution-event, or unrelated fetch paths.
- Do not replace the four local lifecycles with a universal fetch helper or `AbortSignal.timeout()`.
- Do not change the 2,000 ms adapter timeout or the 10,000 ms app timeout.
- Do not touch directional exit policy or re-derive the repository's lower/upper-bound directional invariant.
- Do not change exported API signatures. The existing `CurrentRegimeAdapter`, `CurrentSrLevelsAdapter`, `fetchCurrentRegime`, and `fetchCurrentSrLevels` surfaces remain intact.

## Affected files

- `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.ts` — extend the existing regime request scope through all JSON reads and propagate body aborts to the fail-soft request catch.
- `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.test.ts` — add focused post-header success/error-envelope body-timeout tests. Although this file exceeds 500 lines, the implementation task below changes only the transport-lifecycle cases in the top-level `CurrentRegimeAdapter` suite; it does not create a broad test-update task.
- `packages/adapters/src/outbound/regime-engine/CurrentSrLevelsAdapter.test.ts` — lock in the already-correct post-header body-timeout behavior without rewriting `CurrentSrLevelsAdapter.ts`.
- `apps/app/src/api/regime.ts` — extend the BFF regime timer through 200 JSON, 404 JSON, and non-success text reads without changing classified errors.
- `apps/app/src/api/regime.test.ts` — add deterministic body-abort and cleanup cases within `fetchCurrentRegime`.
- `apps/app/src/api/srLevels.ts` — extend the BFF S/R timer through 200 JSON, 404 JSON, and non-success text reads without changing classified errors.
- `apps/app/src/api/srLevels.test.ts` — add deterministic body-abort and cleanup cases within `fetchCurrentSrLevels`.

`packages/adapters/src/outbound/regime-engine/CurrentSrLevelsAdapter.ts` is an audited reference, not an expected edit: its inner `try/finally` already encloses both `fetch()` and successful `res.json()` consumption.

## Behavioral invariants

The following invariants are state-transition contracts and must become tests before implementation changes:

1. **One continuous deadline:** when request state is `awaiting-headers`, receipt of headers transitions to `awaiting-body` without clearing or replacing the original timer.
2. **Adapter success-body timeout:** when an adapter is `awaiting-body` for a successful response and its 2-second timer fires, the signal transitions to `aborted`; regime settles as `{ kind: 'upstream-error' }`, S/R settles as `null`, and warning telemetry remains observable.
3. **Adapter error-envelope timeout:** when the regime adapter is `awaiting-body` for a `400` or `404` JSON error envelope and its timer fires, the abort is not converted into a malformed envelope; the request settles through the existing `{ kind: 'upstream-error' }` failure path.
4. **App body timeout classification:** when either app client is `awaiting-body` for success JSON, 404 JSON, or non-success text and its 10-second timer fires, the body reader's `AbortError` transitions to the feature's existing `request timed out` error, never invalid JSON, unexpected 404, endpoint-not-found, or HTTP fallback text.
5. **Non-abort classification stability:** when a body reader rejects for a non-abort reason, the existing branch-specific classification remains unchanged: invalid success JSON, unexpected non-JSON 404, or `HTTP <status>` fallback.
6. **Exactly-once cleanup:** when any request reaches a terminal result through success, early return, classified error, parse failure, network failure, or abort, its timer transitions to cleared exactly once; advancing fake timers afterward must not abort the captured signal.
7. **No public-contract transition:** valid responses, typed unsupported-pool 404s, generic 404s, `unavailableReason`, malformed DTO handling, and fail-soft adapter results remain byte-for-byte/message-for-message compatible.

## Task 1: Enforce adapter response-body deadlines

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

## Task 2: Preserve regime client classifications through body deadlines

**Files:**

- Modify: `apps/app/src/api/regime.ts` (`classifyNotFound` and `fetchCurrentRegime` transport/status/body scope only)
- Modify: `apps/app/src/api/regime.test.ts` (`fetchCurrentRegime` transport cases and timer teardown only)

**Invariants covered:** `regime success JSON abort reports timeout`, `regime 404 JSON abort reports timeout`, `regime non-success text abort reports timeout`, `regime non-abort parse classifications remain stable`, `regime timer clears after terminal settlement`.

- [ ] **Step 1: Add failing post-header regime-client timeout tests first**

Add `vi.useRealTimers()` to the existing `afterEach`. Add this test-local response factory after `restoreBffBaseUrl`; it captures the request signal and returns a body promise rejected only by its `abort` event:

```ts
function stubStalledBody(status: number, method: 'json' | 'text') {
  let signal: AbortSignal | undefined;
  const readBody = () =>
    new Promise<never>((_resolve, reject) => {
      signal!.addEventListener('abort', () => reject({ name: 'AbortError' }), { once: true });
    });

  globalThis.fetch = vi
    .fn()
    .mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal as AbortSignal;
      return Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        statusText: '',
        ...(method === 'json' ? { json: readBody } : { text: readBody }),
      } as Response);
    }) as typeof fetch;

  return { getSignal: () => signal };
}
```

Use it in these exact named cases within `describe('fetchCurrentRegime')`:

```ts
it('throws the timeout error when a 200 JSON body stalls after headers', async () => {
  env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
  vi.useFakeTimers();
  const stalled = stubStalledBody(200, 'json');

  const pending = fetchCurrentRegime(POOL_ID);
  await vi.advanceTimersByTimeAsync(10_000);

  await expect(pending).rejects.toThrow('Could not load market regime: request timed out');
  expect(stalled.getSignal()?.aborted).toBe(true);
});

it('throws the timeout error when a 404 JSON body stalls after headers', async () => {
  env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
  vi.useFakeTimers();
  const stalled = stubStalledBody(404, 'json');

  const pending = fetchCurrentRegime(POOL_ID);
  await vi.advanceTimersByTimeAsync(10_000);

  await expect(pending).rejects.toThrow('Could not load market regime: request timed out');
  expect(stalled.getSignal()?.aborted).toBe(true);
});

it('throws the timeout error when a 503 text body stalls after headers', async () => {
  env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
  vi.useFakeTimers();
  const stalled = stubStalledBody(503, 'text');

  const pending = fetchCurrentRegime(POOL_ID);
  await vi.advanceTimersByTimeAsync(10_000);

  await expect(pending).rejects.toThrow('Could not load market regime: request timed out');
  expect(stalled.getSignal()?.aborted).toBe(true);
});
```

For every case, set `EXPO_PUBLIC_BFF_BASE_URL`, call `vi.useFakeTimers()`, capture `init.signal`, start the request before advancing time, and assert the exact existing message:

```ts
await expect(pending).rejects.toThrow('Could not load market regime: request timed out');
expect(signal?.aborted).toBe(true);
```

- [ ] **Step 2: Run only the new regime body-timeout cases and verify the pre-fix failure**

Run:

```bash
pnpm --filter @clmm/app test -- src/api/regime.test.ts -t 'stalls after headers'
```

Expected: the cases fail or remain pending because the timer is currently cleared once `fetch()` returns; the body promises never receive an abort.

- [ ] **Step 3: Make 404 JSON classification abort-aware**

Change only `classifyNotFound`'s catch so an abort escapes to the request-level timeout classifier while a syntax/read error preserves the existing unexpected-404 message:

```ts
} catch (error: unknown) {
  if (isAbortError(error)) throw error;
  return new Error('Could not load market regime: unexpected 404');
}
```

- [ ] **Step 4: Extend `fetchCurrentRegime`'s single timer through every response-body branch**

Keep controller/timer creation as-is. Replace the fetch-only outer scope with one outer `try/catch/finally` covering status classification, `classifyNotFound`, `response.text()`, success `response.json()`, shape validation, and result mapping. A narrow inner catch around `fetch()` preserves its current network-error wrapping. The request-level catch maps propagated aborts and rethrows every already-classified error unchanged:

```ts
try {
  let response: Response;
  try {
    response = await fetch(
      `${getBffBaseUrl()}/regime/pools/${encodeURIComponent(poolId)}/current`,
      { signal: controller.signal },
    );
  } catch (error: unknown) {
    if (isAbortError(error)) throw error;
    throw new Error(
      `Could not load market regime: ${error instanceof Error ? error.message : 'network error'}`,
    );
  }

  if (response.status === 404) throw await classifyNotFound(poolId, response);

  if (!response.ok) {
    let detail: string;
    try {
      detail = await response.text();
    } catch (error: unknown) {
      if (isAbortError(error)) throw error;
      detail = `HTTP ${response.status}`;
    }
    throw new Error(`Could not load market regime: ${detail || response.statusText}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error: unknown) {
    if (isAbortError(error)) throw error;
    throw new Error('Could not load market regime: response body was not valid JSON');
  }

  if (!isRecord(body)) {
    throw new Error('Could not load market regime: malformed response');
  }

  const regime = body['regime'];
  const unavailableReason = isRegimeUnavailableReason(body['unavailableReason'])
    ? body['unavailableReason']
    : undefined;

  if (regime === null) {
    return { regime: null, unavailableReason };
  }

  if (!isRegimeBlock(regime)) {
    throw new Error('Could not load market regime: malformed regime block');
  }

  return { regime, unavailableReason };
} catch (error: unknown) {
  if (isAbortError(error)) {
    throw new Error('Could not load market regime: request timed out');
  }
  throw error;
} finally {
  clearTimeout(timeoutId);
}
```

There must be no body read after this `finally`, no `.catch(() => fallback)` that can swallow an abort, and no second timer or scattered cleanup call.

- [ ] **Step 5: Lock in non-abort fallback and exactly-once cleanup behavior**

Retain the existing unsupported-pool and malformed-response tests. Add these exact cases to distinguish ordinary stream failure from timeout and prove terminal cleanup:

```ts
it('uses HTTP status fallback when a non-success text body rejects without AbortError', async () => {
  env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 503,
    statusText: 'Service Unavailable',
    text: () => Promise.reject(new Error('stream failed')),
  }) as typeof fetch;

  await expect(fetchCurrentRegime(POOL_ID)).rejects.toThrow(
    'Could not load market regime: HTTP 503',
  );
});

it('clears the regime deadline after the response body settles', async () => {
  env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  const block = fixtureBlock();
  globalThis.fetch = vi
    .fn()
    .mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal as AbortSignal;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ regime: block }),
      } as Response);
    }) as typeof fetch;

  await expect(fetchCurrentRegime(POOL_ID)).resolves.toEqual({ regime: block });
  await vi.advanceTimersByTimeAsync(10_001);

  expect(signal?.aborted).toBe(false);
});
```

- [ ] **Step 6: Run scoped regime-client verification**

Run:

```bash
pnpm --filter @clmm/app test -- src/api/regime.test.ts
pnpm exec eslint apps/app/src/api/regime.ts apps/app/src/api/regime.test.ts
pnpm exec prettier --check apps/app/src/api/regime.ts apps/app/src/api/regime.test.ts
```

Expected: all regime client cases pass, ESLint reports no errors, and Prettier reports both files formatted. The implement loop's automatic `pnpm -r typecheck` gate must also pass before committing.

- [ ] **Step 7: Commit the regime client deadline behavior**

```bash
git add apps/app/src/api/regime.ts apps/app/src/api/regime.test.ts
git commit -m "fix: include regime response bodies in request deadline"
```

## Task 3: Preserve S/R client classifications through body deadlines

**Files:**

- Modify: `apps/app/src/api/srLevels.ts` (`classifyNotFound` and `fetchCurrentSrLevels` transport/status/body scope only)
- Modify: `apps/app/src/api/srLevels.test.ts` (`fetchCurrentSrLevels` transport cases and timer teardown only)

**Invariants covered:** `S/R success JSON abort reports timeout`, `S/R 404 JSON abort reports timeout`, `S/R non-success text abort reports timeout`, `S/R non-abort parse classifications remain stable`, `S/R timer clears after terminal settlement`.

- [ ] **Step 1: Add failing post-header S/R-client timeout tests first**

Add `vi.useRealTimers()` to `afterEach`. Add this test-local helper after `restoreBffBaseUrl` (the duplication is intentional because app API tests do not share a transport-test utility):

```ts
function stubStalledBody(status: number, method: 'json' | 'text') {
  let signal: AbortSignal | undefined;
  const readBody = () =>
    new Promise<never>((_resolve, reject) => {
      signal!.addEventListener('abort', () => reject({ name: 'AbortError' }), { once: true });
    });

  globalThis.fetch = vi
    .fn()
    .mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal as AbortSignal;
      return Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        statusText: '',
        ...(method === 'json' ? { json: readBody } : { text: readBody }),
      } as Response);
    }) as typeof fetch;

  return { getSignal: () => signal };
}
```

Add these exact named cases:

```ts
it('throws the timeout error when a 200 JSON body stalls after headers', async () => {
  env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
  vi.useFakeTimers();
  const stalled = stubStalledBody(200, 'json');

  const pending = fetchCurrentSrLevels('Pool111111111111111111111111111111111111111');
  await vi.advanceTimersByTimeAsync(10_000);

  await expect(pending).rejects.toThrow('Could not load market context: request timed out');
  expect(stalled.getSignal()?.aborted).toBe(true);
});

it('throws the timeout error when a 404 JSON body stalls after headers', async () => {
  env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
  vi.useFakeTimers();
  const stalled = stubStalledBody(404, 'json');

  const pending = fetchCurrentSrLevels('Pool111111111111111111111111111111111111111');
  await vi.advanceTimersByTimeAsync(10_000);

  await expect(pending).rejects.toThrow('Could not load market context: request timed out');
  expect(stalled.getSignal()?.aborted).toBe(true);
});

it('throws the timeout error when a 503 text body stalls after headers', async () => {
  env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
  vi.useFakeTimers();
  const stalled = stubStalledBody(503, 'text');

  const pending = fetchCurrentSrLevels('Pool111111111111111111111111111111111111111');
  await vi.advanceTimersByTimeAsync(10_000);

  await expect(pending).rejects.toThrow('Could not load market context: request timed out');
  expect(stalled.getSignal()?.aborted).toBe(true);
});
```

Each case must enable fake timers, set the BFF base URL, start `fetchCurrentSrLevels`, advance 10,000 ms, assert `signal.aborted === true`, and assert exactly:

```ts
await expect(pending).rejects.toThrow('Could not load market context: request timed out');
```

- [ ] **Step 2: Run only the new S/R body-timeout cases and verify the pre-fix failure**

Run:

```bash
pnpm --filter @clmm/app test -- src/api/srLevels.test.ts -t 'stalls after headers'
```

Expected: the cases fail or remain pending because the current fetch-only `finally` clears the 10-second timer before `json()` or `text()` begins.

- [ ] **Step 3: Make S/R 404 JSON classification abort-aware**

Change only `classifyNotFound`'s catch to preserve aborts while retaining the existing non-JSON 404 result:

```ts
} catch (error: unknown) {
  if (isAbortError(error)) throw error;
  return new Error('Could not load market context: unexpected 404');
}
```

- [ ] **Step 4: Extend `fetchCurrentSrLevels`'s single timer through every response-body branch**

Apply the same scoped lifecycle as Task 2, with S/R-specific strings and the existing S/R result mapping. Use an inner fetch catch for current network wording, abort-aware catches around `response.text()` and `response.json()`, one request-level abort mapper, and one outer cleanup:

```ts
try {
  let response: Response;
  try {
    response = await fetch(
      `${getBffBaseUrl()}/sr-levels/pools/${encodeURIComponent(poolId)}/current`,
      { signal: controller.signal },
    );
  } catch (error: unknown) {
    if (isAbortError(error)) throw error;
    throw new Error(
      `Could not load market context: ${error instanceof Error ? error.message : 'network error'}`,
    );
  }

  if (response.status === 404) throw await classifyNotFound(poolId, response);

  if (!response.ok) {
    let detail: string;
    try {
      detail = await response.text();
    } catch (error: unknown) {
      if (isAbortError(error)) throw error;
      detail = `HTTP ${response.status}`;
    }
    throw new Error(`Could not load market context: ${detail || response.statusText}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error: unknown) {
    if (isAbortError(error)) throw error;
    throw new Error('Could not load market context: response body was not valid JSON');
  }

  if (!isRecord(body)) {
    throw new Error('Could not load market context: malformed response');
  }

  const srLevels = body['srLevels'];
  if (srLevels === null) {
    return { srLevels: null };
  }

  if (!isSrLevelsBlock(srLevels)) {
    throw new Error('Could not load market context: malformed srLevels block');
  }

  return { srLevels };
} catch (error: unknown) {
  if (isAbortError(error)) {
    throw new Error('Could not load market context: request timed out');
  }
  throw error;
} finally {
  clearTimeout(timeoutId);
}
```

Do not change `SrLevelsUnsupportedPoolError`, exported types/functions, field validation, or error text.

- [ ] **Step 5: Lock in non-abort fallback and exactly-once cleanup behavior**

Preserve the existing non-JSON 404 test and add these exact cases:

```ts
it('uses HTTP status fallback when a non-success text body rejects without AbortError', async () => {
  env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 503,
    statusText: 'Service Unavailable',
    text: () => Promise.reject(new Error('stream failed')),
  }) as typeof fetch;

  await expect(fetchCurrentSrLevels('Pool111111111111111111111111111111111111111')).rejects.toThrow(
    'Could not load market context: HTTP 503',
  );
});

it('clears the S/R deadline after the response body settles', async () => {
  env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  const block = fixtureBlock();
  globalThis.fetch = vi
    .fn()
    .mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal as AbortSignal;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ srLevels: block }),
      } as Response);
    }) as typeof fetch;

  await expect(
    fetchCurrentSrLevels('Pool111111111111111111111111111111111111111'),
  ).resolves.toEqual({ srLevels: block });
  await vi.advanceTimersByTimeAsync(10_001);

  expect(signal?.aborted).toBe(false);
});
```

- [ ] **Step 6: Run scoped S/R-client verification**

Run:

```bash
pnpm --filter @clmm/app test -- src/api/srLevels.test.ts
pnpm exec eslint apps/app/src/api/srLevels.ts apps/app/src/api/srLevels.test.ts
pnpm exec prettier --check apps/app/src/api/srLevels.ts apps/app/src/api/srLevels.test.ts
```

Expected: all S/R client cases pass, ESLint reports no errors, and Prettier reports both files formatted. The implement loop's automatic `pnpm -r typecheck` gate must also pass before committing.

- [ ] **Step 7: Commit the S/R client deadline behavior**

```bash
git add apps/app/src/api/srLevels.ts apps/app/src/api/srLevels.test.ts
git commit -m "fix: include S/R response bodies in request deadline"
```

## Tests to add or update

- Adapter success-body timeout after headers: regime returns `{ kind: 'upstream-error' }`; S/R returns `null`.
- Regime adapter error-envelope timeout after headers: abort propagates to the existing upstream-error path.
- Regime client 200 JSON, 404 JSON, and 503 text body timeouts: all use the exact market-regime timeout message.
- S/R client 200 JSON, 404 JSON, and 503 text body timeouts: all use the exact market-context timeout message.
- Non-abort 503 text-read rejection in each client: preserve the `HTTP 503` fallback.
- Successful adapter/client body settlement: later fake-timer advancement does not abort the captured signal.
- Existing happy paths, typed unsupported-pool errors, ordinary/non-JSON 404s, malformed payloads, unavailable regime reasons, network failures, and immediate aborts remain green.

## Validation commands

The commands embedded in each task are the acceptance criteria for that commit and target only files changed by that task. After all three implementation tasks complete, the repository's dedicated validate phase must run the issue-required workspace gates; this is not a standalone implementation task and must not produce unrelated fixes:

```bash
pnpm -r typecheck
pnpm typecheck
pnpm test
```

Expected: every command exits 0. If the validate phase requires the repository-wide release checklist because the actual diff expands beyond the seven affected files, also run `pnpm build`, `pnpm lint`, and `pnpm boundaries`; expansion itself must first satisfy the stop conditions below.

## Risk areas

- **Abort misclassification:** a body-reader catch can accidentally turn `AbortError` into invalid JSON, unexpected 404, endpoint-not-found, or `HTTP <status>`. Assert public messages/results, not merely that `abort()` ran.
- **Swallowed text abort:** replacing `.catch(() => fallback)` incorrectly can preserve the timeout but still emit `HTTP 503`; use an abort-aware catch.
- **Timer leaks or duplicate cleanup:** early returns and typed errors must still cross exactly one `finally`. Do not retain the old fetch-only cleanup or add branch-local cleanup.
- **Fake-timer deadlock:** a test promise that ignores the request signal will never settle. Every hanging body double must attach a one-shot `abort` listener, and every modified suite must restore real timers in teardown.
- **Contract drift during restructuring:** moving branches into a `try` can inadvertently wrap already-classified errors or change logs/messages. Keep nested fetch classification narrow and rethrow non-abort classified errors unchanged.
- **Runtime cancellation variance:** the plan relies on standard Fetch signal propagation to response-body reads. If a supported runtime demonstrably ignores abort during body consumption, stop rather than silently adding a second deadline mechanism.
- **Oversized regime adapter test file:** restrict edits to the named transport/status cases. Do not reorganize unrelated metadata/freshness tests as part of this issue.

## Stop conditions

Abort implementation and report the evidence instead of continuing if any of the following occurs:

- A body read in a supported production runtime does not reject when the request `AbortSignal` aborts; that requires a separate compatibility design such as an explicitly raced deadline.
- Preserving body deadlines appears to require changing an exported port/interface, DTO, error class surface, BFF endpoint, UI contract, or package boundary.
- The fix would alter the 2-second/10-second budgets, introduce retry/recovery behavior, or extend into neighboring market-insight clients.
- Existing typed unsupported-pool, graceful-degradation, `unavailableReason`, or exact user-facing error contracts cannot be preserved with the scoped lifecycle.
- Any proposed change touches directional exit mapping or attempts to infer it outside `packages/domain/src/exit-policy/DirectionalExitPolicyService`.
- Focused tests expose unrelated pre-existing failures that cannot be isolated without editing files outside this plan. Record them; do not fold unrelated fixes into these commits.
- The automatic workspace `pnpm -r typecheck` gate fails after a task and the failure cannot be resolved within that task's declared files.

## Assumptions

- `issue-comments.md` is intentionally empty, so it contributes no additional constraints.
- The timeout is a total per-attempt budget beginning immediately before `fetch()` and ending after the required body value has materialized; it does not reset after headers.
- Native Fetch implementations used by Node, Expo/React Native, and supported browsers connect the supplied signal to body consumption.
- Structural `{ name: 'AbortError' }` detection is the compatibility requirement; `instanceof DOMException` is not reliable across all targets and test doubles.
- No exported API signature changes are needed, so `task-manifest.json` intentionally omits `signature_changes` for every task.
