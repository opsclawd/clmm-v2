# CLMM V2 — Cloudflare Workers Migration Reference Implementation

> **Historical:** initial migration reference produced before the pre-migration specs
> (`walletid-contamination-fix`, `notification-durable-intent`, `solana-read-path-efficiency`,
> `transaction-reference-step-projection`) landed. Superseded by
> `docs/superpowers/specs/2026-04-14-clmm-v2-workers-migration-design.md` as the authoritative
> migration design.
>
> Retained because Section 1 (Cloudflare Workers runtime banned/allowed list) remains accurate
> as a quick-reference, and Section 13 (replication prompt for cheaper models) informed the
> forbidden list in the M2.7 handoff doc. Sections 3-5 (composition roots, routes, monitor worker)
> describe pre-spec adapter shapes and should not be used as an implementation reference —
> consult the authoritative design doc above.

## Purpose

This file is the **source of truth** for migrating CLMM V2 from NestJS on Railway
to Hono on Cloudflare Workers with Neon Postgres. Every pattern shown here is
verified against the Cloudflare Workers runtime constraints. Cheaper models
(Qwen 3.6, MiniMax) should replicate these patterns exactly — do not deviate.

---

## ⚠️ CLOUDFLARE WORKERS RUNTIME CONSTRAINTS — READ FIRST

These will bite you if you don't internalize them:

```
BANNED in Workers runtime:
- import net from 'node:net'           // No TCP sockets
- import fs from 'node:fs'            // No filesystem
- import crypto from 'node:crypto'     // Use Web Crypto API instead
- import { Pool } from 'pg'           // No TCP-based Postgres drivers
- import PgBoss from 'pg-boss'        // Requires persistent TCP connection
- import { NestFactory } from '@nestjs/core'  // Not compatible, too heavy
- process.env.ANYTHING               // Use env bindings from handler args
- Buffer.from() without polyfill      // Use Uint8Array or import from buffer polyfill
- setTimeout/setInterval (long-running) // Workers are request-scoped

ALLOWED:
- fetch()                             // Native, no import needed
- Web Crypto API (crypto.subtle)      // Global, no import needed
- @neondatabase/serverless            // HTTP-based Postgres driver
- drizzle-orm/neon-http               // Drizzle's Neon HTTP adapter
- hono                                // ~14KB, built for Workers
- @solana/kit                         // Pure fetch-based RPC calls
- TextEncoder / TextDecoder           // Global
- structuredClone()                   // Global
- URL, URLSearchParams                // Global
```

---

## 1. Wrangler Configuration

This replaces your Railway deployment config entirely. You need **two Worker scripts**:
one for the API, one for the cron monitor + queue consumer.

### `wrangler.jsonc` (root — static assets for PWA)

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "clmm-v2-app",
  "compatibility_date": "2026-04-12",
  "assets": {
    "directory": "./apps/app/dist"
  }
}
```

### `workers/api/wrangler.jsonc`

```jsonc
{
  "$schema": "../../node_modules/wrangler/config-schema.json",
  "name": "clmm-v2-api",
  "main": "./src/index.ts",
  "compatibility_date": "2026-04-12",
  "compatibility_flags": ["nodejs_compat"],

  // Queue producer binding — API can enqueue breach events
  "queues": {
    "producers": [
      {
        "binding": "BREACH_QUEUE",
        "queue": "clmm-breach-events"
      }
    ]
  },

  // Environment variables — set via `wrangler secret put`
  // DATABASE_URL: Neon connection string
  // SOLANA_RPC_URL: Helius/Triton RPC endpoint
  // EXPO_PUSH_TOKEN: For notifications
}
```

### `workers/monitor/wrangler.jsonc`

```jsonc
{
  "$schema": "../../node_modules/wrangler/config-schema.json",
  "name": "clmm-v2-monitor",
  "main": "./src/index.ts",
  "compatibility_date": "2026-04-12",
  "compatibility_flags": ["nodejs_compat"],

  // Cron triggers — free tier allows up to 5
  "triggers": {
    "crons": [
      "*/2 * * * *"
    ]
  },

  // Queue producer (to enqueue breach events) + consumer (to process them)
  "queues": {
    "producers": [
      {
        "binding": "BREACH_QUEUE",
        "queue": "clmm-breach-events"
      }
    ],
    "consumers": [
      {
        "queue": "clmm-breach-events",
        "max_batch_size": 1,
        "max_retries": 3,
        "dead_letter_queue": "clmm-breach-dlq"
      }
    ]
  }
}
```

---

## 2. Neon Serverless Driver + Drizzle ORM Setup

This replaces `packages/adapters/src/outbound/storage/` connection logic.

### `packages/adapters/src/outbound/storage/neon-client.ts`

```typescript
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

/**
 * CRITICAL: In Cloudflare Workers, you cannot create a long-lived
 * database connection at module scope. The connection must be created
 * per-request using the env binding.
 *
 * This factory is called in the composition root for each request.
 */
export function createDatabase(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}

export type Database = ReturnType<typeof createDatabase>;
```

### Why not `drizzle-orm/neon-serverless` (WebSocket mode)?

The `@neondatabase/serverless` package offers two modes:
- **HTTP mode** (`neon()`) — stateless, one HTTP request per query. Perfect for Workers.
- **WebSocket mode** (`Pool()`) — persistent connection, supports transactions natively.

Use **HTTP mode**. Workers don't maintain persistent connections between requests.
If you need transactions, use Neon's `sql.transaction()`:

```typescript
import { neon } from '@neondatabase/serverless';

const sql = neon(env.DATABASE_URL);

// Transaction via HTTP (Neon batches these into a single round-trip)
const result = await sql.transaction([
  sql`UPDATE execution_attempts SET status = 'submitted' WHERE id = ${id}`,
  sql`INSERT INTO history_events (position_id, event_type) VALUES (${posId}, 'execution_submitted')`,
]);
```

### Package changes for `packages/adapters/package.json`

```diff
- "pg": "^8.x",
- "pg-boss": "^9.x",
- "@nestjs/core": "^10.x",
- "@nestjs/common": "^10.x",
- "@nestjs/platform-express": "^10.x",
+ "@neondatabase/serverless": "^0.10.0",
+ "drizzle-orm": "^0.36.0",      // keep, just change the dialect import
+ "hono": "^4.6.0",
```

---

## 3. Composition Root (replaces NestJS DI Container)

This is the most conceptually important file. NestJS wired your dependencies
via decorators and modules. Now you do it with plain functions.

### `workers/api/src/composition.ts`

```typescript
import { createDatabase } from '@clmm/adapters/outbound/storage/neon-client';
import { OffChainHistoryStorageAdapter } from '@clmm/adapters/outbound/storage/OffChainHistoryStorageAdapter';
import { OperationalStorageAdapter } from '@clmm/adapters/outbound/storage/OperationalStorageAdapter';
import { OrcaPositionReadAdapter } from '@clmm/adapters/outbound/solana-position-reads/OrcaPositionReadAdapter';
import { JupiterQuoteAdapter } from '@clmm/adapters/outbound/swap-execution/JupiterQuoteAdapter';

// Use-case imports — these depend only on port interfaces, not adapters
import { GetPositionsUseCase } from '@clmm/application/use-cases/positions/GetPositionsUseCase';
import { GetExecutionPreviewUseCase } from '@clmm/application/use-cases/previews/GetExecutionPreviewUseCase';
import { GetHistoryUseCase } from '@clmm/application/use-cases/history/GetHistoryUseCase';

/**
 * Env bindings from wrangler — declare the shape here.
 * These replace process.env entirely.
 */
export interface Env {
  DATABASE_URL: string;
  SOLANA_RPC_URL: string;
  EXPO_PUSH_TOKEN?: string;
  BREACH_QUEUE: Queue<BreachEvent>;  // Cloudflare Queue binding
}

export interface BreachEvent {
  positionId: string;
  breachDirection: 'upper' | 'lower';
  detectedAt: string;  // ISO timestamp
}

/**
 * Build the full dependency graph for a single request.
 * This is cheap — no DI container, no reflection, just function calls.
 * Called once per request in the Hono middleware.
 */
export function buildDependencies(env: Env) {
  // Infrastructure
  const db = createDatabase(env.DATABASE_URL);

  // Outbound adapters (implement port interfaces)
  const historyStorage = new OffChainHistoryStorageAdapter(db);
  const operationalStorage = new OperationalStorageAdapter(db);
  const positionReader = new OrcaPositionReadAdapter(env.SOLANA_RPC_URL);
  const quoteAdapter = new JupiterQuoteAdapter();

  // Use cases (depend on port interfaces, receive adapters)
  const getPositions = new GetPositionsUseCase(operationalStorage, positionReader);
  const getPreview = new GetExecutionPreviewUseCase(operationalStorage, quoteAdapter);
  const getHistory = new GetHistoryUseCase(historyStorage);

  return {
    db,
    getPositions,
    getPreview,
    getHistory,
    operationalStorage,
    positionReader,
    breachQueue: env.BREACH_QUEUE,
  };
}

export type Dependencies = ReturnType<typeof buildDependencies>;
```

### Key difference from NestJS

In NestJS, dependencies are singletons that live for the process lifetime.
In Workers, they're created per-request and garbage collected after response.
This is **fine** because:
- Neon HTTP driver is stateless (no connection pool to manage)
- Solana RPC calls are stateless fetch requests
- Your domain objects are pure and have no state

---

## 4. Hono API Worker — Entry Point + Controller Migration

### `workers/api/src/index.ts`

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { buildDependencies, Env } from './composition';
import { positionsRoutes } from './routes/positions';
import { previewsRoutes } from './routes/previews';
import { historyRoutes } from './routes/history';
import { executionRoutes } from './routes/execution';

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use('*', cors());
app.use('*', logger());

// Health check
app.get('/health', (c) => c.json({ status: 'ok', runtime: 'cloudflare-workers' }));

// Mount route groups
app.route('/api/positions', positionsRoutes);
app.route('/api/previews', previewsRoutes);
app.route('/api/history', historyRoutes);
app.route('/api/execution', executionRoutes);

export default app;
```

### `workers/api/src/routes/positions.ts` — Full Controller Migration Example

This is the pattern to replicate for every NestJS controller.

```typescript
import { Hono } from 'hono';
import { buildDependencies, Env } from '../composition';

/**
 * PATTERN: Each route file creates a Hono instance typed with Env bindings.
 * Dependencies are built per-request inside each handler.
 *
 * NestJS equivalent being replaced:
 *   @Controller('positions')
 *   export class PositionsController {
 *     constructor(private readonly getPositions: GetPositionsUseCase) {}
 *
 *     @Get(':walletId')
 *     async getByWallet(@Param('walletId') walletId: string) { ... }
 *   }
 */

export const positionsRoutes = new Hono<{ Bindings: Env }>();

// GET /api/positions/:walletId
positionsRoutes.get('/:walletId', async (c) => {
  const walletId = c.req.param('walletId');
  const deps = buildDependencies(c.env);

  try {
    const result = await deps.getPositions.execute({ walletId });
    return c.json(result);
  } catch (error) {
    // Your application layer should throw typed errors.
    // Map them to HTTP status codes here.
    if (error instanceof PositionNotFoundError) {
      return c.json({ error: 'Position not found' }, 404);
    }
    console.error('Unexpected error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// GET /api/positions/:walletId/:positionId
positionsRoutes.get('/:walletId/:positionId', async (c) => {
  const { walletId, positionId } = c.req.param();
  const deps = buildDependencies(c.env);

  const result = await deps.getPositions.executeOne({ walletId, positionId });
  if (!result) {
    return c.json({ error: 'Position not found' }, 404);
  }
  return c.json(result);
});

// POST /api/positions/monitor
positionsRoutes.post('/monitor', async (c) => {
  const body = await c.req.json<{ walletId: string; positionId: string }>();
  const deps = buildDependencies(c.env);

  const result = await deps.operationalStorage.enableMonitoring(
    body.walletId,
    body.positionId,
  );
  return c.json(result, 201);
});
```

### Migration checklist for each NestJS controller:

```
For each file in packages/adapters/src/inbound/http/:

1. @Controller('path')          → new Hono<{ Bindings: Env }>()
2. constructor(private dep)     → buildDependencies(c.env) inside handler
3. @Get('/:param')              → routes.get('/:param', async (c) => { ... })
4. @Post()                      → routes.post('/', async (c) => { ... })
5. @Param('x')                  → c.req.param('x')
6. @Body()                      → await c.req.json<Type>()
7. @Query('x')                  → c.req.query('x')
8. @Headers('x')                → c.req.header('x')
9. @HttpCode(201)               → return c.json(data, 201)
10. Throw HttpException(4xx)    → return c.json({ error }, statusCode)
11. Guards/interceptors          → Hono middleware (app.use)
12. @Module() wiring            → DELETE, handled by composition.ts
```

---

## 5. Cron Monitor Worker (replaces pg-boss worker)

### `workers/monitor/src/index.ts`

```typescript
import { buildMonitorDependencies, Env, BreachEvent } from './composition';

/**
 * This Worker handles TWO event types:
 * 1. scheduled — Cron trigger every 2 minutes, checks positions for breaches
 * 2. queue    — Consumes breach events and runs exit preparation
 *
 * These are separate entry points in the same Worker script.
 */
export default {
  /**
   * CRON TRIGGER HANDLER
   * Replaces: pg-boss 'check-positions' recurring job
   *
   * Runs every 2 minutes. Fetches all monitored positions,
   * checks range state, enqueues breach events if detected.
   */
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    const deps = buildMonitorDependencies(env);

    // 1. Get all actively monitored positions
    const monitoredPositions = await deps.operationalStorage.getMonitoredPositions();

    if (monitoredPositions.length === 0) return;

    // 2. Check each position's range state via Solana RPC
    const checks = await Promise.allSettled(
      monitoredPositions.map(async (position) => {
        const rangeState = await deps.positionReader.checkRangeState(
          position.positionMintAddress,
        );

        // 3. If out of range, evaluate breach using domain logic
        if (rangeState.isOutOfRange) {
          const breachEpisode = deps.breachEvaluator.evaluate(
            position,
            rangeState,
          );

          if (breachEpisode.shouldTriggerExit) {
            // 4. Enqueue breach event to Cloudflare Queue
            await env.BREACH_QUEUE.send({
              positionId: position.id,
              breachDirection: breachEpisode.direction,
              detectedAt: new Date().toISOString(),
            } satisfies BreachEvent);

            // 5. Record the trigger in storage
            await deps.operationalStorage.recordExitTrigger(
              position.id,
              breachEpisode,
            );
          }
        }
      }),
    );

    // Log failures but don't throw — we don't want to retry the whole batch
    const failures = checks.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      console.error(`${failures.length}/${checks.length} position checks failed`);
    }
  },

  /**
   * QUEUE CONSUMER HANDLER
   * Replaces: pg-boss 'process-breach' job handler
   *
   * Receives breach events, prepares execution preview,
   * sends push notification to user for approval.
   */
  async queue(
    batch: MessageBatch<BreachEvent>,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    const deps = buildMonitorDependencies(env);

    for (const message of batch.messages) {
      try {
        const event = message.body;

        // 1. Build execution preview using domain exit policy
        const preview = await deps.prepareExitPreview.execute({
          positionId: event.positionId,
          breachDirection: event.breachDirection,
        });

        // 2. Persist the preview for the user to review in-app
        await deps.operationalStorage.saveExecutionPreview(
          event.positionId,
          preview,
        );

        // 3. Send push notification
        if (env.EXPO_PUSH_TOKEN) {
          await sendExpoPushNotification(env.EXPO_PUSH_TOKEN, {
            title: 'Position Out of Range',
            body: `Your ${preview.poolPair} position breached ${event.breachDirection} bound. Exit preview ready.`,
            data: { positionId: event.positionId },
          });
        }

        // Acknowledge the message
        message.ack();
      } catch (error) {
        console.error(`Failed to process breach for ${message.body.positionId}:`, error);
        message.retry();
      }
    }
  },
};

/**
 * Expo push notification via their HTTP API.
 * No SDK needed — it's just a fetch call.
 */
async function sendExpoPushNotification(
  pushToken: string,
  notification: { title: string; body: string; data?: Record<string, string> },
): Promise<void> {
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: pushToken,
      sound: 'default',
      ...notification,
    }),
  });
}
```

### `workers/monitor/src/composition.ts`

```typescript
import { createDatabase } from '@clmm/adapters/outbound/storage/neon-client';
import { OperationalStorageAdapter } from '@clmm/adapters/outbound/storage/OperationalStorageAdapter';
import { OrcaPositionReadAdapter } from '@clmm/adapters/outbound/solana-position-reads/OrcaPositionReadAdapter';
import { JupiterQuoteAdapter } from '@clmm/adapters/outbound/swap-execution/JupiterQuoteAdapter';
import { BreachEvaluationService } from '@clmm/domain/triggers/BreachEvaluationService';
import { DirectionalExitPolicyService } from '@clmm/domain/exit-policy/DirectionalExitPolicyService';
import { PrepareExitPreviewUseCase } from '@clmm/application/use-cases/previews/PrepareExitPreviewUseCase';

export interface Env {
  DATABASE_URL: string;
  SOLANA_RPC_URL: string;
  EXPO_PUSH_TOKEN?: string;
  BREACH_QUEUE: Queue<BreachEvent>;
}

export interface BreachEvent {
  positionId: string;
  breachDirection: 'upper' | 'lower';
  detectedAt: string;
}

export function buildMonitorDependencies(env: Env) {
  const db = createDatabase(env.DATABASE_URL);

  const operationalStorage = new OperationalStorageAdapter(db);
  const positionReader = new OrcaPositionReadAdapter(env.SOLANA_RPC_URL);
  const quoteAdapter = new JupiterQuoteAdapter();

  // Domain services (pure, no external deps)
  const exitPolicy = new DirectionalExitPolicyService();
  const breachEvaluator = new BreachEvaluationService();

  // Use cases
  const prepareExitPreview = new PrepareExitPreviewUseCase(
    operationalStorage,
    positionReader,
    quoteAdapter,
    exitPolicy,
  );

  return {
    db,
    operationalStorage,
    positionReader,
    breachEvaluator,
    prepareExitPreview,
  };
}
```

---

## 6. Drizzle Migration Command Update

### `packages/adapters/drizzle.config.ts`

```typescript
import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit still runs in Node.js (local machine, not Workers).
 * It uses the standard postgres driver for migrations.
 * Only the RUNTIME code uses @neondatabase/serverless.
 */
export default defineConfig({
  schema: './src/outbound/storage/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // Neon connection string — works with drizzle-kit push/migrate
    url: process.env.DATABASE_URL!,
  },
});
```

Drizzle Kit runs on your local machine or in CI — it can use the standard
`postgres` driver over TCP. Only the Worker runtime code needs the HTTP driver.
Your existing schema files are unchanged.

```bash
# Fresh start on Neon:
DATABASE_URL="postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require" \
  pnpm db:migrate
```

---

## 7. Monorepo / Turborepo Config Changes

### `turbo.json` additions

```jsonc
{
  "tasks": {
    "deploy:api": {
      "dependsOn": ["^build"],
      "cache": false
    },
    "deploy:monitor": {
      "dependsOn": ["^build"],
      "cache": false
    },
    "deploy:app": {
      "dependsOn": ["^build"],
      "cache": false
    }
  }
}
```

### Root `package.json` script additions

```jsonc
{
  "scripts": {
    "deploy:api": "cd workers/api && wrangler deploy",
    "deploy:monitor": "cd workers/monitor && wrangler deploy",
    "deploy:app": "wrangler deploy",
    "dev:api": "cd workers/api && wrangler dev",
    "dev:monitor": "cd workers/monitor && wrangler dev"
  }
}
```

---

## 8. What to DELETE

```
REMOVE entirely:
- packages/adapters/src/inbound/http/     (NestJS controllers → now in workers/api/src/routes/)
- packages/adapters/src/inbound/jobs/     (pg-boss handlers → now in workers/monitor/)
- packages/adapters/src/composition/      (NestJS modules → now workers/*/src/composition.ts)
- Any NestJS main.ts / bootstrap files
- Any pg-boss configuration or queue definitions

REMOVE from package.json:
- @nestjs/core, @nestjs/common, @nestjs/platform-express
- @nestjs/config, @nestjs/swagger (if present)
- pg-boss
- pg (the TCP driver)
- express / @types/express
- Any NestJS-specific testing utilities (@nestjs/testing)

KEEP:
- packages/domain/          (untouched, zero changes)
- packages/application/     (untouched, zero changes)
- packages/adapters/src/outbound/  (change only the DB connection factory)
- packages/ui/              (untouched)
- packages/config/          (untouched)
- apps/app/                 (untouched, still Expo)
```

---

## 9. New Directory Structure

```
workers/
  api/
    wrangler.jsonc
    src/
      index.ts              <- Hono app entry point
      composition.ts        <- Manual DI (replaces NestJS modules)
      routes/
        positions.ts        <- One file per resource
        previews.ts
        history.ts
        execution.ts
  monitor/
    wrangler.jsonc
    src/
      index.ts              <- scheduled + queue handlers
      composition.ts        <- Monitor-specific DI

packages/                   <- UNCHANGED except adapters/outbound/storage connection
  domain/
  application/
  adapters/
    src/
      outbound/
        storage/
          neon-client.ts    <- NEW: replaces pg connection
          schema/           <- UNCHANGED
          *.ts              <- Adapter classes unchanged, just receive new db type
        solana-position-reads/  <- UNCHANGED
        swap-execution/         <- UNCHANGED
        wallet-signing/         <- UNCHANGED (browser adapters work in Workers)
        notifications/          <- Simplify: just fetch() to Expo API
  ui/
  config/
  testing/

apps/
  app/                      <- UNCHANGED, deploy dist/ to Cloudflare Pages
```

---

## 10. Adapter Class Changes — Storage Example

Your existing adapter classes likely look something like this:

```typescript
// BEFORE: packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts
import { db } from './pg-connection'; // module-level singleton

export class OperationalStorageAdapter implements OperationalStoragePort {
  async getMonitoredPositions() {
    return db.select().from(positions).where(eq(positions.isMonitored, true));
  }
}
```

Change to constructor injection of the database instance:

```typescript
// AFTER: packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts
import { Database } from './neon-client';
import { positions } from './schema';
import { eq } from 'drizzle-orm';

export class OperationalStorageAdapter implements OperationalStoragePort {
  constructor(private readonly db: Database) {}

  async getMonitoredPositions() {
    return this.db.select().from(positions).where(eq(positions.isMonitored, true));
  }
}
```

That's it. The Drizzle query API is identical between the `pg` driver and the
`neon-http` driver. Your queries don't change. Only the connection factory changes.

---

## 11. Testing Strategy

### Unit tests (domain, application) — ZERO changes
Your domain and application tests don't touch infrastructure. They pass as-is.

### Adapter tests — Minimal changes
Storage adapter tests that used a real Postgres connection should point at Neon
(or use Drizzle's built-in test utilities with a local Postgres for CI).

### Integration tests — New approach
Use `wrangler dev` for local development. It runs a miniflare environment that
simulates Workers, Queues, and Cron Triggers locally.

```bash
# Terminal 1: API worker
cd workers/api && pnpm wrangler dev

# Terminal 2: Monitor worker
cd workers/monitor && pnpm wrangler dev --test-scheduled

# Trigger a cron event manually:
curl "http://localhost:8787/__scheduled?cron=*/2+*+*+*+*"
```

---

## 12. Cost Summary

| Service | Free Tier Limit | Your Usage |
|---------|----------------|------------|
| Cloudflare Workers (API) | 100K req/day | ~100 req/day |
| Cloudflare Cron Triggers | 5 triggers | 1 trigger |
| Cloudflare Queues | 1M ops/month | ~50K ops/month |
| Neon Postgres | 100 CU-hours, 0.5GB | ~20 CU-hours, <50MB |
| Cloudflare Pages (PWA) | Unlimited static | Unlimited static |
| Expo Push | Free tier | ~100 notifications/month |

**Total monthly cost: $0**

---

## 13. Replication Instructions for Cheaper Models

When handing remaining controllers to Qwen 3.6 or MiniMax, include this prompt:

```
You are migrating NestJS controllers to Hono route handlers for Cloudflare Workers.

RULES:
1. Copy the EXACT pattern from the reference positions.ts route file
2. NEVER import from 'node:*', 'pg', 'pg-boss', '@nestjs/*', or 'express'
3. NEVER use process.env — use c.env from the Hono context
4. ALWAYS call buildDependencies(c.env) inside each route handler, not at module scope
5. ALWAYS use c.req.param(), c.req.json(), c.req.query() — not req.params, req.body
6. ALWAYS return c.json(data, statusCode) — not res.json()
7. Error handling: return c.json({ error }, status) — do not throw HttpException
8. The domain and application layers are UNCHANGED — import use cases as-is

Convert this NestJS controller to a Hono route file:
[paste controller here]
```

---

## 14. Deployment Sequence

```bash
# 1. Create Neon project at console.neon.tech (free tier)
# 2. Copy connection string

# 3. Run migrations against Neon
DATABASE_URL="<neon-url>" pnpm db:migrate

# 4. Set secrets for API worker
cd workers/api
wrangler secret put DATABASE_URL     # paste Neon connection string
wrangler secret put SOLANA_RPC_URL   # your Helius/Triton endpoint

# 5. Set secrets for monitor worker
cd workers/monitor
wrangler secret put DATABASE_URL
wrangler secret put SOLANA_RPC_URL
wrangler secret put EXPO_PUSH_TOKEN  # from Expo push setup

# 6. Deploy
pnpm deploy:api
pnpm deploy:monitor
pnpm deploy:app

# 7. Verify
curl https://clmm-v2-api.<your-subdomain>.workers.dev/health
# → {"status":"ok","runtime":"cloudflare-workers"}

# 8. Delete Railway project
```
