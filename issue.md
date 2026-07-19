# Harden market insight fetch timeouts through response body reads

## Summary

Harden the regime and S/R market insight fetch paths so request timeouts cover both the initial `fetch()` call and response body consumption (`json()` / `text()`).

Current code clears the `AbortController` timeout after `fetch()` returns, before the response body is read. That means the timeout protects connection/headers but not a slow or hung response body stream.

## Impact

Practical severity: **low-to-moderate**.

Why it matters:

- A server can return response headers and then stall while streaming the body.
- `response.json()` / `response.text()` can outlive the intended timeout.
- UI may remain loading longer than expected.
- BFF request handlers may stay open longer than intended.
- Timeout semantics become misleading.

Why this is not blocking issue #63:

- Response bodies are tiny JSON.
- Normal failures are more likely 404/500/network errors than header-success/body-stall.
- Existing S/R code already uses the same timeout pattern, so this is not a regime-only regression.

## Scope

- Add a small helper or pattern that keeps the abort timeout active through both:
  1. `fetch(...)`
  2. response body read (`json()` / `text()`)
- Apply it to new regime fetch code.
- Apply it to existing S/R fetch code for consistency.
- Preserve current graceful degradation behavior.
- Add tests for slow/hung/rejected body reads where feasible.

## Candidate files

- `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.ts`
- `packages/adapters/src/outbound/regime-engine/CurrentSrLevelsAdapter.ts`
- `apps/app/src/api/regime.ts`
- `apps/app/src/api/srLevels.ts`

## Acceptance criteria

- [ ] Timeout covers response body consumption, not just header receipt.
- [ ] Regime adapter still returns graceful `null` / unavailable behavior according to its contract.
- [ ] S/R adapter preserves existing graceful degradation behavior.
- [ ] App API clients preserve existing error classification behavior.
- [ ] Tests cover a response whose body read hangs or rejects after headers are returned, at least for the shared helper or one representative adapter/client path.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm test` passes.

## Notes

This issue should not change market-context product behavior, DTOs, or UI. It is network-hardening tech debt discovered during issue #63 review.
