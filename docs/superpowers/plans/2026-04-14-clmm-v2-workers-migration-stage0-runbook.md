# Stage 0 Runbook: Neon Provisioning + Railway Data Cutover

> **For operators:** This runbook executes before any of the four pre-migration specs or the Workers skeleton. It moves the live database from Railway Postgres to Neon while the Railway NestJS API + pg-boss worker keep running. No code changes in this stage — only a `DATABASE_URL` rotation and a one-time data copy.

**Goal:** Neon is the live Postgres for the existing Railway-hosted system, verified healthy, before any spec migrations run.

**Why this stage exists:** The Workers migration (Stage 1–4) must be code-only at cutover. Combining a data-layer move with the Workers flip would stack the two riskiest changes into one window. Doing the data move first, against the still-running NestJS stack, isolates and verifies it independently.

**Parent spec:** `docs/superpowers/specs/2026-04-14-clmm-v2-workers-migration-design.md` (see "Stage 0").

**Estimated downtime:** One short maintenance window (a few minutes) to stop writes, copy data, and rotate `DATABASE_URL`. The app is ~100 req/day single-user, so "maintenance window" can be a quiet evening.

---

## Pre-flight

- [ ] **Step 1: Capture current Railway Postgres connection string**

  Open Railway project → Postgres service → Variables → copy `DATABASE_URL`. Save as `RAILWAY_PG_URL` in a local shell that you will keep open for the duration of this runbook. Do not commit.

- [ ] **Step 2: Record current schema and row counts as baseline**

  ```bash
  pg_dump --schema-only "$RAILWAY_PG_URL" > /tmp/railway-schema-baseline.sql
  psql "$RAILWAY_PG_URL" -c "\
    SELECT schemaname, relname, n_live_tup \
    FROM pg_stat_user_tables ORDER BY relname;" > /tmp/railway-rowcounts-baseline.txt
  ```

  These are verification artifacts for Step 10. Keep both files until Stage 4 closes.

- [ ] **Step 3: Confirm the four pre-migration specs have NOT yet run their migrations**

  ```bash
  psql "$RAILWAY_PG_URL" -c "\
    SELECT table_name FROM information_schema.tables \
    WHERE table_name IN ('notification_events', 'wallet_position_ownership');"
  ```

  Expected: zero rows. If either table exists, a spec has already run against Railway. Stop and reconcile before continuing — the sequencing assumption of this stage is broken.

## Neon provisioning

- [ ] **Step 4: Create the Neon project**

  Neon console → New project. Region: pick the region closest to where Cloudflare Workers will run (US East is a safe default; Workers route regardless). Postgres version: match Railway's version (check in Railway Postgres service info). Name: `clmm-v2-prod`.

  Save the pooled connection string (shown as "Pooled connection" in Neon dashboard) as `NEON_URL`. This is the string that will become the new `DATABASE_URL`.

- [ ] **Step 5: Verify Neon is reachable**

  ```bash
  psql "$NEON_URL" -c "SELECT version();"
  ```

  Expected: Postgres version string. If this fails, fix connectivity before proceeding.

## Data copy

- [ ] **Step 6: Announce maintenance window, stop Railway services**

  Railway → API service → Deployments → Stop. Railway → Worker service → Deployments → Stop.

  Wait 30 seconds for in-flight requests to drain and any running pg-boss jobs to settle.

  Verify no active connections:

  ```bash
  psql "$RAILWAY_PG_URL" -c "\
    SELECT count(*) FROM pg_stat_activity \
    WHERE datname = current_database() AND pid <> pg_backend_pid();"
  ```

  Expected: 0 (or only your own psql session). If non-zero, wait another 30s and re-check.

- [ ] **Step 7: Dump Railway Postgres**

  ```bash
  pg_dump \
    --no-owner \
    --no-privileges \
    --format=custom \
    --file=/tmp/railway-dump.pgcustom \
    "$RAILWAY_PG_URL"
  ```

  Verify the dump is non-empty:

  ```bash
  ls -lh /tmp/railway-dump.pgcustom
  ```

  Expected: non-zero file size, typically a few MB for this project.

- [ ] **Step 8: Restore into Neon**

  ```bash
  pg_restore \
    --no-owner \
    --no-privileges \
    --dbname="$NEON_URL" \
    /tmp/railway-dump.pgcustom
  ```

  Non-fatal warnings about extensions or ownership are expected and safe to ignore on Neon. Fatal errors stop the runbook — investigate before continuing.

- [ ] **Step 9: Verify schema parity**

  ```bash
  pg_dump --schema-only "$NEON_URL" > /tmp/neon-schema.sql
  diff /tmp/railway-schema-baseline.sql /tmp/neon-schema.sql
  ```

  Expected: only trivial differences (ownership, comment metadata). No missing tables, columns, or indexes.

- [ ] **Step 10: Verify row-count parity**

  ```bash
  psql "$NEON_URL" -c "\
    SELECT schemaname, relname, n_live_tup \
    FROM pg_stat_user_tables ORDER BY relname;" > /tmp/neon-rowcounts.txt
  diff /tmp/railway-rowcounts-baseline.txt /tmp/neon-rowcounts.txt
  ```

  `n_live_tup` is an estimate and may differ slightly — that's fine. If any table is empty on Neon but populated on Railway, stop and re-run the restore.

## `DATABASE_URL` rotation

- [ ] **Step 11: Update Railway service environment variables**

  Railway → API service → Variables → set `DATABASE_URL` = `$NEON_URL`. Repeat for the Worker service. Do **not** delete the Railway Postgres add-on yet — it is the rollback target for the next 72 hours.

- [ ] **Step 12: Restart Railway services**

  Railway → API service → Deployments → Restart. Same for Worker. Watch the startup logs for connection errors. Neon uses a different host; a typo in Step 11 will surface here immediately.

- [ ] **Step 13: Verify the live app against Neon**

  ```bash
  curl -sf https://<railway-api-host>/health
  ```

  Expected: 200. Then exercise a read path that hits Postgres — e.g., load the app, connect a wallet, list positions. Confirm data appears (it should, since it was just copied from Railway).

  Watch Railway API logs for 60 seconds. Expected: no connection errors, no `ECONNREFUSED`, no query timeouts.

- [ ] **Step 14: Confirm the worker is also healthy**

  Watch Railway Worker logs through one breach-scan tick (runs every 5 min per current cadence). Expected: a scan executes, no DB errors.

- [ ] **Step 15: End maintenance window**

  The Railway-hosted system is now running against Neon. Users are unaware of the change.

## Post-cutover

- [ ] **Step 16: Snapshot Neon as "pre-spec baseline"**

  Neon console → Branches → Create branch from current main. Name: `pre-spec-migrations-YYYY-MM-DD`. This is the restore target if any of the four pre-migration specs corrupt the schema.

- [ ] **Step 17: Stage 0 is complete. Unblock Stage 0 (specs) and Stage 1 (skeleton)**

  The four pre-migration specs now run their drizzle migrations against Neon directly (via `pnpm db:migrate` in their respective implementation plans). No more Railway Postgres writes.

---

## Rollback

**If Steps 6–15 go wrong** (data copy corrupt, Neon unreachable, Railway app unhealthy against Neon):

1. Railway → API + Worker services → revert `DATABASE_URL` to the original Railway Postgres string.
2. Restart both services.
3. Verify health endpoint + position list.
4. Delete Neon project (or keep for a re-attempt). Do not retry the runbook until the failure mode is understood.

**If a spec migration later corrupts Neon** (Stage 0 is technically complete by then, but this runbook's baseline branch is the safety net):

1. Neon console → Branches → `pre-spec-migrations-YYYY-MM-DD` → Restore to main.
2. Re-run the spec migration with the fix.

## What this runbook deliberately does not cover

- **Drizzle migrations for the four specs.** Those run after Step 17, owned by each spec's implementation plan. This runbook leaves Neon in a state where `pnpm db:migrate` from any spec branch just works.
- **Cloudflare Workers provisioning.** That's Stage 1 skeleton territory. Neon is the only infrastructure this stage provisions.
- **Decommissioning Railway Postgres.** Kept live for 72 hours *after Stage 4 cutover*, not after this stage. Teardown is a single line in the Stage 4 runbook.
