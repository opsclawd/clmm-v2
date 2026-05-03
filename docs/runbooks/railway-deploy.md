# Railway Deploy Runbook (CLMM Backend)

Canonical deploy ordering and schema-readiness contract for the CLMM
backend services on Railway.

## Service topology

Two Railway services, both deploying from this repo:

| Service       | Role                          | Owns migrations? |
|---------------|-------------------------------|------------------|
| `clmm-api`    | NestJS + Fastify HTTP server  | **Yes**          |
| `clmm-worker` | pg-boss job runner            | No               |

The API is the sole migration owner. The worker MUST NOT run
migrations and MUST refuse to start against missing schema.

## Config source

**Current path: A (committed config).**

API service config:    `packages/adapters/railway.api.toml`
Worker service config: `packages/adapters/railway.worker.toml`

In the Railway dashboard, each service's "Config-as-code path" points
at its respective file.

### Locked dashboard fields

The following fields are owned by the committed config files. Operators
MUST NOT hand-edit them in the dashboard — changes will either be
ignored on next deploy (when the file overrides) or silently drift
from review.

API service:
- `preDeployCommand`
- `startCommand`
- `healthcheckPath`
- `healthcheckTimeout`
- `restartPolicyType`

Worker service:
- `startCommand`
- `restartPolicyType`

## Deploy ordering contract

Per merged commit, Railway performs:

```
1. Build code (both services in parallel).
2. clmm-api preDeployCommand runs `pnpm db:migrate`
   - On success: API deploy continues.
   - On failure: API deploy aborts; old API stays serving.
3. clmm-api startCommand boots Nest+Fastify on $PORT.
4. /health is polled.
   - Schema OK → 200 → Railway routes traffic to new pod.
   - Schema missing → 503 → Railway holds traffic; loops until 200.
5. clmm-worker startCommand runs `start:worker`.
   - Schema readiness gate runs BEFORE pg-boss attaches handlers.
   - Schema OK → pg-boss starts; worker is healthy.
   - Schema missing → fatal log + exit 1 → Railway restarts; loops.
```

If clmm-worker deploys before clmm-api migrates (worker is faster, or
API migration is delayed), the worker's gate keeps it in a restart
loop, and no jobs are processed against the half-migrated DB.

## Schema readiness behavior

Both probes derive their required-table list from
`packages/adapters/src/outbound/storage/schema/index.ts` via Drizzle's
`is(value, PgTable)` predicate. **Adding a schema file without
generating and running a corresponding migration WILL fail deploys.
This is intended.**

### API: `GET /health`

```
200 { "status": "ok" }
   schema verified

503 { "status": "not_ready", "missing": ["wallet_challenges", ...] }
   at least one expected table is absent in the DB
```

Railway healthcheck retries until 200. `restartPolicyType=ON_FAILURE`
means a pod that boots and answers 503 stays alive — Railway just
keeps marking it unhealthy until schema lands.

### Worker: bootstrap gate

```
log: Worker: schema readiness OK; pg-boss starting
   schema verified, pg-boss attaches handlers

log (stderr, JSON):
  { "level": "fatal",
    "message": "Worker: schema readiness check failed; refusing to start",
    "missing": [...],
    "timestamp": "..." }
process exits 1
   Railway restarts. Loop continues until schema lands.
```

## Manual post-deploy verification

Replace `$BFF_BASE_URL` with the Railway-assigned API URL, and
`<valid-wallet-address>` with a real Solana wallet that owns at least
one supported position.

```bash
curl -i $BFF_BASE_URL/health
# Expect: HTTP/1.1 200 OK
#         {"status":"ok"}

curl -i -X POST $BFF_BASE_URL/wallets/<valid-wallet-address>/challenge
# Expect: HTTP/1.1 200 OK
#         {"walletId":"...","nonce":"...","expiresAt":...,"message":"..."}
```

If `/health` returns 503, inspect the response body's `missing` list:
those tables exist in the Drizzle schema but not in the DB. Either
the migration didn't run (check Railway preDeployCommand logs) or it
ran against the wrong `DATABASE_URL` (check that the API service's
`DATABASE_URL` env var matches the one used by the migration step).

## Rollback

Drizzle does not auto-down. To revert a bad migration:

1. Write a new forward migration that undoes the change.
2. Commit and push.
3. Railway deploy runs the new forward migration in `preDeployCommand`.

Do **not** roll back via Railway-only redeploy of the prior commit:
the migration journal advances forward-only, and the old code may
expect tables/columns that the new migration removed or renamed.

## Anti-patterns (do not adopt)

These patterns are explicitly rejected. Each lists the failure mode.

- `pnpm db:migrate && node dist/...` as the start command
  - Multiple replicas race the same migration on every deploy/restart.
  - API and worker race each other.
  - Long migrations cause healthcheck loops on every pod restart.
  - Every process restart becomes a schema mutation attempt.

- Worker running `db:migrate` "as a backup"
  - Defeats the single-migration-owner rule.
  - Reintroduces the race the worker gate exists to prevent.

- Hardcoded `REQUIRED_TABLES` allowlist or env var to weaken the gate
  - Reintroduces drift: someone adds a schema, forgets the list,
    deploy looks healthy. Exact bug class this whole runbook prevents.
