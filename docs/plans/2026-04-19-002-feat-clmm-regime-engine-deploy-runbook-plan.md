---
title: "feat: CLMM regime-engine deploy + E2E runbook (Unit 6, CLMM side)"
type: feat
status: active
date: 2026-04-19
origin: docs/plans/2026-04-17-002-opus-clmm-regime-engine-integration-plan.md
companion: docs/plans/2026-04-19-001-feat-regime-engine-outbound-integration-plan.md
---

# CLMM Regime-Engine Deploy + E2E Runbook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Unit 6 on the CLMM side: document the two regime-engine env vars (`REGIME_ENGINE_BASE_URL`, `REGIME_ENGINE_INTERNAL_TOKEN`), wire them into the CLMM Railway services (API + worker), and run the one-shot E2E verification that proves the dual-seam terminal notification (Unit 4) and BFF S/R enrichment (Unit 5) work end-to-end in production.

**Architecture:** The CLMM side of Unit 6 is deployment + documentation + manual verification. Units 4 and 5 already shipped the code. This plan adds the env var docs (README, `.env.sample`, `.env.example`), a Railway cross-service wiring runbook, an E2E verification runbook with copy-pasteable curl commands + fixtures, boundary-preservation grep gates, and the checkbox updates that close out origin plan §6 Unit 6 and §8 G3/G4. No new adapters, no new ports, no new domain or application code.

**Tech Stack:** Node 20+, pnpm 9, NestJS + Fastify (adapters/inbound/http), pg-boss (adapters/inbound/jobs), Railway for infra, `curl` + shared secret headers for verification.

---

## 1. Problem Frame

Units 1–5 (regime-engine §5.4 DDL + HTTP surface + CLMM-side outbound adapter + BFF enrichment) are merged. The CLMM backend already reads `REGIME_ENGINE_BASE_URL` and `REGIME_ENGINE_INTERNAL_TOKEN` at `packages/adapters/src/inbound/http/AppModule.ts:63-70` and `packages/adapters/src/composition/AdaptersModule.ts:66-73`, but:

1. The two vars are undocumented in `README.md`. New engineers cannot infer what to set in Railway.
2. `.env.sample` lists them as empty values with no inline description of purpose, linkage to regime-engine, or deploy requirements.
3. `apps/app/.env.example` has no explicit comment that `EXPO_PUBLIC_REGIME_ENGINE_*` is forbidden — an easy mistake for an implementer eyeballing the two-service architecture.
4. No runbook exists that describes the Railway cross-service wiring (reference variables, private-domain resolution, public-URL fallback).
5. No copy-pasteable E2E script exists for the one manual validation pass that gates G4 → G5 in the origin plan.

This plan closes those five gaps in the CLMM repo only. The regime-engine side of Unit 6 (volume creation, `HOST=::` binding, Dockerfile `LEDGER_DB_PATH` defaults, smoke test) is tracked separately on the regime-engine repo.

## 2. Scope Boundaries

**In scope (CLMM repo)**

- README.md documentation for `REGIME_ENGINE_BASE_URL`, `REGIME_ENGINE_INTERNAL_TOKEN`, and the `EXPO_PUBLIC_BFF_BASE_URL`-is-the-sole-public-URL rule.
- Inline comments in `packages/adapters/.env.sample` explaining what each var is for and which Railway service reads it.
- Confirmation comment in `apps/app/.env.example` that `EXPO_PUBLIC_REGIME_ENGINE_*` is forbidden.
- Railway cross-service wiring runbook (in this document).
- E2E verification runbook with copy-pasteable curl commands and two JSON fixtures.
- Boundary-preservation grep gates (no Expo-facing regime-engine vars; no adapter-leak into application).
- Origin plan + companion plan checkbox updates.

**Out of scope (hard rules — do not violate)**

- No new adapter, controller, port, or use case (origin §7 rule 3).
- No `EXPO_PUBLIC_REGIME_ENGINE_*` env var (origin §7 rule 4).
- No change to `packages/domain` or `packages/application` (origin §7).
- No regime-engine-repo changes (covered by origin §6 Unit 6 on the regime-engine side).
- No CI automation of the E2E — this is a one-shot manual validation per origin §6 Unit 6.
- No extension of `status` beyond `confirmed | failed` (origin §7 rule 7).
- No pool-to-symbol generalization (origin §7 rule 8).
- No live-wallet funding work in this plan — G5 ($100 position) is operator-gated and out of this plan's scope.

## 3. Prerequisites

Before executing any task in §5:

- [ ] Confirm `packages/adapters/.env.sample` already has `REGIME_ENGINE_BASE_URL=` and `REGIME_ENGINE_INTERNAL_TOKEN=` lines (present per `packages/adapters/.env.sample:7-8`).
- [ ] Confirm `AppModule.ts` reads both vars (`packages/adapters/src/inbound/http/AppModule.ts:63-64`).
- [ ] Confirm `AdaptersModule.ts` reads both vars (`packages/adapters/src/composition/AdaptersModule.ts:66-67`).
- [ ] Confirm regime-engine Unit 6 deploy is either done OR tracked on the regime-engine side — this plan's Task 7 depends on regime-engine running at a reachable URL.
- [ ] Confirm current branch is `main` (or a short-lived branch off `main`) and `git status` is clean.

If any prerequisite is missing, stop and report.

## 4. File Structure

| File | Action | Responsibility |
|---|---|---|
| `README.md` | Modify | Top-level env-var reference; links to deploy runbook section |
| `packages/adapters/.env.sample` | Modify | Inline comments grouping backend-only vars and explaining regime-engine linkage |
| `apps/app/.env.example` | Modify | Explicit `EXPO_PUBLIC_REGIME_ENGINE_*`-forbidden comment |
| `docs/plans/2026-04-19-002-feat-clmm-regime-engine-deploy-runbook-plan.md` | This file | Embedded Railway wiring runbook + E2E verification runbook |
| `docs/runbooks/regime-engine-e2e-fixtures/sr-levels-brief.json` | Create | Seed brief payload for E2E curl #4 |
| `docs/runbooks/regime-engine-e2e-fixtures/clmm-execution-event.json` | Create | Replay payload for E2E curl #6 (idempotency proof) |
| `docs/plans/2026-04-17-002-opus-clmm-regime-engine-integration-plan.md` | Modify | Check off Unit 6 CLMM-side items + G3/G4 gates |
| `docs/plans/2026-04-19-001-feat-regime-engine-outbound-integration-plan.md` | Modify | Check off documentation/op notes handoff (§12) |

No code files in `packages/*/src/**` change. No test files change. This is deploy + docs + fixtures only.

---

## 5. Implementation Tasks

### Task 1: Add inline documentation to `packages/adapters/.env.sample`

**Files:**
- Modify: `packages/adapters/.env.sample`

- [ ] **Step 1: Read current file**

Read `packages/adapters/.env.sample` and confirm it currently reads:

```
# Backend-only environment variables (DO NOT commit to source control)
# These are Railway deployment secrets

DATABASE_URL=postgresql://user:password@host:5432/clmm
SOLANA_RPC_URL=https://your-private-rpc.example.com
PORT=3001
REGIME_ENGINE_BASE_URL=
REGIME_ENGINE_INTERNAL_TOKEN=
```

If the shape differs, stop and report.

- [ ] **Step 2: Replace contents with grouped + documented version**

Replace the entire file with:

```
# Backend-only environment variables (DO NOT commit to source control).
# These are Railway deployment secrets. `.env.sample` is committed;
# copy to `.env` locally and fill real values.

# --- Database ---
DATABASE_URL=postgresql://user:password@host:5432/clmm

# --- Solana RPC ---
SOLANA_RPC_URL=https://your-private-rpc.example.com

# --- HTTP ---
PORT=3001

# --- Regime engine integration (see docs/plans/2026-04-17-002-opus-clmm-regime-engine-integration-plan.md) ---
# REGIME_ENGINE_BASE_URL: backend-only URL for the regime-engine service.
#   Prod: Railway private domain, e.g. http://regime-engine.railway.internal:${{regime-engine.PORT}}
#   Fallback: public Railway domain if private networking is unresolved.
#   Unset → CLMM skips regime-engine calls (no-op adapter; logs once per process).
REGIME_ENGINE_BASE_URL=
# REGIME_ENGINE_INTERNAL_TOKEN: shared secret that MUST match regime-engine's
#   CLMM_INTERNAL_TOKEN. Used as X-CLMM-Internal-Token on POST /v1/clmm-execution-result.
#   Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
REGIME_ENGINE_INTERNAL_TOKEN=
```

- [ ] **Step 3: Verify no committed `.env` was touched**

Run: `git status -- packages/adapters/`
Expected: only `.env.sample` listed; no `packages/adapters/.env` changes.

- [ ] **Step 4: Commit**

```bash
git add packages/adapters/.env.sample
git commit -m "docs(adapters): group and document backend env vars incl. regime-engine"
```

---

### Task 2: Add forbidden-var comment to `apps/app/.env.example`

**Files:**
- Modify: `apps/app/.env.example`

- [ ] **Step 1: Read current file**

Confirm it currently reads:

```
# App-only public variables (safe to commit, no backend secrets)
EXPO_PUBLIC_BFF_BASE_URL=https://api.clmm.v2.app
```

- [ ] **Step 2: Replace with annotated version**

Replace the file contents with:

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

- [ ] **Step 3: Commit**

```bash
git add apps/app/.env.example
git commit -m "docs(app): document EXPO_PUBLIC_REGIME_ENGINE_* forbidden rule"
```

---

### Task 3: Add "Environment variables" section to `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read current README structure**

Sections today (per `README.md`):
1. Title
2. Getting Started
3. Common Commands
4. Completion Gate
5. Repo Map
6. Important Docs
7. Product Guardrails

Target: insert a new "Environment Variables" section immediately before "Important Docs" (between "Repo Map" and "Important Docs").

- [ ] **Step 2: Insert new section**

Edit `README.md` to insert the following block between the "## Repo Map" list and the "## Important Docs" heading (i.e., after line 59, before line 60 in the current file):

```markdown

## Environment Variables

CLMM uses two separate env surfaces:

- **App-only public** (`apps/app/.env.example`): variables prefixed `EXPO_PUBLIC_*`, shipped in the mobile/web bundle. **Only `EXPO_PUBLIC_BFF_BASE_URL` is allowed.** The app never talks to backend dependencies directly; the BFF mediates every read.
- **Backend-only** (`packages/adapters/.env.sample`): Railway deployment secrets — DB, RPC, and cross-service credentials. Never ship these in the app bundle.

### Regime engine integration (backend only)

CLMM posts terminal execution events to regime-engine and reads current S/R levels back through the BFF. Two env vars wire this up on the CLMM side:

| Var | Purpose | Required in |
|---|---|---|
| `REGIME_ENGINE_BASE_URL` | Backend-only base URL for regime-engine. Prefer the Railway private domain (e.g. `http://regime-engine.railway.internal:${{regime-engine.PORT}}`); fall back to the public domain if private networking is unresolved. | CLMM API + Worker |
| `REGIME_ENGINE_INTERNAL_TOKEN` | Shared secret sent as `X-CLMM-Internal-Token` on `POST /v1/clmm-execution-result`. Must match regime-engine's `CLMM_INTERNAL_TOKEN`. | CLMM API + Worker |

Both vars are optional in local dev: when unset, the adapter logs once per process and becomes a no-op. In Railway production, both MUST be set on the CLMM API and worker services.

Never define `EXPO_PUBLIC_REGIME_ENGINE_*`. Regime-engine is not reachable from the app bundle under any circumstances. See `docs/plans/2026-04-17-002-opus-clmm-regime-engine-integration-plan.md` §7 rule 4.

Deploy + verification runbook: `docs/plans/2026-04-19-002-feat-clmm-regime-engine-deploy-runbook-plan.md` §6 (Railway wiring) and §7 (E2E verification).

```

- [ ] **Step 3: Verify section rendering**

Run: `grep -n "^## " README.md`
Expected output (order matters):
```
## Getting Started
## Common Commands
## Completion Gate
## Repo Map
## Environment Variables
## Important Docs
## Product Guardrails
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(readme): add Environment Variables section with regime-engine wiring"
```

---

### Task 4: Create E2E fixture — sr-levels brief

**Files:**
- Create: `docs/runbooks/regime-engine-e2e-fixtures/sr-levels-brief.json`

- [ ] **Step 1: Create directory**

Run: `mkdir -p docs/runbooks/regime-engine-e2e-fixtures`

- [ ] **Step 2: Write fixture**

Create `docs/runbooks/regime-engine-e2e-fixtures/sr-levels-brief.json` with contents:

```json
{
  "schemaVersion": "1.0",
  "source": "mco",
  "symbol": "SOL/USDC",
  "brief": {
    "briefId": "e2e-verification-2026-04-19",
    "sourceRecordedAtIso": "2026-04-19T00:00:00.000Z",
    "summary": "Seed brief for CLMM Unit 6 E2E verification. NOT production trading signal."
  },
  "levels": [
    { "levelType": "support",    "price": 120.00, "timeframe": "1D", "rank": "strong" },
    { "levelType": "support",    "price": 135.50, "timeframe": "1D", "rank": "medium" },
    { "levelType": "resistance", "price": 155.00, "timeframe": "1D", "rank": "strong" },
    { "levelType": "resistance", "price": 168.25, "timeframe": "1D", "rank": "medium" }
  ]
}
```

- [ ] **Step 3: Validate JSON shape**

Run: `node -e "JSON.parse(require('fs').readFileSync('docs/runbooks/regime-engine-e2e-fixtures/sr-levels-brief.json','utf8'))"`
Expected: exit 0, no output.

- [ ] **Step 4: Commit**

```bash
git add docs/runbooks/regime-engine-e2e-fixtures/sr-levels-brief.json
git commit -m "docs(runbooks): add sr-levels E2E fixture for Unit 6 verification"
```

---

### Task 5: Create E2E fixture — clmm execution event

**Files:**
- Create: `docs/runbooks/regime-engine-e2e-fixtures/clmm-execution-event.json`

- [ ] **Step 1: Write fixture**

Create `docs/runbooks/regime-engine-e2e-fixtures/clmm-execution-event.json` with contents:

```json
{
  "schemaVersion": "1.0",
  "correlationId": "e2e-verification-attempt-2026-04-19",
  "positionId": "e2e-position-placeholder",
  "breachDirection": "LowerBoundBreach",
  "reconciledAtIso": "2026-04-19T00:05:00.000Z",
  "txSignature": "5xYe2eVerificationSignaturePlaceholder1111111111111111111111111",
  "tokenOut": "USDC",
  "status": "confirmed"
}
```

- [ ] **Step 2: Validate JSON shape**

Run: `node -e "JSON.parse(require('fs').readFileSync('docs/runbooks/regime-engine-e2e-fixtures/clmm-execution-event.json','utf8'))"`
Expected: exit 0, no output.

- [ ] **Step 3: Verify shape matches `ClmmExecutionEventRequest`**

Open `packages/adapters/src/outbound/regime-engine/types.ts` and confirm the fixture's keys exactly match the required fields of `ClmmExecutionEventRequest` (schemaVersion, correlationId, positionId, breachDirection, reconciledAtIso, txSignature, tokenOut, status). No optional fields set — fixture exercises the minimum valid request.

- [ ] **Step 4: Commit**

```bash
git add docs/runbooks/regime-engine-e2e-fixtures/clmm-execution-event.json
git commit -m "docs(runbooks): add clmm-execution-event E2E fixture for Unit 6 verification"
```

---

### Task 6: Boundary-preservation grep gates

**Files:** none modified; this task is verification only.

- [ ] **Step 1: Verify no `EXPO_PUBLIC_REGIME_ENGINE_*` leak in source or config**

Run: `grep -rn "EXPO_PUBLIC_REGIME_ENGINE" apps packages 2>/dev/null || echo "CLEAN"`
Expected: exactly `CLEAN`, OR a single match in `apps/app/.env.example` that sits inside the comment block added by Task 2 (explicitly documenting the forbidden rule). Any other match — in particular any `.ts`, `.tsx`, `.json`, or non-commented `.env*` line — is a leak. Stop and report.

- [ ] **Step 2: Verify no adapter-layer port leak into application**

Run: `grep -rn "from '@clmm/adapters'" packages/application/src 2>/dev/null || echo "CLEAN"`
Expected: `CLEAN`. If any match, stop and report.

- [ ] **Step 3: Verify no `RegimeEngineNotificationPort` in application**

Run: `grep -rn "RegimeEngineNotificationPort\|RegimeEngineEventPort" packages/application/src 2>/dev/null || echo "CLEAN"`
Expected: `CLEAN`. If any match, stop and report — origin §7 rule 3 has been violated.

- [ ] **Step 4: Verify application DTO still carries the additive S/R field**

Run: `grep -n "srLevels" packages/application/src/dto/index.ts`
Expected: at least one match on a line declaring `srLevels?:` inside `PositionDetailDto`. If zero matches, Unit 5 has regressed — stop and report.

- [ ] **Step 5: Record gate result**

No commit from this task. If all four checks pass, proceed to Task 7. If any fail, stop and escalate before continuing.

---

### Task 7: Railway cross-service wiring (operator runbook)

**Context:** This task is operator work executed in the Railway dashboard + Railway shell. It does not modify files in the CLMM repo. It is listed here as a checklist so that one person can walk through it without re-deriving the context from origin plan §6 Unit 6.

**Prerequisites:**
- The regime-engine service is deployed in the same Railway project as CLMM and is healthy at its own `/health` endpoint. (Execute origin plan §6 Unit 6 runbook steps 1-4 on the regime-engine side first.)
- The regime-engine service has `CLMM_INTERNAL_TOKEN` set to a strong random value.

- [ ] **Step 1: Verify regime-engine public health (from any shell)**

Run:
```bash
curl -fsS https://<regime-engine-public-host>.up.railway.app/health
```
Expected: `{"status":"ok"}` (shape may vary; non-2xx = stop).

- [ ] **Step 2: On the CLMM API Railway service, set `REGIME_ENGINE_BASE_URL`**

Preferred value (private networking):
```
REGIME_ENGINE_BASE_URL=http://${{regime-engine.RAILWAY_PRIVATE_DOMAIN}}:${{regime-engine.PORT}}
```

Fallback value (if private networking unresolved at deploy time — see origin §6 Unit 6 step 7 fallback):
```
REGIME_ENGINE_BASE_URL=https://<regime-engine-public-host>.up.railway.app
```

- [ ] **Step 3: On the CLMM API service, set `REGIME_ENGINE_INTERNAL_TOKEN` via reference variable**

```
REGIME_ENGINE_INTERNAL_TOKEN=${{regime-engine.CLMM_INTERNAL_TOKEN}}
```

This pins the CLMM side to the same secret regime-engine validates, avoiding manual out-of-band copy of a strong secret.

- [ ] **Step 4: Repeat Step 2 and Step 3 on the CLMM Worker Railway service**

Both the API (`dev:api` → `main.ts` of `inbound/http`) and the Worker (`dev:worker` → `main.ts` of `inbound/jobs`) construct a regime-engine adapter at module load (`AppModule.ts:63-70`, `AdaptersModule.ts:66-73`). Both must have the vars set or the worker's reconciliation seam will run in no-op mode.

- [ ] **Step 5: Trigger redeploy on both CLMM services**

Using the Railway dashboard, trigger a redeploy of the CLMM API and the CLMM worker so the new env vars are applied.

- [ ] **Step 6: Verify CLMM API boots with vars**

Run (Railway CLMM API shell):
```bash
echo "REGIME_ENGINE_BASE_URL=${REGIME_ENGINE_BASE_URL:-UNSET}"
echo "REGIME_ENGINE_INTERNAL_TOKEN=$(if [ -n \"$REGIME_ENGINE_INTERNAL_TOKEN\" ]; then echo SET; else echo UNSET; fi)"
```
Expected: both show a value (`SET` for the token — never echo the secret value); neither shows `UNSET`.

Then:
```bash
curl -fsS http://localhost:${PORT}/health
```
Expected: `200` with `{"status":"ok"}`.

- [ ] **Step 7: Verify CLMM API can reach regime-engine over the configured URL**

In the Railway CLMM API shell:
```bash
curl -fsS "${REGIME_ENGINE_BASE_URL}/health"
```
Expected: `200` with a healthy response body from regime-engine.

If this fails with DNS or timeout and `${REGIME_ENGINE_BASE_URL}` is the private domain, fall back to the public domain per Step 2. Re-run Step 5 and Step 6 after the fallback, then re-run Step 7.

- [ ] **Step 8: Verify CLMM Worker shell, same commands as Step 6 and Step 7**

Same expected outputs on the worker service shell.

- [ ] **Step 9: Capture Railway deploy IDs**

Record the CLMM API deploy ID and CLMM worker deploy ID for §7 E2E verification. No commit — this is operator log data.

**Gate G3 (origin §8):** All 9 steps above pass → proceed to Task 8. If Step 7 cannot succeed on either private or public URL, stop and escalate.

---

### Task 8: E2E verification runbook (one manual pass)

**Context:** One manual end-to-end validation proves the Unit 4 terminal-notification seam and the Unit 5 S/R enrichment seam work together on deployed infra. Per origin §6 Unit 6, this is a one-shot manual pass — no CI automation.

**Prerequisites:**
- Task 7 passed all 9 steps.
- The fixtures from Task 4 and Task 5 are available at `docs/runbooks/regime-engine-e2e-fixtures/`.
- `$OPENCLAW_INGEST_TOKEN` and `$CLMM_INTERNAL_TOKEN` are exported in the local shell (copy from Railway env var dashboard; never commit).
- Regime-engine public domain is reachable as `$REGIME_ENGINE_PUBLIC_URL` (e.g. `https://regime-engine-production.up.railway.app`).

- [ ] **Step 1: Confirm empty SR read returns 404 on a freshly-deployed regime-engine**

Run:
```bash
curl -i -sS "${REGIME_ENGINE_PUBLIC_URL}/v1/sr-levels/current?symbol=SOL/USDC&source=mco"
```
Expected: `HTTP/1.1 404` (or `HTTP/2 404`). If `200` — the regime-engine DB is not empty; verify whether this is a previous seed and decide whether to continue or reset. If `500` — regime-engine is unhealthy; stop.

- [ ] **Step 2: Seed the SR brief via the Task 4 fixture**

Run:
```bash
curl -i -sS -X POST "${REGIME_ENGINE_PUBLIC_URL}/v1/sr-levels" \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Token: ${OPENCLAW_INGEST_TOKEN}" \
  -d @docs/runbooks/regime-engine-e2e-fixtures/sr-levels-brief.json
```
Expected: `HTTP/1.1 201` with body `{"briefId":"e2e-verification-2026-04-19","insertedCount":4}`.

- [ ] **Step 3: Confirm SR read now returns the seeded levels**

Run:
```bash
curl -i -sS "${REGIME_ENGINE_PUBLIC_URL}/v1/sr-levels/current?symbol=SOL/USDC&source=mco"
```
Expected: `HTTP/1.1 200` with:
- `supports` array of length 2, prices `[120.00, 135.50]`, sorted ascending.
- `resistances` array of length 2, prices `[155.00, 168.25]`, sorted ascending.
- `capturedAtIso` is an ISO-8601 string within the last few minutes.

- [ ] **Step 4: Render the BFF-enriched position-detail in the PWA**

Open the deployed CLMM PWA (`https://clmm.v2.app` or the Railway-generated URL if DNS not yet cut over). Navigate to a real SOL/USDC position whose `poolId` matches the allowlist entry in `packages/adapters/src/inbound/http/AppModule.ts:72-74` (`Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE`).

Expected:
- The position-detail screen renders a "Support & Resistance (MCO)" section.
- Four price labels appear: 120.00, 135.50 under "Support"; 155.00, 168.25 under "Resistance".
- A freshness label reads `"captured Xm ago"` where X matches the time since Step 2.
- No stale-warn badge (brief is < 48h old).

If the section shows "No current MCO levels available", investigate:
- Verify `CurrentSrLevelsAdapter` is reaching regime-engine via the CLMM API Railway logs for a warning log starting with `"SR levels"`.
- Verify the `poolId` in the real position matches the allowlist.

- [ ] **Step 5: Replay-post the terminal-event fixture to prove idempotency**

Run:
```bash
curl -i -sS -X POST "${REGIME_ENGINE_PUBLIC_URL}/v1/clmm-execution-result" \
  -H "Content-Type: application/json" \
  -H "X-CLMM-Internal-Token: ${CLMM_INTERNAL_TOKEN}" \
  -d @docs/runbooks/regime-engine-e2e-fixtures/clmm-execution-event.json
```
Expected first call: `HTTP/1.1 200` with body `{"schemaVersion":"1.0","ok":true,"correlationId":"e2e-verification-attempt-2026-04-19"}`.

Run the exact same curl a second time.
Expected second call: `HTTP/1.1 200` with body that indicates idempotency (regime-engine PR #15 confirmed shape: `{"schemaVersion":"1.0","ok":true,"correlationId":"e2e-verification-attempt-2026-04-19","idempotent":true}`). If the second call returns `409 CONFLICT` instead, the adapter treats that as non-retryable success per companion plan §6 decision 4 — record which shape the deployed regime-engine uses in the origin plan Unit 3 checkbox notes.

- [ ] **Step 6: Trigger a real breach in CLMM staging (or observe an existing one)**

Either:
- **(a)** Manually adjust a staging position near its bound so the next monitoring pass detects a breach, OR
- **(b)** Find the most recent `confirmed`/`failed` terminal attempt in the CLMM Railway Postgres via:

```bash
# From Railway CLMM Postgres shell:
SELECT attempt_id, lifecycle_state_kind, created_at
FROM execution_attempts
WHERE lifecycle_state_kind IN ('confirmed', 'failed')
ORDER BY created_at DESC
LIMIT 5;
```
Pick the most recent `attempt_id` as the expected correlation ID for Step 7.

- [ ] **Step 7: Verify the dual-seam terminal event landed in regime-engine**

Either by inspecting the regime-engine logs for a `POST /v1/clmm-execution-result` hit with the `attempt_id` from Step 6, OR by querying the regime-engine SQLite ledger (regime-engine Railway shell):

```bash
sqlite3 ${LEDGER_DB_PATH} \
  "SELECT correlation_id, received_at_unix_ms FROM clmm_execution_events ORDER BY id DESC LIMIT 5;"
```
Expected: at least one row whose `correlation_id` equals the `attempt_id` from Step 6.

- [ ] **Step 8: Verify CLMM API logs do NOT show the shared secret value**

In the Railway CLMM API log stream, filter for `regime-engine` or `RegimeEngine`. Spot-check that no log entry contains the value of `REGIME_ENGINE_INTERNAL_TOKEN`. Adapter log schema (per `RegimeEngineExecutionEventAdapter.ts`) logs only `correlationId`, `status`, `attempts` — never headers — but this is a defense-in-depth spot check.

- [ ] **Step 9: Record the pass**

Add a line to this plan document (Task 10 will carry the checkbox update) confirming all 8 steps above passed and the timestamp + operator name of the validation.

**Gate G4 (origin §8):** Steps 1–8 all pass → proceed to Task 9. If any step fails, stop and file a regression note before any further work.

---

### Task 9: Post-verification log (capture operator notes)

**Files:** this plan document (same file), append-only section at bottom.

- [ ] **Step 1: Append a dated "Verification Log" entry**

At the bottom of this plan file, append:

```markdown

## Verification Log

### 2026-04-__ — Unit 6 CLMM-side E2E pass

- Operator: <name>
- CLMM API Railway deploy ID: <id>
- CLMM Worker Railway deploy ID: <id>
- Regime-engine public URL used: <url>
- SR read before seed (Step 1): 404 ✓
- SR ingest (Step 2): 201, insertedCount=4 ✓
- SR read after seed (Step 3): 200, 2 supports + 2 resistances, sorted ASC ✓
- PWA renders SR section (Step 4): ✓
- Terminal-event first POST (Step 5): 200 ✓
- Terminal-event replay POST (Step 5): 200 with `idempotent: true` OR 409 — observed: <which>
- Breach-triggered terminal POST observed in regime-engine (Steps 6–7): ✓
- No secret in logs (Step 8): ✓
- G3 and G4 gates closed.

```

- [ ] **Step 2: Commit**

```bash
git add docs/plans/2026-04-19-002-feat-clmm-regime-engine-deploy-runbook-plan.md
git commit -m "docs(runbooks): record CLMM Unit 6 E2E verification pass"
```

---

### Task 10: Update origin + companion plan checkboxes

**Files:**
- Modify: `docs/plans/2026-04-17-002-opus-clmm-regime-engine-integration-plan.md`
- Modify: `docs/plans/2026-04-19-001-feat-regime-engine-outbound-integration-plan.md`

- [ ] **Step 1: Update origin plan §8 Gates**

In `docs/plans/2026-04-17-002-opus-clmm-regime-engine-integration-plan.md`, locate the §8 gate table and append a trailing status column entry noting G3 and G4 are closed on the CLMM side. Example addition (place after the existing table):

```markdown

### Gate status — CLMM side (2026-04-__)

- G3 (CLMM): CLMM API + Worker configured with `REGIME_ENGINE_BASE_URL` and `REGIME_ENGINE_INTERNAL_TOKEN`; `/health` green; private-network reach to regime-engine confirmed (or public-URL fallback recorded). See `docs/plans/2026-04-19-002-feat-clmm-regime-engine-deploy-runbook-plan.md` Task 7.
- G4 (CLMM): One-shot E2E pass recorded. See `docs/plans/2026-04-19-002-feat-clmm-regime-engine-deploy-runbook-plan.md` §Verification Log.
- G5: unowned by this plan; operator-gated on live-wallet funding.
```

- [ ] **Step 2: Update companion plan §12 handoff**

In `docs/plans/2026-04-19-001-feat-regime-engine-outbound-integration-plan.md`, locate §12 "Documentation / Operational Notes" and add a trailing bullet:

```markdown
- [x] Unit 6 CLMM-side deploy + E2E runbook landed in `docs/plans/2026-04-19-002-feat-clmm-regime-engine-deploy-runbook-plan.md`. Railway cross-service wiring, E2E fixtures, and verification log live there.
```

- [ ] **Step 3: Verify plans reference each other**

Run:
```bash
grep -n "2026-04-19-002" docs/plans/2026-04-17-002-opus-clmm-regime-engine-integration-plan.md docs/plans/2026-04-19-001-feat-regime-engine-outbound-integration-plan.md
```
Expected: at least one match in each file.

- [ ] **Step 4: Commit**

```bash
git add docs/plans/2026-04-17-002-opus-clmm-regime-engine-integration-plan.md \
        docs/plans/2026-04-19-001-feat-regime-engine-outbound-integration-plan.md
git commit -m "docs(plans): close G3/G4 for CLMM side of Unit 6"
```

---

## 6. Verification

Running end-of-plan verification (covers all file changes Tasks 1–5 and 9–10; Task 6 already ran greps; Tasks 7–8 are operator-executed):

- [ ] `pnpm typecheck` exits 0 (no code changed; should be identical to pre-plan).
- [ ] `pnpm lint` exits 0.
- [ ] `pnpm boundaries` exits 0.
- [ ] `pnpm test` exits 0 — unchanged behavior (no source touched).
- [ ] `grep -rn "EXPO_PUBLIC_REGIME_ENGINE" apps packages` returns zero matches (origin §7 rule 4).
- [ ] `grep -rn "from '@clmm/adapters" packages/application/src` returns zero matches (origin §7 rule 3).
- [ ] `grep -n "^## " README.md` shows the new "Environment Variables" heading between "Repo Map" and "Important Docs".
- [ ] `grep -n "REGIME_ENGINE_BASE_URL" packages/adapters/.env.sample` shows a documentation comment line above the var.
- [ ] `grep -n "EXPO_PUBLIC_REGIME_ENGINE" apps/app/.env.example` shows a single match in the comment block explaining the forbidden rule (this is documentation, not a leak — rule is "forbidden in the .env file as a set var", not "the string may not appear anywhere").
- [ ] Both fixture JSON files parse without error.
- [ ] Task 7 operator checklist fully stepped through; all 9 steps marked.
- [ ] Task 8 operator checklist fully stepped through; all 8 verification steps marked and logged.
- [ ] Task 9 Verification Log entry present.
- [ ] Task 10 cross-plan references grep finds matches in both origin and companion plans.

## 7. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Railway reference-variable syntax (`${{regime-engine.RAILWAY_PRIVATE_DOMAIN}}`) changes or is unsupported in the target Railway project. | Task 7 Step 7 falls back to public URL; functional equivalence preserved per origin §6 Unit 6. |
| Operator pastes the secret into a git-tracked file by mistake. | `.env.sample` is the only regime-engine-related committed env file; real values go only into Railway dashboard. Task 1 and Task 2 never include real secrets in the committed output. |
| Regime-engine's deployed idempotent-replay response shape (200-with-idempotent vs 409) diverges from PR #15 assumption. | Companion plan §6 decision 4 already handles both shapes in the adapter. Task 8 Step 5 records which shape was observed so monitors reflect reality. |
| Boundary leak (`EXPO_PUBLIC_REGIME_ENGINE_*` or adapter import into application) introduced by a concurrent PR. | Task 6 grep gates are boundary-preservation checks; run them before committing Tasks 1–3. If they fail, stop. |
| PWA allowlist `poolId` mismatch causes silent empty state during Task 8 Step 4. | `AppModule.ts:72-74` is the single source of truth for the allowlist; Task 8 Step 4 prescribes checking the pool id against this constant. |
| Worker service left un-configured; inline controller seam posts but worker seam goes silent. | Task 7 Step 4 mandates setting vars on BOTH services; Task 7 Step 8 verifies the worker shell. |

## 8. Sources & References

- **Origin plan:** [`docs/plans/2026-04-17-002-opus-clmm-regime-engine-integration-plan.md`](2026-04-17-002-opus-clmm-regime-engine-integration-plan.md) §6 Unit 6 (CLMM-side file list, Railway runbook, E2E steps), §7 (forbidden list), §8 (gates + hard stop).
- **Companion plan (Units 4+5):** [`docs/plans/2026-04-19-001-feat-regime-engine-outbound-integration-plan.md`](2026-04-19-001-feat-regime-engine-outbound-integration-plan.md) §6 decision 4 (idempotent response shape fallback), §10 (system-wide impact — idempotency safety net), §12 (documentation/operational notes handoff).
- **Code references:**
  - `packages/adapters/src/inbound/http/AppModule.ts:63-70` — API-side env resolution.
  - `packages/adapters/src/composition/AdaptersModule.ts:66-73` — Worker-side env resolution.
  - `packages/adapters/src/outbound/regime-engine/RegimeEngineExecutionEventAdapter.ts` — adapter behavior, including idempotent-response branch.
  - `packages/adapters/src/outbound/regime-engine/CurrentSrLevelsAdapter.ts:13-19` — disabled-warning log verifying ops visibility.
  - `packages/adapters/src/inbound/http/AppModule.ts:72-74` — single-source allowlist for SOL/USDC pool.
  - `packages/adapters/.env.sample` — backend env surface.
  - `apps/app/.env.example` — public env surface.
- **Existing deploy context:**
  - `docs/superpowers/plans/2026-04-11-deployment-web-solana-dapp-store.md` — baseline CLMM Railway deploy topology (`clmm.v2.app` + `api.clmm.v2.app`).
