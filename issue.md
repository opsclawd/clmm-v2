# fix: remove fabricated portfolio and position-card financial metrics

## Summary

Remove hard-coded and generated placeholder financial values from the positions experience. Display authoritative portfolio and pool metrics only when the application layer supplies them; otherwise render an explicit unavailable state.

This is the P0 trust/correctness child of #73. It replaces the prior idea of increasing the placeholder hash buckets. Production UI must not show fabricated financial data that looks real.

## Problem

Current UI behavior includes:

- hard-coded portfolio value and fees-earned values in `PortfolioSummaryStrip`;
- generated fallback TVL and 24-hour fee values from `getCardPlaceholderMetrics`;
- plausible-looking numbers with no reliable visual or data-contract distinction from real financial data.

For a financial application, a missing metric must be visibly unavailable rather than synthesized.

## Required behavior

- Remove the hard-coded `$24,812` portfolio value and `+$142.30` fees value.
- Remove generated placeholder TVL and 24-hour fee metrics from production behavior.
- Do not replace the three-bucket placeholder generator with a larger bucket set, jitter, or another fake-data algorithm.
- Use authoritative application-layer values when they already exist and their semantics are documented.
- When authoritative values are unavailable, render an explicit unavailable representation such as `—` or a concise unavailable label.
- Ensure unavailable values are not formatted as zero and are not included in totals.
- Keep loading, unavailable, and true-zero states distinct.
- Remove dead placeholder helpers and fixtures when no longer used.

## Metric semantics

Before wiring any existing field, document what it means:

- portfolio value must identify its valuation timestamp and included assets;
- fees must distinguish current unclaimed fees from historically earned/collected fees;
- TVL/liquidity and 24-hour fees must identify their source and time window.

Do not relabel an existing field to imply a stronger semantic than it actually has.

## Scope

In scope:

- `PortfolioSummaryStrip` presentation and view-model inputs;
- position-card TVL/fee presentation and helpers;
- application DTO/view-model nullability needed to represent unavailable metrics;
- removal of placeholder generators and related tests/fixtures;
- tests for loading, unavailable, true zero, and authoritative-value states;
- concise documentation of displayed metric semantics.

Out of scope:

- PairGlyph parsing/fallback behavior;
- inventing new portfolio accounting logic if no authoritative aggregate exists;
- intelligence-pipeline feature derivation;
- execution behavior.

## Guardrails

- Never fabricate a financial value.
- Missing is not zero.
- Loading is not unavailable.
- Unclaimed fees are not automatically equivalent to lifetime fees earned.
- Do not expand this issue into a broad portfolio analytics implementation.

## Acceptance criteria

- [ ] No hard-coded portfolio value or fee-earned value remains in production UI code.
- [ ] No generated placeholder TVL or 24-hour fee value remains in production UI code.
- [ ] Authoritative values render when supplied.
- [ ] Missing values render an explicit unavailable state rather than zero or a plausible placeholder.
- [ ] Loading, unavailable, true-zero, and populated states are covered by tests.
- [ ] Removed placeholder helpers have no remaining production callers.
- [ ] Displayed metric semantics and source/time expectations are documented.

## Parent

Child of #73.
