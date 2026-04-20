# Wallet Ownership Proof for Enrollment — Design

**Status:** Design approved, ready for implementation plan
**Issue:** [opsclawd/clmm-v2#21](https://github.com/opsclawd/clmm-v2/issues/21)
**Prior work:** PR #6 (closed deliberately — bundled Redis + RPC retry + this flow; this spec preserves the verified parts and replaces storage with Postgres)
**Target runtime:** Cloudflare Workers (see `wrangler.jsonc`)

---

## Problem

`POST /wallets/:walletId/monitor` currently enrolls any wallet address with no proof of ownership. A script can enroll arbitrary wallets into the scanner, consuming scan capacity and subscribing to notifications for positions the caller does not control.

## Goals

- Require cryptographic proof (Ed25519 signature) that the caller controls the wallet being enrolled.
- No new infrastructure dependencies — use the existing Postgres + drizzle stack.
- No `@solana/web3.js` imports in adapters (per `AGENTS.md` boundaries).
- Use WebCrypto for Ed25519 verification (Workers-compatible).
- Preserve the reviewed verification code from PR #6 where viable; correct the two documented issues (re-insert race, hardcoded 32-byte length).

## Non-goals

- Session tokens / JWT issuance after enrollment. Enrollment is a one-shot state change, not a login.
- Rate limiting on `/challenge`. The upsert-on-PK storage design bounds table size automatically; per-IP/per-wallet request limiting is a reverse-proxy / Cloudflare concern, not application code.
- Multi-challenge-per-wallet. One outstanding challenge per wallet; client re-requests if needed.
- Backward-compat alias for `POST /:walletId/monitor`. Deleted outright.
- Client-side wallet-adapter wiring (`apps/app`). Backend lands first; client integration is a separate PR.

---

## 1. Architecture & layering

```
apps/app (client)            packages/adapters (HTTP)         packages/application     packages/adapters (storage)
─────────────────            ────────────────────────         ─────────────────────    ──────────────────────────
signMessage(message) ──▶    WalletController                                           MonitoredWalletStorageAdapter
                              POST /:walletId/challenge ──────────┐                   WalletChallengePostgresAdapter (new)
                              POST /:walletId/enroll              │                           ▲
                                │                                 │                           │ implements
                                │ uses WalletVerification         │                           │
                                │ (Ed25519 + base58, WebCrypto)   ▼                           │
                                │                       MonitoredWalletRepository port        │
                                │                       WalletChallengeRepository port ───────┘ (new)
                                ▼
                              issue() / consume() + verifySignature()
```

**Placement:**

| Concern | Location | Reason |
|---|---|---|
| `WalletChallengeRepository` port interface | `packages/application/src/ports/index.ts` | Application-level contract, no domain concept created |
| `WalletVerification.ts` (Ed25519 + base58 + WebCrypto) | `packages/adapters/src/inbound/http/` | External crypto → adapter layer; transport-layer concern |
| `WalletChallengePostgresAdapter.ts` | `packages/adapters/src/outbound/storage/` | Implements the port via the existing drizzle `Db` |
| `wallet_challenges` schema | `packages/adapters/src/outbound/storage/schema/wallet-challenges.ts` | Matches convention of other schema files |
| `WalletController` challenge/enroll routes | `packages/adapters/src/inbound/http/WalletController.ts` | Existing controller is rewritten |
| Domain layer (`packages/domain`) | **unchanged** | No new domain concepts — `AGENTS.md` forbids "claim-verification" domain concepts; we verify at the transport boundary |

**Boundary guarantees (verified via `pnpm boundaries`):**

- `packages/application` must not import adapters, WebCrypto APIs, or base58 — `WalletChallengeRepository` is pure TypeScript types.
- `WalletVerification.ts` lives inside the HTTP adapter module; it is not a storage or domain concern.

---

## 2. API surface

Two endpoints on `WalletController`. `POST /wallets/:walletId/monitor` is **deleted**.

### `POST /wallets/:walletId/challenge`

**Request:** `walletId` in path. No body.

**Validation:** `walletId` must decode to exactly 32 bytes via base58. If not → `400 BAD_REQUEST` `{ error: "WALLET_MALFORMED" }`.

**Effect:** Upsert into `wallet_challenges` (PK `wallet_id`). Nonce: 32 random bytes, hex-encoded (64 chars). `expiresAt = now + 5 min`.

**200 OK response:**
```json
{
  "nonce": "<64-char hex>",
  "expiresAt": 1713628800000,
  "message": "CLMM wallet verification\n\nWallet: <walletId>\nNonce: <nonce>\nExpires: 2026-04-20T17:20:00.000Z"
}
```

Server emits the full signed-message template so the client passes it to `wallet.signMessage(message)` verbatim. Server remains the single source of truth for the format.

### `POST /wallets/:walletId/enroll`

**Request body:**
```json
{ "nonce": "<64-char hex>", "signature": "<base58-encoded 64-byte signature>" }
```

**Flow:** validate walletId → validate body shape → `consume({ walletId, nonce, now })` → on `consumed`, rebuild expected message from `(walletId, nonce, expiresAt-from-adapter)` + fixed template → decode signature from base58 (enforcing 64 bytes) → verify Ed25519 against walletId's pubkey → `monitoredWallets.enroll(walletId, now)`.

**Responses:**

| Outcome | HTTP | Body |
|---|---|---|
| Signature verified, wallet enrolled | `200 OK` | `{ "enrolled": true, "enrolledAt": <ms> }` |
| No outstanding challenge for wallet | `400` | `{ "error": "CHALLENGE_NOT_FOUND" }` |
| `walletId` malformed | `400` | `{ "error": "WALLET_MALFORMED" }` |
| Request body malformed | `400` | `{ "error": "BAD_REQUEST" }` |
| Nonce in body ≠ stored nonce | `409` | `{ "error": "CHALLENGE_MISMATCH" }` |
| Stored `expiresAt < now` | `410` | `{ "error": "CHALLENGE_EXPIRED" }` |
| Signature fails Ed25519 verify (or base58-decode fails) | `401` | `{ "error": "SIGNATURE_INVALID" }` |

**Check order:** body shape → walletId format → `consume` → signature decode → signature verify. The adapter owns the `consume` branching (not-found / mismatch / expired / consumed) and returns `expiresAt` on success, so the controller never reads the stored row directly.

---

## 3. Data model & migration

### Schema file: `packages/adapters/src/outbound/storage/schema/wallet-challenges.ts`

```ts
import { pgTable, text, bigint } from 'drizzle-orm/pg-core';

export const walletChallenges = pgTable('wallet_challenges', {
  walletId: text('wallet_id').primaryKey(),
  nonce: text('nonce').notNull(),
  expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
});
```

Conventions match the existing schemas: `text` for ids, `bigint('_at', { mode: 'number' })` for ms timestamps (consistent with all 9 existing schemas — `monitored_wallets`, `prepared_payloads`, `executions`, etc.).

Add `export * from './wallet-challenges.js';` to `schema/index.ts`.

### Design notes

- **`wallet_id` as PK.** Upsert semantics on re-issue; bounds storage to ≤ (wallets that have ever issued a challenge). No index on `expires_at` needed — no queries use it.
- **Laissez-faire eviction.** `consume` always deletes the row (including on expired). No scheduled sweep. Stale rows linger only for wallets that issued a challenge and never re-issued; cost is negligible.
- **Migration:** `pnpm --filter @clmm/adapters db:generate` emits a new `0001_*.sql`. Forward-only, drop-safe rollback (no FKs, no dependents).
- **Deploy ordering:** migration must apply before the new controller code ships, else `/challenge` 500s. Implementation plan must call this out in the deploy sequence.

---

## 4. Port interface & Postgres adapter

### Port — `packages/application/src/ports/index.ts`

```ts
export interface WalletChallengeRepository {
  issue(params: {
    walletId: WalletId;
    nonce: string;
    expiresAt: ClockTimestamp;
  }): Promise<void>;

  consume(params: {
    walletId: WalletId;
    nonce: string;
    now: ClockTimestamp;
  }): Promise<
    | { kind: 'consumed'; expiresAt: ClockTimestamp }
    | { kind: 'not_found' }
    | { kind: 'mismatch' }
    | { kind: 'expired' }
  >;
}
```

**Why a discriminated union:** the controller maps these four states to four distinct HTTP responses. Returning `kind` keeps the branching exhaustive and compiler-checked. On `consumed`, `expiresAt` flows back so the controller rebuilds the signed message without re-reading the row.

### Token

Add to `packages/adapters/src/inbound/http/tokens.ts`:
```ts
export const WALLET_CHALLENGE_REPOSITORY = Symbol('WALLET_CHALLENGE_REPOSITORY');
```

### Adapter — `packages/adapters/src/outbound/storage/WalletChallengePostgresAdapter.ts`

```ts
export class WalletChallengePostgresAdapter implements WalletChallengeRepository {
  constructor(private readonly db: Db) {}

  async issue({ walletId, nonce, expiresAt }): Promise<void> {
    await this.db
      .insert(walletChallenges)
      .values({ walletId, nonce, expiresAt })
      .onConflictDoUpdate({
        target: walletChallenges.walletId,
        set: { nonce, expiresAt },
      });
  }

  async consume({ walletId, nonce, now }) {
    const rows = await this.db
      .delete(walletChallenges)
      .where(eq(walletChallenges.walletId, walletId))
      .returning();

    if (rows.length === 0) return { kind: 'not_found' };
    const row = rows[0];
    if (row.nonce !== nonce) return { kind: 'mismatch' };     // row is deleted; caller must re-request
    if (row.expiresAt < now) return { kind: 'expired' };       // row is deleted
    return { kind: 'consumed', expiresAt: row.expiresAt as ClockTimestamp };
  }
}
```

**Mismatch semantics:** `consume` uses a single atomic `DELETE ... RETURNING`. On nonce mismatch, the row is deleted (not re-inserted). A naïve re-insert would open two race windows — a concurrent `consume` would see `not_found`, and a concurrent `issue` would conflict. Since the client's recovery step is "request a new challenge" regardless, simplicity wins: mismatch burns the challenge, client calls `/challenge` again.

### Wiring — `AppModule.ts`

```ts
const walletChallengeStorage = new WalletChallengePostgresAdapter(db);
// …
providers: [
  // existing …
  { provide: WALLET_CHALLENGE_REPOSITORY, useValue: walletChallengeStorage },
]
```

### Adapter tests — `WalletChallengePostgresAdapter.test.ts`

Mirrors `MonitoredWalletStorageAdapter.test.ts` style. The plan must confirm the in-memory / test-container choice to match existing storage adapter tests.

1. `issue` inserts; second `issue` for same walletId overwrites nonce + expiry.
2. `consume` happy path → `{ kind: 'consumed', expiresAt }`, row deleted.
3. `consume` with no outstanding row → `{ kind: 'not_found' }`.
4. `consume` with nonce mismatch → `{ kind: 'mismatch' }`, **row deleted** (regression guard for the race fix).
5. `consume` with `expiresAt < now` → `{ kind: 'expired' }`, row deleted.
6. Two concurrent `consume` calls for same wallet → only one returns `consumed`, the other `not_found`. (Validates the atomicity of `DELETE ... RETURNING`.)

---

## 5. `WalletVerification.ts` — cherry-pick + deltas

Starting point: the final form of `packages/adapters/src/inbound/http/WalletVerification.ts` from PR #6 at commit `86a2eccfd1` (after the Codex P1/P2 rounds). Four deltas below.

### Cherry-pick unchanged

- **`verifyWalletSignature` structure** — same `{ message, signature, walletAddress }` input, same `try/catch → false` contract.
- **WebCrypto-via-JWK-OKP strategy** — the only Ed25519 import path that works for raw 32-byte Solana pubkeys.
- **Base58 decoder core loop** — correct BigInt arithmetic with leading-zero handling (previously fixed in PR #6's Codex P2 round).

### Change #1 — `buildWalletVerificationMessage` format

Replace PR #6's compact format with the domain-bound multi-line form:

```ts
export function buildWalletVerificationMessage(params: {
  walletAddress: string;
  nonce: string;
  expiresAt: number; // ms
}): string {
  return [
    'CLMM wallet verification',
    '',
    `Wallet: ${params.walletAddress}`,
    `Nonce: ${params.nonce}`,
    `Expires: ${new Date(params.expiresAt).toISOString()}`,
  ].join('\n');
}
```

This function is the **single source of truth** for the signed-message template. No string literals of the template elsewhere. Used by both `issueChallenge` (to return `message` in the response) and `enroll` (to rebuild and verify).

### Change #2 — drop `require('crypto')`, use `globalThis.crypto`

PR #6 used `const { webcrypto } = require('crypto')` — assumes Node runtime. Cloudflare Workers expose WebCrypto directly on `globalThis.crypto` with full Ed25519 support. Replace with `const subtle = globalThis.crypto.subtle;`. Identical behavior under Node 18+ and Workers. Removes the `@typescript-eslint/no-var-requires` disable.

### Change #3 — `Uint8Array` on public boundaries

`verifyWalletSignature`'s `signature` param and internal `messageBytes` move from `Buffer` to `Uint8Array`. `new TextEncoder().encode(message)` for message bytes. Makes the transport-layer crypto module runtime-portable even if the rest of the adapter keeps pulling `Buffer`-heavy deps.

### Change #4 — generalize `base58ToBuffer` with required length

PR #6 hardcoded a 32-byte length check. Signatures are 64 bytes, so generalize:

```ts
export function base58ToBuffer(str: string, expectedLength: number): Uint8Array {
  // existing leading-zero + BigInt decode logic, but final check becomes:
  if (total !== expectedLength) {
    throw new Error(`Invalid base58 payload: decoded ${total} bytes, expected ${expectedLength}`);
  }
  // …
}
```

Required parameter (no default), so a caller cannot silently skip length validation. Callers:

- `verifyWalletSignature` internals → `base58ToBuffer(walletAddress, 32)` for pubkey.
- `WalletController.enroll` → `base58ToBuffer(body.signature, 64)` for signature (via `tryBase58ToBuffer` wrapper that returns `null` on decode error).

### Tests — `WalletVerification.test.ts`

Cherry-pick PR #6's tests, update to new message format and new `base58ToBuffer` signature. Final cases:

1. `base58ToBuffer(addr, 32)` happy path.
2. `base58ToBuffer(sig, 64)` happy path.
3. `base58ToBuffer` rejects invalid base58 character.
4. `base58ToBuffer` with `expectedLength=32` rejects a 64-byte payload (length mismatch).
5. `base58ToBuffer` with `expectedLength=64` rejects a 32-byte payload.
6. `buildWalletVerificationMessage` emits exact expected string (format snapshot).
7. `verifyWalletSignature` full valid-signature happy path (generate Ed25519 keypair via `webcrypto.subtle.generateKey`, sign, verify → `true`).
8. `verifyWalletSignature` wrong signature → `false`.
9. `verifyWalletSignature` wrong walletAddress (right sig, different pubkey) → `false`.
10. `verifyWalletSignature` tampered message → `false`.

### One thing the plan must verify

`wrangler.jsonc` does not currently set `nodejs_compat`. The plan must confirm whichever runtime serves `/wallets` endpoints (API worker vs background worker in `jobs/main.ts`) provides `globalThis.crypto.subtle` with Ed25519 support. This is a deploy-time check, not a design question — WebCrypto Ed25519 is standard in current Workers runtimes.

---

## 6. `WalletController` flow + wiring

Replace the current one-method `WalletController` with:

```ts
@Controller('wallets')
export class WalletController {
  constructor(
    @Inject(WALLET_CHALLENGE_REPOSITORY)
    private readonly challenges: WalletChallengeRepository,
    @Inject(MONITORED_WALLET_REPOSITORY)
    private readonly monitoredWallets: MonitoredWalletRepository,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
  ) {}

  @Post(':walletId/challenge')
  async issueChallenge(@Param('walletId') walletId: string) {
    assertValidWalletId(walletId);                             // throws BadRequestException WALLET_MALFORMED
    const now = this.clock.now();
    const expiresAt = (now + CHALLENGE_TTL_MS) as ClockTimestamp;
    const nonce = generateNonce();                             // 32 random bytes → hex
    await this.challenges.issue({ walletId: walletId as WalletId, nonce, expiresAt });
    const message = buildWalletVerificationMessage({ walletAddress: walletId, nonce, expiresAt });
    return { nonce, expiresAt, message };
  }

  @Post(':walletId/enroll')
  async enroll(
    @Param('walletId') walletId: string,
    @Body() body: { nonce?: unknown; signature?: unknown },
  ) {
    assertValidWalletId(walletId);
    const { nonce, signature } = assertEnrollBody(body);       // BAD_REQUEST on shape issues

    const now = this.clock.now();
    const consumeResult = await this.challenges.consume({
      walletId: walletId as WalletId, nonce, now,
    });
    switch (consumeResult.kind) {
      case 'not_found': throw new BadRequestException({ error: 'CHALLENGE_NOT_FOUND' });
      case 'mismatch':  throw new ConflictException({ error: 'CHALLENGE_MISMATCH' });
      case 'expired':   throw new HttpException({ error: 'CHALLENGE_EXPIRED' }, 410);
      case 'consumed':  break;
    }

    const expectedMessage = buildWalletVerificationMessage({
      walletAddress: walletId, nonce, expiresAt: consumeResult.expiresAt,
    });
    const signatureBytes = tryBase58ToBuffer(signature, 64);
    if (!signatureBytes) throw new UnauthorizedException({ error: 'SIGNATURE_INVALID' });

    const verified = await verifyWalletSignature({
      message: expectedMessage, signature: signatureBytes, walletAddress: walletId,
    });
    if (!verified) throw new UnauthorizedException({ error: 'SIGNATURE_INVALID' });

    const enrolledAt = this.clock.now();
    await this.monitoredWallets.enroll(walletId as WalletId, enrolledAt);
    return { enrolled: true, enrolledAt };
  }
}
```

### Check-order rationale

- `assertValidWalletId` first — reject junk before any DB round trip.
- `consume` before signature verify — skip crypto work if no valid challenge exists. The `expiresAt` returned from `consume` is what the signed message is bound to, so we verify against the same string the client signed.
- Signature decode + verify after expiry check — no "valid signature on expired challenge" edge; `410 GONE` short-circuits before crypto.

### Local helpers (stay inside `WalletController.ts`)

- `generateNonce()`: `globalThis.crypto.getRandomValues(new Uint8Array(32))` → hex. No Node-specific imports.
- `assertValidWalletId(id)`: calls `base58ToBuffer(id, 32)` in try/catch; throws `BadRequestException({ error: 'WALLET_MALFORMED' })` on failure.
- `assertEnrollBody(body)`: validates `nonce` is 64-char hex string, `signature` is non-empty string; throws `BadRequestException({ error: 'BAD_REQUEST' })` otherwise.
- `tryBase58ToBuffer(str, len)`: wrapper that returns `null` on decode error — lets controller map to `SIGNATURE_INVALID` instead of letting the throw escape.
- `const CHALLENGE_TTL_MS = 5 * 60 * 1000;` at the top of the file.

These are transport-layer helpers; keeping them local to the controller file avoids spurious module boundaries. Extract only if they grow.

### Controller tests — `WalletController.test.ts`

Pattern matches `AlertController.test.ts` / `ExecutionController.test.ts`: direct handler invocation with mocked ports.

1. `issueChallenge` happy path → returns `{ nonce, expiresAt, message }`; `challenges.issue` called once with matching values; message matches `buildWalletVerificationMessage`.
2. `issueChallenge` with malformed walletId → `BadRequestException` `WALLET_MALFORMED`; `issue()` never called.
3. `enroll` happy path → `consume → consumed`; signature verifies; `monitoredWallets.enroll` called with correct walletId + now; returns `{ enrolled: true, enrolledAt }`.
4. `enroll` with `consume → not_found` → `400 CHALLENGE_NOT_FOUND`; `monitoredWallets.enroll` never called.
5. `enroll` with `consume → mismatch` → `409 CHALLENGE_MISMATCH`; `monitoredWallets.enroll` never called.
6. `enroll` with `consume → expired` → `410 CHALLENGE_EXPIRED`; `monitoredWallets.enroll` never called.
7. `enroll` with consumed challenge but bad signature → `401 SIGNATURE_INVALID`; `monitoredWallets.enroll` never called (critical — enrollment must only occur after full verification).
8. `enroll` with malformed body (missing nonce / non-hex nonce / missing signature / non-string signature) → `400 BAD_REQUEST`.
9. `enroll` with malformed walletId → `400 WALLET_MALFORMED`.
10. `enroll` with signature-decode error (e.g., non-base58 signature string) → `401 SIGNATURE_INVALID` (not a crash).
11. `enroll` regression-guard: server uses `expiresAt` from `consume` to rebuild message; controller must verify signature successfully against the server-rebuilt message.

### `AppModule.ts` wiring additions

```ts
const walletChallengeStorage = new WalletChallengePostgresAdapter(db);

// in providers:
{ provide: WALLET_CHALLENGE_REPOSITORY, useValue: walletChallengeStorage },
```

`WalletController` already listed in `controllers`. No change there — we rewrite the class body.

---

## Verification gate

Implementation plan must run and pass:

- `pnpm build`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm boundaries` — confirms `packages/application` has no adapter imports; `packages/domain` has no new imports.
- `pnpm test` — new adapter tests + controller tests + verification tests all pass.
- Manual end-to-end smoke on a deploy preview: generate a throwaway Solana keypair locally, `POST /challenge`, sign the returned message with tweetnacl (or equivalent), `POST /enroll`, assert `{ enrolled: true }` and a row in `monitored_wallets`.

## Deploy ordering

1. Apply DB migration (`drizzle-kit migrate`) creating `wallet_challenges` table.
2. Deploy code (new `WalletController`, `WalletChallengePostgresAdapter`, `WalletVerification.ts`, `WalletChallengeRepository` port, wiring in `AppModule.ts`, token).
3. Optional: monitor `wallet_challenges` row count for ~1 hour to confirm sane behavior under real traffic.

Rollback: revert the code deploy; the `wallet_challenges` table can stay empty with zero impact (no FKs, no readers outside the new controller). Drop the table separately if desired.

## Out of scope (explicit)

- Rate limiting on `/challenge` (reverse-proxy concern; upsert-on-PK bounds storage automatically).
- Session tokens / login state after enrollment (separate auth concern, not needed).
- Multi-challenge-per-wallet.
- Backward-compat `/monitor` alias.
- Client-side `apps/app` wallet-adapter wiring (separate PR once backend lands).
