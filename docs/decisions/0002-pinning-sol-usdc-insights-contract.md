# 0002 — Pinning SOL/USDC Insights Contract

- **Status:** Accepted
- **Date:** 2026-07-28
- **Issue:** SOL/USDC insight bundle's dataQuality contract has drifted from the downstream intelligence pipeline's consumer schema
- **Spec:** docs/superpowers/specs/2026-05-01-sol-usdc-insights-data-api-design.md
- **Code:** packages/application/src/dto/index.ts (`SolUsdcInsightInputBundleDto`, `InsightDataWarning`)

## Context

The external advisory/evidence pipeline (`sol-usdc-clmm-intelligence`) consumes `GET /insights/sol-usdc/bundle/:walletId` from this BFF.
The current, shipped response payload contains:
```json
{
  "dataQuality": {
    "partial": true,
    "warnings": [
      {
        "code": "usd_price_quote_unavailable",
        "message": "USD price quote unavailable for mint ...",
        "scope": { "positionId": "...", "tokenMint": "..." }
      }
    ]
  }
}
```
This is the intentional, verified behavior of `clmm-v2`, conforming to `GetSolUsdcInsightBundle.ts` and the original specification in `docs/superpowers/specs/2026-05-01-sol-usdc-insights-data-api-design.md`.

However, the downstream pipeline's consumer schema (`src/contracts/clmm-bundle.ts` in `sol-usdc-clmm-intelligence`) was written against an older or aspirational schema. It expects:
- `dataQuality.isPartial` (not `partial`)
- `dataQuality.warnings` as `string[]` (not structured objects)
- `dataQuality.missingSources: string[]`
- A top-level `status` field

This discrepancy causes the pipeline to fail Zod validation on every fetch.

## Decision

### 1. Pinning and Versioning the Contract
To prevent future silent breakages, we will **pin and version** the contract for the SOL/USDC insight bundle.
- We will check in a canonical JSON schema at `contracts/insight-bundle/v1/schema.json` in this repository, alongside valid and invalid fixtures and a hash-verified checksum (`schema.sha256`).
- This follows the cross-repo contracting model defined in `AGENTS.md`. Sibling repositories can safely vendor the pinned contract at `schemas/clmm-v2/insight-bundle.v1/` to ensure safe, testable integration boundaries.

### 2. Resolution of Missing and Discrepant Fields
We confirm the following:
- **`missingSources` and top-level `status` fields**: These fields were **never** part of the intended design or implementation of `clmm-v2`'s `GET /insights/sol-usdc/bundle/:walletId` endpoint. The downstream pipeline's consumer schema is wrong and aspirational.
- **`partial` vs `isPartial`**: The field is canonically `partial` as specified in the original design and implemented in the BFF.
- **`warnings` structure**: The warnings are canonically objects (`InsightDataWarning`) containing structured code, message, and scope, not simple strings.

### 3. Downstream Action
The companion fix in `sol-usdc-clmm-intelligence#49` must be updated/closed consistently with this decision:
- Remove the expectation of `missingSources` and top-level `status` fields.
- Correct `isPartial` to `partial`.
- Update `warnings` to support the structured `InsightDataWarning` object shape rather than a flat string array.
- Vendor the newly published `insight-bundle.v1` contract from this repo into `sol-usdc-clmm-intelligence` under `schemas/clmm-v2/insight-bundle.v1/`.

## Environment

This decision relies on the established cross-repo contract patterns documented in `AGENTS.md` and currently utilized for other `opsclawd` repositories.

## Reversibility

Any proposed changes to the `GET /insights/sol-usdc/bundle/:walletId` response schema will require a major/minor contract revision (e.g., `v2` or a non-breaking `v1` change) and must update or supersede this ADR.
