---
title: "Regime-engine env vars, forbidden-variable guard, and E2E fixtures were undocumented"
date: 2026-04-19
category: documentation-gaps
module: adapters
problem_type: documentation_gap
component: documentation
severity: medium
applies_when:
  - Deploying or configuring regime-engine integration on Railway
  - Onboarding to the regime-engine stack
  - Setting up manual E2E verification of CLMM execution events
  - Shipping any unit that introduces new cross-service env vars
tags:
  - regime-engine
  - env-vars
  - e2e-fixtures
  - railway
  - cross-service-wiring
  - boundary-preservation
---

# Regime-engine env vars, forbidden-variable guard, and E2E fixtures were undocumented

## Context

After Units 1-5 shipped regime-engine integration code into CLMM V2, the integration variables `REGIME_ENGINE_BASE_URL` and `REGIME_ENGINE_INTERNAL_TOKEN` were consumed by `AppModule.ts` and `AdaptersModule.ts` but had zero documentation. The `.env.sample` had bare `=` lines with no comments, `apps/app/.env.example` had no forbidden-variable guard, README.md lacked an Environment Variables section, no E2E fixtures existed for manual verification, and no grep gates validated architectural boundary preservation. The code worked locally but a fresh deployer would have no idea what to set or why.

## Guidance

**Treat environment-variable surfaces as a first-class documentation contract.** Every integration variable must have:

1. **Inline `.env.sample` documentation** — group vars by concern with section headers; add a comment block explaining purpose, production vs fallback values, and failure mode when unset.
2. **Forbidden-variable guard** — in any client-side `.env.example`, explicitly document variables that must NEVER be defined there (e.g., `EXPO_PUBLIC_*` for backend-only services) with a comment explaining why.
3. **README env-table** — a dedicated "Environment Variables" section with a table covering variable name, purpose, required-in scope (prod vs optional-in local-dev), and architecture rule.
4. **E2E fixtures** — checked-in JSON fixtures that match adapter type contracts, enabling repeatable manual verification without live services.
5. **Boundary grep gates** — after shipping cross-package integration, run grep checks verifying: (a) no `EXPO_PUBLIC_` leakage into client code, (b) no adapter imports from application, (c) no domain port types leaking into application.

## Why This Matters

Undocumented env vars are the fastest path to deployment failure and security exposure. Without inline comments, a deployer copies bare `=` lines and either leaves them blank (silently no-op) or guesses values. Without a forbidden-variable guard, a developer may expose a backend secret through an `EXPO_PUBLIC_` prefix, leaking it into the mobile bundle. Without grep gates, architectural boundaries erode silently across units. The cost of documentation-at-ship-time is minutes; the cost of a misconfigured production deploy or a leaked secret is hours to days.

## When to Apply

- After any unit or story that introduces new environment variables, especially cross-service integration variables.
- When a variable must exist in one deployment surface (backend) but must NEVER exist in another (mobile app).
- When shipping code that crosses package boundaries (domain ↔ application ↔ adapters) and boundary-preservation needs verification.
- When a manual E2E verification step gates a release and there are no checked-in fixtures to make it repeatable.

## Examples

**Before** — bare, undocumented `.env.sample`:

```
DATABASE_URL=postgresql://user:password@host:5432/clmm
SOLANA_RPC_URL=https://your-private-rpc.example.com
PORT=3001
REGIME_ENGINE_BASE_URL=
REGIME_ENGINE_INTERNAL_TOKEN=
```

**After** — grouped, documented, with failure-mode notes:

```
# --- Database ---
DATABASE_URL=postgresql://user:password@host:5432/clmm

# --- Solana RPC ---
SOLANA_RPC_URL=https://your-private-rpc.example.com

# --- HTTP ---
PORT=3001

# --- Regime engine integration (see docs/plans/2026-04-17-002-opus-clmm-regime-engine-integration-plan.md) ---
# REGIME_ENGINE_BASE_URL: backend-only URL for the regime-engine service.
#   Prod: Railway private domain, e.g. http://regime-engine.railway.internal:${PORT}
#   Fallback: public Railway domain if private networking is unresolved.
#   Unset → CLMM skips regime-engine calls (no-op adapter; logs once per process).
REGIME_ENGINE_BASE_URL=
# REGIME_ENGINE_INTERNAL_TOKEN: shared secret that MUST match regime-engine's
#   CLMM_INTERNAL_TOKEN. Used as X-CLMM-Internal-Token on POST /v1/clmm-execution-result.
#   Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
REGIME_ENGINE_INTERNAL_TOKEN=
```

**Before** — `apps/app/.env.example` with no regime-engine mention:

```
# App-only public variables (safe to commit, no backend secrets)
EXPO_PUBLIC_BFF_BASE_URL=https://api.clmm.v2.app
```

**After** — forbidden-variable guard added:

```
# App-only public variables (safe to commit, no backend secrets).
#
# Rule: the app may ONLY reach the BFF. No EXPO_PUBLIC_REGIME_ENGINE_* or any
# other EXPO_PUBLIC_* pointing at a backend dependency. Regime-engine is
# backend-only — the BFF mediates every read. See:
#   - docs/plans/2026-04-17-002-opus-clmm-regime-engine-integration-plan.md §7 rule 4
#   - packages/adapters/src/inbound/http/PositionController.ts (srLevels enrichment)
EXPO_PUBLIC_BFF_BASE_URL=https://api.clmm.v2.app
```

**Boundary grep gates** (run after each integration unit ships):

```bash
# 1. No EXPO_PUBLIC_REGIME_ENGINE leak (except .env.example comment documenting the rule)
grep -rn "EXPO_PUBLIC_REGIME_ENGINE" apps packages 2>/dev/null | grep -v ".env.example" || echo "CLEAN"

# 2. No adapter import from application
grep -rn "from '@clmm/adapters'" packages/application/src 2>/dev/null || echo "CLEAN"

# 3. No regime-engine port types in application
grep -rn "RegimeEngineNotificationPort\|RegimeEngineEventPort" packages/application/src 2>/dev/null || echo "CLEAN"

# 4. Verify additive DTO field still present
grep -n "srLevels" packages/application/src/dto/index.ts
```

## Related

- [`docs/solutions/best-practices/outbound-adapter-fire-and-forget-dual-seam-pattern-2026-04-19.md`](../best-practices/outbound-adapter-fire-and-forget-dual-seam-pattern-2026-04-19.md) — covers how the regime-engine adapter degrades when env vars are absent (no-op DI wiring); this doc covers why they were undocumented and how to prevent the documentation gap from recurring.
- [`docs/plans/2026-04-19-002-feat-clmm-regime-engine-deploy-runbook-plan.md`](../../plans/2026-04-19-002-feat-clmm-regime-engine-deploy-runbook-plan.md) — the deploy runbook containing the Railway cross-service wiring steps and E2E verification procedures.
- [`docs/plans/2026-04-17-002-opus-clmm-regime-engine-integration-plan.md`](../../plans/2026-04-17-002-opus-clmm-regime-engine-integration-plan.md) — origin plan §7 (forbidden list) and §8 (gates).