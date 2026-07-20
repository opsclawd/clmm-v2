# feat: extend SOL/USDC intelligence bundle with missing raw LP facts

## Summary

Audit and extend the read-only SOL/USDC insights bundle so the intelligence engine can derive the highest-value LP/economics metrics without duplicating wallet-specific chain reads.

## Context

The existing bundle already exposes pool, position, alert, and S/R context. This issue should add only missing **raw facts** that clmm-v2 already owns or can authoritatively read, not derived recommendations.

## Dependency chain

- **Audit can start after** INT-TAXONOMY signal taxonomy is defined (to know which evidence families need raw LP inputs).
- **Implementation should be finalized after** INT-FEATURES (features shape the specific raw facts needed).
- RE-CONTRACT is a reference dependency only — the bundle shape is driven by evidence feature needs, not by the downstream evidence wire contract.

## Required audit

Compare the current bundle against the evidence needs for:

- inventory skew;
- fee capture;
- unclaimed fee valuation lineage;
- position token composition;
- any additional wallet/position-scoped raw facts required for deterministic evidence derivation.

## Scope

In scope:

- DTO updates;
- application use-case updates;
- BFF/controller response updates;
- tests/docs;
- explicit data-quality warnings for unavailable enrichment.

Out of scope:

- fee APR / fee-to-volatility derivation if those are better computed in intelligence/regime layers;
- execution slippage logic;
- final recommendations;
- new app UI.

## Guardrails

- Expose raw facts, not final judgments.
- Keep S/R top-level rather than copying per position.
- Preserve the existing no-execution, read-only character of the insights API.

## Acceptance criteria

- [ ] Gap audit documents which required evidence fields were already present and which were missing.
- [ ] Missing raw LP facts with clmm-v2 ownership are added to the bundle.
- [ ] Data-quality warnings distinguish unavailable raw facts from true zero values.
- [ ] Existing bundle consumers remain compatible or migrations are documented.
- [ ] Tests cover the added fields and partial-data cases.

## Parent

Part of opsclawd/clmm-v2#90.
