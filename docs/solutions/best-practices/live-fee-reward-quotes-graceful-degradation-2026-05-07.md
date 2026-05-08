---
title: Live Fee and Reward Quotes with Graceful Degradation
date: '2026-05-07'
category: best-practices
module: orca-position-fee-reward-quote
problem_type: best_practice
component: service_object
severity: medium
applies_when:
  - fetching on-chain data that may be unavailable or stale
  - replacing stale pre-computed accumulators with live computed quotes
  - designing discriminated union results for adapter failure modes
root_cause: inadequate_documentation
resolution_type: code_fix
related_components:
  - solana-position-snapshot-reader
  - observability-port
tags:
  - orca
  - clmm
  - fee-reward-quote
  - discriminated-union
  - graceful-degradation
  - observability
  - adapter-pattern
  - solana
---

# Live Fee and Reward Quotes with Graceful Degradation

## Context

On-chain CLMM position snapshots expose `feeOwedA`, `feeOwedB`, and `rewardInfos[].amountOwed` — but these accumulators are only updated when a transaction touches the position. Between updates, the values grow stale, diverging from the true earned fees and rewards. Naively displaying these stale values misleads LPs. However, live quote computation depends on tick arrays fetched over HTTP, which can fail or return incomplete data. Without a disciplined pattern, every consumer must invent its own fallback logic — or worse, silently serve bad data.

## Guidance

**Model fee/reward availability as a discriminated union, not a nullable scalar.**

Compute live quotes in a dedicated, stateless helper and return a result type that distinguishes _why_ a quote is unavailable:

```typescript
type FeeRewardQuoteResult =
  | {
      status: 'ok';
      fees: { amountOwedA: bigint; amountOwedB: bigint };
      rewards: PositionRewardQuote[];
    }
  | { status: 'tick-array-fetch-failed'; reason: string }
  | { status: 'tick-data-missing'; reason: string }
  | { status: 'fee-quote-failed'; reason: string; errorName?: string }
  | { status: 'reward-quote-failed'; reason: string; errorName?: string };
```

**Handle inactive reward mints defensively.** Orca positions can contain reward slots with empty mints (`mint = ''`). Assign `amountOwed = 0n, decimals = null` instead of attempting to quote them — this avoids downstream NaN/null crashes.

**Delegate and observe.** The snapshot reader delegates to the helper and logs structured unavailability:

```typescript
const result = this.quoteHelper.quote(params);

if (result.status !== 'ok') {
  this.observability?.trackEvent({
    name: 'orca_position_fee_reward_quote_unavailable',
    properties: {
      positionId,
      walletId,
      poolId,
      lowerTick,
      upperTick,
      tickSpacing,
      reason: result.reason,
      errorName: (result as any).errorName,
      errorMessage: (result as any).errorMessage?.slice(0, 200),
    },
  });
  return null;
}
```

Returning `null` for the position detail propagates cleanly to the existing 503 error path, letting the UI surface "temporarily unavailable" instead of stale or incorrect numbers.

**Constructor design for backwards compatibility.** Wire the helper and observability through optional constructor params so existing callers continue working without changes:

```typescript
constructor(
  // ... existing deps
  observability?: ObservabilityPort,
  quoteHelper?: OrcaPositionFeeRewardQuoteHelper,
) {
  this.observability = observability ?? null;
  this.quoteHelper = quoteHelper ?? new OrcaPositionFeeRewardQuoteHelper();
}
```

## Why This Matters

- **Stale data is worse than no data.** Showing outdated `feeOwedA`/`feeOwedB` misleads LPs into acting on incorrect P&L. Surfacing unavailability is the correct behavior.
- **Discriminated unions prevent silent fallback bugs.** Modeling each failure mode as a distinct arm gives observability precise reason codes and lets callers reason about _what_ failed rather than just _that_ something failed.
- **Observability closes the feedback loop.** Structured events with position identity and failure reason make it possible to detect systemic RPC issues, tick-array coverage gaps, or Orca SDK incompatibilities in production.
- **Without this pattern**, every consumer re-implements partial fallback logic, leading to inconsistent UX and undiagnosable failures.

## When to Apply

- Any adapter that transforms on-chain accumulator data that can grow stale between transactions
- Any data source that depends on external HTTP availability (tick arrays, RPC nodes) where partial failure is expected, not exceptional
- Any UI that must choose between "show stale data" vs. "show unavailable" — always pick the latter and log why

## Examples

**Before — stale accumulators served directly:**

```typescript
const positionDetail = {
  fees: {
    feeOwedA: snapshot.feeOwedA, // stale — only updated on last touch
    feeOwedB: snapshot.feeOwedB, // stale
  },
  rewards: snapshot.rewardInfos.map((r) => ({
    amountOwed: r.amountOwed, // stale, or NaN for empty-mint slots
    decimals: r.decimals,
  })),
};
```

**After — live quote with graceful degradation:**

```typescript
const result = this.quoteHelper.quote({
  position,
  whirlpool,
  tokenExtensions,
  tickArrays,
});

if (result.status !== 'ok') {
  this.observability?.trackEvent({
    name: 'orca_position_fee_reward_quote_unavailable',
    properties: {
      positionId: position.publicKey.toString(),
      walletId,
      poolId,
      lowerTick,
      upperTick,
      tickSpacing,
      reason: result.reason,
      errorName: (result as any).errorName,
      errorMessage: (result as any).errorMessage?.slice(0, 200),
    },
  });
  return null; // triggers 503 — UI shows "temporarily unavailable"
}

return {
  fees: {
    feeOwedA: result.fees.amountOwedA, // live computed
    feeOwedB: result.fees.amountOwedB, // live computed
  },
  rewards: result.rewards, // inactive mints: amountOwed=0n, decimals=null
};
```

## Related

- [Enriching DTOs Across Layers](enriching-dtos-across-layers-2026-04-25.md) — USD enrichment on top of fee/reward fields; this doc supersedes the direct on-chain field reads
- [Read-Only Data API Discriminated Unions](read-only-data-api-discriminated-unions-bff-2026-05-01.md) — BFF composition pattern with partial-failure semantics; live quotes extend this pattern
- [Position-Bound Fields: Tick-to-Price Migration](position-bound-fields-tick-to-price-migration-2026-05-04.md) — Same reader adapter; live quotes add tick-array-failure handling
- [GitHub Issue #61](https://github.com/opsclawd/clmm-v2/issues/61) — Bug report that stale on-chain fields show zero; this pattern is the fix
