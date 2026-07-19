# Market Insight Response-Body Timeout Design

## Summary

The regime and support/resistance (S/R) read paths intend to place a hard upper bound on each HTTP request, but three of the four identified paths clear their `AbortController` timer as soon as `fetch()` resolves. A successful header response can therefore be followed by an indefinitely slow `response.json()` or `response.text()` read. That leaves app queries loading beyond their documented 10-second limit and can keep BFF work open beyond the adapters' 2-second limit.

This design extends each existing timeout lifecycle through every response-body read while preserving each path's current result contract, error messages, logging, timeout values, and graceful-degradation behavior. It uses the repository's already-correct `CurrentSrLevelsAdapter` structure as the local pattern: create the controller and timer immediately before the request, perform the fetch and any required body read inside the protected scope, and clear the timer exactly once in an outer `finally`.

No market-context DTO, BFF endpoint, query policy, UI state, or directional exit behavior changes.

## Problem and Why It Matters

The Fetch API resolves `fetch()` after the response status and headers are available; consuming the body is a separate asynchronous operation. In the current regime adapter and the two app clients, the timeout is cleared in a `finally` around only the initial `fetch()` call. The following operations are therefore unbounded:

- a successful `200` response followed by `response.json()`;
- a `404` response whose JSON body is read to distinguish an unsupported pool from a missing endpoint or upstream absence;
- a non-success response whose `response.text()` body is included in the controlled client error.

The practical likelihood is low because these payloads are small, but the failure mode defeats the purpose of the timeout. A peer can return headers and then stall the stream, leaving a mobile query in a loading state and consuming BFF resources until some unrelated infrastructure limit intervenes. Correct timeout semantics are also operationally important: a configured 2-second or 10-second request budget should cover receipt of the response needed by the caller, not merely receipt of headers.

## Current Code Analysis

### Adapter boundary

- `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.ts` starts a 2-second timer, awaits `fetch()`, and clears the timer before reading either the `200` JSON payload or the `400`/`404` JSON error envelope. A body stall is therefore unbounded.
- `packages/adapters/src/outbound/regime-engine/CurrentSrLevelsAdapter.ts` already has the desired lifecycle. Its inner `try/finally` contains both `fetch()` and the successful `res.json()` read, so the timer remains active until the body has been consumed or an exit path is selected. Git history shows this was deliberate: commit `c337a21` moved cleanup after `res.json()`, and `24903d7` consolidated cleanup into `finally` to cover all exits without leaking timers.
- Both adapters are intentionally fail-soft. Regime failures become `{ kind: 'upstream-error' }`; S/R failures are logged and become `null`. Neither contract should expose transport exceptions.

### App-shell boundary

- `apps/app/src/api/regime.ts` and `apps/app/src/api/srLevels.ts` each use a 10-second timer but clear it immediately after `fetch()` settles. Their success JSON, 404 JSON, and non-success text reads are outside the timeout.
- The clients intentionally distinguish unsupported-pool `404`s from generic endpoint `404`s and other transient failures. Regime also preserves `unavailableReason` values returned in valid `200` responses.
- Each client currently maps an `AbortError` from the initial fetch to stable user-facing timeout text. Extending the protected scope must also map an `AbortError` raised during body consumption to that same timeout text. Body parsing helpers must not swallow an abort and accidentally reclassify it as malformed JSON, an unexpected 404, or a generic HTTP error.

### Related repository patterns

- `apps/app/src/api/srTheses.ts`, `apps/app/src/api/policyInsights.ts`, `packages/adapters/src/outbound/regime-engine/CurrentSrThesesAdapter.ts`, and `CurrentPolicyInsightsAdapter.ts` contain variants of body-aware cleanup, but they are not fully uniform in abort classification or cleanup placement.
- The durable S/R adapter learning explicitly says to defer timeout cleanup until after `res.json()` for UI-facing fail-soft reads.
- Architecture places external HTTP mechanics in adapters and app-shell API clients. There is no reason to introduce domain or application-layer types for this transport concern.

## Design Decisions and Trade-offs

### Decision 1: use a scoped lifecycle pattern, not a new shared package abstraction

Each affected operation will keep the existing `AbortController` and `setTimeout` mechanism, but the protected `try` will include status classification and every body read. A single outer `finally` will clear the timer on success, early return, parsing failure, network rejection, or abort.

Conceptually, each path becomes:

```ts
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

try {
  const response = await fetch(url, { signal: controller.signal });
  // Classify status and consume json()/text() while the timer is active.
  return mapResponse(await readRequiredBody(response));
} catch (error: unknown) {
  // Preserve this caller's existing timeout/failure contract.
} finally {
  clearTimeout(timeoutId);
}
```

This is the recommended approach because the four paths do not share one response contract: the adapters return different fail-soft values, while the app clients throw feature-specific errors and inspect multiple body formats. A generic fetch-and-parse helper would either encode feature-specific status policy or require callbacks complicated enough to obscure the lifecycle it is meant to make safe. The established S/R adapter pattern is small, explicit, and already documented in this repository.

Alternative considered: add one helper in `packages/adapters` and another in `apps/app` that owns the controller, timer, fetch, and parser callback. This reduces repeated setup, but it creates two nominally shared abstractions for only two callers each and still requires callers to own all response classification. It also increases the chance that a future callback catches and reclassifies aborts internally. This issue does not justify that abstraction.

Alternative considered: replace the manual timer with `AbortSignal.timeout()`. This is concise in runtimes that support it, but the app is an Expo/React Native and web application where runtime support needs separate compatibility validation. It also does not by itself solve body-error classification. Keeping the existing mechanism is lower risk and preserves compatibility.

### Decision 2: timeout covers network/body I/O, not synchronous validation

The timer remains active through `fetch()`, `response.json()`, and `response.text()`. Once the required body value has been fully materialized, the timer may be cleared before synchronous shape validation and DTO mapping.

The simplest implementation can leave the outer `finally` around the entire async function body, which also covers the brief synchronous validation work. That difference is negligible for tiny payloads and guarantees exactly-once cleanup. The semantic requirement is that no asynchronous body read occurs after cleanup.

### Decision 3: preserve feature-level failure classification

Adapter behavior remains unchanged at its public boundary:

| Path and failure                       | Existing and proposed result                        |
| -------------------------------------- | --------------------------------------------------- |
| Regime fetch or body timeout/rejection | `{ kind: 'upstream-error' }` with warning telemetry |
| S/R fetch or body timeout/rejection    | `null` with warning telemetry                       |
| Regime recognized upstream `404`       | `{ kind: 'not-found' }`                             |
| Regime recognized upstream `400`       | `{ kind: 'config-error' }`                          |
| S/R upstream `404`                     | `null`                                              |

App client behavior also remains stable:

| BFF response/failure                  | Existing and proposed behavior                                                |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| Abort during fetch or any body read   | Throw the feature's existing `request timed out` error                        |
| `404` body says pool is not supported | Throw the existing typed unsupported-pool error                               |
| Other parseable `404`                 | Throw the existing endpoint-not-found error                                   |
| Unparseable non-abort `404` body      | Throw the existing unexpected-404 error                                       |
| Non-success response                  | Preserve the existing feature-prefixed generic error and body/status fallback |
| Invalid `200` JSON                    | Preserve the existing invalid-JSON error                                      |
| Valid JSON with invalid DTO shape     | Preserve the existing malformed-response error                                |

To achieve this, local body-read catches must distinguish abort from ordinary parse/read failure. An `AbortError` is rethrown to the request-level catch and translated into the existing timeout message. Only non-abort JSON failures become invalid-JSON or unexpected-404 errors; only non-abort text failures use the existing HTTP-status fallback.

The existing structural `isAbortError` check remains preferable to `instanceof DOMException` because React Native and test doubles may provide DOMException-like objects without the same global constructor identity.

### Decision 4: treat the existing S/R adapter as audited behavior and add regression coverage

`CurrentSrLevelsAdapter` already satisfies the core lifecycle requirement, so it does not need a behavioral rewrite merely to create a diff. Its focused test suite should gain a post-headers body-read regression case, and the implementation may receive only a naming/comment cleanup if useful. The test is the consistency change: it makes the previously implicit protection an enforced contract alongside the newly corrected paths.

This avoids destabilizing the oldest and already-correct implementation while still applying the issue's requirement to both regime and S/R paths.

## Proposed Approach

### `CurrentRegimeAdapter`

Move status handling and all calls to `response.json()` into the same timeout-owned `try/finally` as `fetch()`. Preserve URL validation before controller creation so configuration failures do not allocate a timer. Preserve the existing result union and observability messages.

The private error-envelope reader may continue returning `null` for ordinary malformed JSON, but it must not prevent the request scope from observing an abort. Either rethrow `AbortError` from that helper or avoid catching body-read errors there and perform the existing envelope fallback at the caller. The preferred narrow change is to make the helper rethrow aborts and preserve `null` for all other parse failures.

### `CurrentSrLevelsAdapter`

Retain its current inner `try/finally`, which already covers the successful body read and clears the timer exactly once. Add a regression test that returns headers immediately and makes `json()` reject with an abort only after the supplied signal is aborted. The result remains `null` and a warning remains observable.

### App regime and S/R clients

For each exported fetch function:

1. Create the controller and timer as today.
2. Run the fetch, status branches, and required JSON/text reads inside one outer protected scope.
3. At the request-level catch, translate any propagated `AbortError` to the existing feature-specific timeout error and rethrow all already-classified feature errors unchanged.
4. In `classifyNotFound`, propagate abort errors while retaining current mappings for non-abort JSON failure and message inspection.
5. For non-success `response.text()`, propagate an abort but retain the current `HTTP <status>` fallback for other read failures.
6. In the success JSON branch, propagate an abort but retain the current invalid-JSON error for syntax or other non-abort read failures.
7. Clear the timer once in the outer `finally`.

This keeps the public functions and their return types unchanged. No callers, TanStack Query options, or UI components need modification.

## Data and Control Flow

```text
caller
  -> create AbortController + deadline timer
  -> fetch(url, signal)
  -> receive status/headers
  -> choose body reader from status
       200      -> json()
       404      -> json() for unsupported classification
       other !ok -> text() for controlled error detail
  -> body settles
       success  -> existing validation/result mapping
       abort    -> existing timeout classification
       other error -> existing parse/read classification
  -> finally clears timer exactly once
  -> caller receives the same feature-level result/error shape as before
```

The timeout budget is end-to-end for a single attempt. It does not reset after headers arrive, and it does not grant a fresh timeout for each body-read branch.

## Testing Strategy

Tests should use Vitest fake timers so the 2-second adapter and 10-second client budgets can be advanced deterministically without wall-clock delays. A response double should resolve from `fetch()` immediately, retain the request's `AbortSignal`, and expose a `json()` or `text()` promise that rejects with `{ name: 'AbortError' }` when that signal aborts. This proves the important sequence: headers arrived, body consumption began, the original timer remained live, and the public operation settled according to its contract.

Focused coverage:

- `CurrentRegimeAdapter.test.ts`: a `200` response whose `json()` hangs until abort returns `{ kind: 'upstream-error' }`; optionally cover a `404` error-envelope body to prove helper propagation.
- `CurrentSrLevelsAdapter.test.ts`: a `200` response whose `json()` hangs until abort returns `null`, locking in the already-correct implementation.
- `apps/app/src/api/regime.test.ts`: a post-headers `200` JSON abort throws the existing market-regime timeout error.
- `apps/app/src/api/srLevels.test.ts`: a post-headers body abort throws the existing market-context timeout error. A representative `404` JSON or non-success text abort should also be covered because those branches have separate catches that could swallow aborts.
- Existing happy path, unsupported `404`, generic `404`, non-success, invalid JSON, malformed DTO, network error, and immediate-fetch abort tests remain unchanged and must continue to pass.
- Add a timer-cleanup assertion where practical: after a successful or rejected body read, no pending timeout should later abort the captured signal. This guards against moving cleanup later without guaranteeing cleanup.

At implementation completion, run the narrow adapter and app API test files during development, then the issue's required `pnpm typecheck` and `pnpm test`. Because the change spans the app shell and adapters but does not alter package contracts, full `pnpm build`, `pnpm lint`, and `pnpm boundaries` are prudent final verification if the implementation touches a shared utility or exports; they are optional for a strictly local control-flow change unless repository policy for that implementation session requires the full suite.

## Assumptions

- The issue's timeout is a total per-request budget beginning immediately before `fetch()` and ending only after the required response body has been consumed; it is not a separate connection timeout plus body timeout.
- Existing timeout durations remain 2 seconds for outbound regime-engine adapter reads and 10 seconds for app-to-BFF reads.
- The native fetch implementations used by Node, Expo/React Native, and supported browsers connect the request `AbortSignal` to response-body consumption, as required by Fetch semantics.
- Test doubles may model body cancellation by rejecting their body promise when the captured signal emits `abort`; production code does not need a separate `Promise.race` deadline solely to compensate for mocks that ignore the signal.
- A body-read `AbortError` in an app client is semantically the same timeout class as an initial-fetch `AbortError` and should use the same existing message.
- Non-abort body rejections retain their existing invalid-JSON, unexpected-404, or HTTP fallback classifications rather than being relabeled as timeouts.
- `CurrentSrLevelsAdapter`'s present inner `try/finally` is correct and should be preserved rather than rewritten for cosmetic consistency.
- `issue-comments.md` is empty, so there are no additional maintainer constraints beyond `issue.md` and repository guidance.

## In Scope

- Extending the 2-second regime adapter timeout through successful and error-envelope JSON reads.
- Verifying and locking in the existing body-aware 2-second S/R adapter timeout.
- Extending both 10-second app client timeouts through success JSON, 404 JSON, and non-success text reads.
- Preserving current graceful-degradation values, typed unsupported-pool errors, unavailable reasons, controlled error messages, and observability behavior.
- Deterministic regression tests for body reads that hang until abort or reject after headers arrive.
- Exactly-once timer cleanup on all exits.

## Explicitly Out of Scope

- Changes to market-context DTOs, application ports, BFF routes/controllers, or UI rendering.
- Changes to supported-pool allowlists, regime/S/R query parameters, cache policy, TanStack Query retry behavior, or stale times.
- New retries, backoff, circuit breakers, caching, streaming support, or configurable timeout environment variables.
- Hardening policy-insight, S/R-theses, execution-event, or unrelated fetch paths; their similar patterns may be audited in a separate follow-up.
- Replacing all repository fetch calls with a universal HTTP client.
- Adding an external timeout or HTTP dependency.
- Changes to domain logic, trigger qualification, execution planning, wallet signing, or the release-blocker directional exit invariant.

## Risks and Concerns

- **Abort misclassification:** `response.json()` and `response.text()` catches currently treat every rejection as a parse/read failure in several branches. If abort is not explicitly propagated, the timer can fire correctly while users still see invalid-JSON or endpoint errors. Tests must assert the public timeout classification, not only that `controller.abort()` was called.
- **Swallowed text-read aborts:** the existing `.catch(() => fallback)` on non-success `response.text()` will swallow `AbortError`. It needs an abort-aware catch rather than a blanket fallback.
- **Timer leaks:** moving cleanup outward can leave timers pending if an early return or thrown typed error bypasses cleanup. A single outer `finally` is mandatory; scattered `clearTimeout` calls should not remain in the same function.
- **Fake-timer hangs:** a test body promise that never observes the request signal will remain pending even after fake timers advance. Response doubles must reject on the captured signal's `abort` event, and fake timers must always be restored in teardown.
- **Runtime cancellation variance:** this design relies on standard fetch signal propagation to the body stream. If a supported runtime is later found not to honor it, a `Promise.race` with an explicit timeout rejection can be added as a separately tested compatibility hardening measure.
- **Scope creep from neighboring clients:** similar timeout patterns exist in policy-insight and S/R-theses code. Changing them in this issue would broaden regression risk and acceptance criteria; note them for follow-up rather than silently expanding scope.
- **Over-abstraction:** a shared helper that owns feature-specific status parsing could blur the adapter/app boundaries and make error semantics less visible. Keep transport lifetime explicit in the four scoped paths.

## Completion Criteria

The design is satisfied when the regime and S/R adapter/client requests retain one timeout from request start through the last required asynchronous body read, body-timeout aborts settle using each path's existing failure contract, all timers are cleared exactly once, and existing market-context API, DTO, and UI behavior remains unchanged.
