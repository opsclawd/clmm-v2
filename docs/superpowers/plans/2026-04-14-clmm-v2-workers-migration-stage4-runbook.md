# Stage 4 Runbook: Pre-Cutover Cleanup, Preview Deploy, Production Cutover, Railway Teardown

> **For operators:** This runbook runs after all five M2.7 controller slices (Stage 3) have been accepted onto the skeleton branch. It deletes the dead NestJS code, deploys to a preview Workers environment, smoke-tests, flips DNS / base URLs to Cloudflare, and tears down Railway after a cool-off period.

**Goal:** Production traffic served by Cloudflare Workers + Neon + Cloudflare Queues + Cloudflare Pages. Railway fully decommissioned.

**Parent spec:** `docs/superpowers/specs/2026-04-14-clmm-v2-workers-migration-design.md` (see "Stage 4").

**Preconditions (verify before starting):**

- All four pre-migration specs on `main`.
- Stage 0 runbook completed; Neon is the live database for the still-running Railway services.
- `feat/workers-migration-skeleton` branch contains: skeleton (Stage 1), handoff doc (Stage 2), and all five M2.7 slices (Stage 3) — each slice passed its per-slice acceptance (typecheck + `git status` shows only target file + curl spot-check).
- Cloudflare account has: Workers enabled, Pages enabled, a Queue named `clmm-trigger-dlq` provisioned (DLQ for `TRIGGER_QUEUE`).
- `wrangler` CLI authenticated (`wrangler whoami` returns the right account).

---

## Part A — Pre-cutover cleanup (on skeleton branch, no production impact)

- [ ] **Step 1: Check out the skeleton branch**

  ```bash
  git checkout feat/workers-migration-skeleton
  git pull
  git status
  ```

  Expected: clean working tree.

- [ ] **Step 2: Delete NestJS controllers and bootstrap files**

  ```bash
  rm -rf packages/adapters/src/inbound/http/
  rm packages/adapters/src/AppModule.ts
  rm packages/adapters/src/main.ts
  rm packages/adapters/src/tokens.ts
  rm packages/adapters/src/transient-errors.ts
  ```

  If any of these paths don't exist, confirm against the skeleton plan — they may have already been deleted in Stage 1. Skip the ones already gone.

  Delete corresponding test files:

  ```bash
  find packages/adapters -path '*__tests__*' -name '*Controller.test.ts' -delete
  find packages/adapters -name 'AppModule.test.ts' -delete
  ```

- [ ] **Step 3: Remove NestJS dependencies from `packages/adapters/package.json`**

  Open `packages/adapters/package.json`. Remove all `@nestjs/*` entries and `reflect-metadata` from `dependencies` and `devDependencies`. The Neon + Hono dependencies were already added in Stage 1; do not re-add them.

  ```bash
  pnpm install
  ```

  Expected: lockfile updates, no errors.

- [ ] **Step 4: Full typecheck and test**

  ```bash
  pnpm typecheck
  pnpm test
  ```

  Both must pass top-to-bottom. A failure here means a Stage 3 slice left a dangling reference to the deleted controller code — find and fix before continuing.

- [ ] **Step 5: Commit the cleanup**

  ```bash
  git add -A
  git commit -m "chore: remove NestJS controllers and deps after M2.7 slice acceptance"
  git push
  ```

## Part B — Preview deploy and smoke test (Cloudflare preview envs)

- [ ] **Step 6: Deploy API worker to preview**

  ```bash
  cd workers/api
  pnpm wrangler deploy --env preview
  ```

  Save the preview URL from wrangler output as `API_PREVIEW_URL`.

- [ ] **Step 7: Deploy monitor worker to preview**

  ```bash
  cd workers/monitor
  pnpm wrangler deploy --env preview
  ```

  The monitor has no HTTP surface; success is wrangler returning without error and the cron triggers appearing in the Cloudflare dashboard.

- [ ] **Step 8: Deploy PWA to Cloudflare Pages preview**

  ```bash
  pnpm --filter @clmm/app build
  pnpm wrangler pages deploy apps/app/dist --project-name clmm-v2-app --branch preview
  ```

  Save the preview Pages URL as `APP_PREVIEW_URL`. Configure the PWA's API base URL env var to `$API_PREVIEW_URL` for this preview build (per whatever mechanism the PWA uses — `VITE_API_URL` or similar).

- [ ] **Step 9: API smoke tests**

  ```bash
  curl -sf "$API_PREVIEW_URL/health"
  curl -sf "$API_PREVIEW_URL/api/positions/<test-wallet>"
  curl -sf "$API_PREVIEW_URL/api/alerts/<test-wallet>"
  ```

  Each returns 200 with a shape that matches what the Railway NestJS API returns today. Compare a few responses side-by-side against the still-running Railway endpoint to catch subtle serialization differences.

- [ ] **Step 10: PWA end-to-end smoke test**

  Open `$APP_PREVIEW_URL` in a browser. Walk through the golden path:

  - Connect wallet (test wallet with known position).
  - Navigate to Positions tab → position list loads, matches what Railway serves.
  - Open position detail → loads cleanly.
  - Check Alerts tab → any existing alerts render.

  Network panel: all requests go to `$API_PREVIEW_URL`, not Railway. No console errors. No 4xx or 5xx.

- [ ] **Step 11: Monitor worker smoke test — breach scan cron**

  Cloudflare dashboard → monitor worker preview → Triggers → manually invoke the `*/2 * * * *` schedule.

  Watch the worker logs. Expected: a scan runs, the position snapshot reader fires, no errors. If a breach triggers for your test wallet, a `TRIGGER_QUEUE` message is enqueued (visible in Queue dashboard) and consumed by the queue consumer, which writes a `notification_events` row with `status='skipped'`.

  Verify the row:

  ```bash
  psql "$NEON_URL" -c "\
    SELECT event_id, trigger_id, status, channel, created_at \
    FROM notification_events ORDER BY created_at DESC LIMIT 5;"
  ```

  Expected: the most recent row's `status='skipped'`, `channel='none'`. **This is the intended post-spec behavior — not a bug.** If the row is missing, the queue consumer or the `DurableNotificationEventAdapter` wiring is broken.

- [ ] **Step 12: Monitor worker smoke test — reconciliation cron**

  Create or identify a pending execution attempt in Neon:

  ```bash
  psql "$NEON_URL" -c "\
    SELECT attempt_id, status, transaction_refs_json \
    FROM execution_attempts WHERE status IN ('submitted','reconciling') LIMIT 5;"
  ```

  If none exist, either submit a test execution through the PWA or skip this step with a note to re-run post-cutover. If one exists, manually invoke the `*/5 * * * *` schedule in Cloudflare dashboard. Watch logs: `reconcileExecution` fires, signature lookups deduplicated, attempt status updated.

- [ ] **Step 13: Observe preview for a stabilization period**

  Let both workers run under their natural cron cadence for ~30 minutes. Watch the Cloudflare logs dashboard and Neon query analytics. Expected: no error spikes, no connection exhaustion, no unexpected query patterns. Neon HTTP driver behavior matches local `wrangler dev`.

## Part C — Production cutover

- [ ] **Step 14: Merge skeleton branch to main**

  ```bash
  git checkout main
  git pull
  git merge --no-ff feat/workers-migration-skeleton
  git push origin main
  ```

  Use `--no-ff` so the merge is a single, reviewable commit in history.

- [ ] **Step 15: Deploy production workers**

  ```bash
  pnpm deploy:api
  pnpm deploy:monitor
  ```

  Save the production API worker URL as `API_PROD_URL`. Verify cron triggers are registered in the Cloudflare dashboard for the monitor worker.

- [ ] **Step 16: Deploy production PWA**

  ```bash
  pnpm deploy:app
  ```

  PWA production build must have its API base URL pointing at `$API_PROD_URL`. Verify by loading the deployed PWA and checking the network panel.

- [ ] **Step 17: Production smoke test (non-flip)**

  Before flipping DNS or base URLs, hit the production Workers endpoints directly:

  ```bash
  curl -sf "$API_PROD_URL/health"
  curl -sf "$API_PROD_URL/api/positions/<test-wallet>"
  ```

  If these fail, **do not flip DNS.** Fix on main, redeploy, re-verify.

- [ ] **Step 18: DNS / base URL flip**

  The exact mechanism depends on how the PWA currently addresses the Railway API. Typical:

  - If PWA uses a DNS CNAME (e.g. `api.clmm.example.com` → Railway): update the CNAME to the Cloudflare Workers route.
  - If PWA has a build-time API URL baked in: Step 16 already accomplished the flip when the new production PWA build was deployed to replace the Railway-pointing one.
  - If PWA reads a runtime config: update the config and invalidate caches.

  Whichever applies, after this step users hit Cloudflare, not Railway.

- [ ] **Step 19: Post-flip verification**

  - Load production PWA URL in a clean browser (or incognito) to bypass cached builds.
  - Walk the golden path (connect wallet, list positions, view detail, check alerts).
  - Network panel: all requests go to the Cloudflare endpoint.
  - Cloudflare logs show traffic arriving.
  - Neon query analytics show activity from the new worker.
  - Railway API logs show traffic dropping to zero (or only stray health checks).

- [ ] **Step 20: Stop Railway services (but do not delete)**

  Railway → API service → Stop. Railway → Worker service → Stop.

  **Do not delete the services or the Postgres add-on.** They remain stopped but restorable for 72 hours as a rollback target.

## Part D — Cool-off and teardown (72 hours after Step 20)

- [ ] **Step 21: After 72 hours, confirm no regressions**

  Review Cloudflare logs, Neon query patterns, and any error tracking for the cool-off window. Check for:

  - Forgotten integrations or webhooks that pointed at the Railway URL and have been failing silently.
  - Any user report of the app being broken.
  - Any new `notification_events` rows with unexpected status values.

  If anything surfaces, fix before tearing down Railway.

- [ ] **Step 22: Tear down Railway**

  Railway → delete API service. Railway → delete Worker service. Railway → delete Postgres add-on (data is in Neon; the Railway Postgres has been idle for 72+ hours).

  Railway → delete project.

- [ ] **Step 23: Clean up local artifacts**

  ```bash
  rm -f /tmp/railway-schema-baseline.sql
  rm -f /tmp/railway-rowcounts-baseline.txt
  rm -f /tmp/neon-schema.sql
  rm -f /tmp/neon-rowcounts.txt
  rm -f /tmp/railway-dump.pgcustom
  ```

  Revoke or rotate the `RAILWAY_PG_URL` credential if it was stored anywhere.

- [ ] **Step 24: Archive the migration specs**

  Optional housekeeping — move the Stage 0 and Stage 4 runbooks, the migration design, and the M2.7 handoff doc to an `archive/` subdirectory under `docs/superpowers/` so they stop appearing in active-plans searches. The content stays in git history regardless.

---

## Rollback

### Rollback before Step 18 (DNS flip)

Nothing has changed for users. Fix the issue on the skeleton branch or on main, redeploy, re-run smoke tests. Railway is still running and serving nobody because nobody was routed there yet.

### Rollback after Step 18, before Step 22 (teardown)

This is the primary failure mode the 72-hour cool-off exists for.

1. Revert the DNS / base URL change from Step 18. PWA traffic returns to Railway.
2. Railway → API service → Start. Railway → Worker service → Start. Services come up against Neon (which they were already configured for since Stage 0).
3. Verify health endpoint and golden path against the restored Railway URL.
4. Diagnose what failed in Cloudflare. Fix on main, redeploy, re-attempt Steps 17–19.

Data is safe throughout — Neon is shared, both deployments read/write the same database. There is no data divergence risk during rollback.

### Rollback after Step 22 (teardown complete)

Railway is gone. Recovery means reprovisioning Railway services from scratch using git history and the pre-migration code (checkout a commit from before the skeleton merge). This is expensive and unlikely to be needed — any production bug discovered more than 72 hours post-cutover is fixed forward on Workers, not by resurrecting Railway. If this situation arises, treat it as a new incident, not a routine rollback.

---

## What this runbook deliberately does not cover

- **Canary / gradual rollout.** Per the design spec: ~100 req/day doesn't justify split-traffic infrastructure. Preview smoke test is the rollout.
- **Per-slice CI verification.** Already handled in Stage 3 as each slice was accepted onto the skeleton branch.
- **Data migration.** Zero. The database has been Neon since Stage 0. Stage 4 is a pure code + DNS flip.
- **Schema changes.** Any schema change owned by the four pre-migration specs ran against Neon between Stage 0 Step 17 and Stage 1. This runbook assumes the schema is already in its post-spec state.
