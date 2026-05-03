# Wallet Ownership Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require an Ed25519 signature proving wallet ownership before enrolling a wallet for monitoring. Replace the unsigned `POST /wallets/:walletId/monitor` enrollment with a `/challenge` + `/enroll` flow, ship the matching app migration in the same release, and reduce `/monitor` to a 410 tombstone.

**Architecture:** New Postgres-backed `wallet_challenges` table behind a `WalletChallengeRepository` port with three operations — `issue` (idempotent during the 5-minute TTL), `get` (non-consuming pre-check), and `consumeAndEnrollIfMatches` (transactional final step that deletes the challenge and upserts `monitored_wallets` in one transaction). Signature verification lives in a transport-layer `WalletVerification.ts` helper using WebCrypto Ed25519. App side adds explicit message-signing capability beside transaction signing for both ConnectorKit (browser) and MWA (native), and replaces the fire-and-forget `enrollWalletForMonitoring` call with a typed challenge → sign → enroll orchestrator that gates navigation to the ready state.

**Tech Stack:** TypeScript, NestJS, drizzle-orm/postgres-js (Postgres), WebCrypto (`globalThis.crypto.subtle`), `@solana/connector` (browser wallet), `@solana-mobile/mobile-wallet-adapter-protocol-kit` (native wallet), Expo Router, vitest, pnpm workspaces.

**Design spec:** `docs/superpowers/specs/2026-05-02-wallet-ownership-proof-design.md`
**Issue:** [opsclawd/clmm-v2#21](https://github.com/opsclawd/clmm-v2/issues/21)
**Supersedes plan:** `docs/superpowers/plans/2026-04-20-wallet-ownership-proof.md`

---

## File Map

### Backend (created)

- `packages/adapters/src/outbound/storage/schema/wallet-challenges.ts` — Drizzle table definition.
- `packages/adapters/drizzle/0001_<name>.sql` — generated migration (filename is drizzle-kit's choice).
- `packages/adapters/drizzle/meta/0001_snapshot.json` — generated drizzle snapshot.
- `packages/testing/src/fakes/FakeWalletChallengeRepository.ts` — in-memory implementation of the port; takes a `MonitoredWalletRepository` to honor the consume+enroll coupling contract.
- `packages/adapters/src/inbound/http/WalletVerification.ts` — `buildWalletVerificationMessage` and `verifyWalletSignature` plus a strict base58 helper. Lives in HTTP adapter layer because it does WebCrypto + base58 decoding.
- `packages/adapters/src/inbound/http/WalletVerification.test.ts` — vector-based tests for both helpers.
- `packages/adapters/src/outbound/storage/WalletChallengePostgresAdapter.ts` — Postgres implementation; uses `db.transaction` for `issue` (FOR UPDATE / conditional insert) and `consumeAndEnrollIfMatches` (FOR UPDATE / conditional delete + monitored_wallets upsert).
- `packages/adapters/src/outbound/storage/WalletChallengePostgresAdapter.test.ts` — shape test (matches existing convention; behavior is covered by fake-driven controller tests).
- `packages/adapters/src/inbound/http/WalletController.test.ts` — full coverage for `/challenge`, `/enroll`, `/monitor`.

### Backend (modified)

- `packages/adapters/src/outbound/storage/schema/index.ts` — export `wallet-challenges`.
- `packages/adapters/src/outbound/storage/db.ts` — register `walletChallengesSchema` in the drizzle schema spread.
- `packages/application/src/ports/index.ts` — append `WalletChallengeRepository` interface.
- `packages/adapters/src/inbound/http/tokens.ts` — append `WALLET_CHALLENGE_REPOSITORY` token.
- `packages/testing/src/fakes/index.ts` — export `FakeWalletChallengeRepository`.
- `packages/adapters/src/inbound/http/WalletController.ts` — full rewrite: drop the unsigned `enrollForMonitoring` and add `issueChallenge`, `enroll`, and a `monitorTombstone` handler.
- `packages/adapters/src/inbound/http/AppModule.ts` — instantiate `WalletChallengePostgresAdapter` and provide it under `WALLET_CHALLENGE_REPOSITORY`.

### App (created)

- `apps/app/src/api/wallets.test.ts` — covers structured error parsing for the new typed API.
- `apps/app/src/wallet-verify/signMessageWithWallet.ts` — cross-platform router that picks browser vs native message signer based on connection kind and verifies the signing account matches the requested `walletId`.
- `apps/app/src/wallet-verify/verifyWalletEnrollment.ts` — orchestrator: challenge → sign → enroll, returning a typed `EnrollmentOutcome`.
- `apps/app/src/wallet-verify/verifyWalletEnrollment.test.ts` — tests for the success path and every failure outcome.

### App (modified)

- `apps/app/src/api/wallets.ts` — replace `enrollWalletForMonitoring` with typed `requestWalletChallenge` + `enrollWalletWithProof` and centralized structured error parsing.
- `apps/app/src/platform/browserWallet/connectorKitAdapter.web.ts` — extend `ConnectorKitAdapterResult` with `signMessageBytes`.
- `apps/app/src/platform/browserWallet/connectorKitAdapter.ts` — extend the unresolved stub.
- `apps/app/src/platform/browserWallet/connectorKitAdapter.native.ts` — extend the native stub.
- `apps/app/src/platform/nativeWallet.ts` — add `signNativeMessage` using MWA `signMessages`.
- `apps/app/app/connect.tsx` — replace the three fire-and-forget `enrollWalletForMonitoring(address)` calls with `verifyWalletEnrollment` that gates `navigateRoute`.

---

## Preflight

- [ ] **Step P1: Ensure dependencies installed and workspace built**

Run:
```bash
pnpm install --frozen-lockfile
pnpm build
```
Expected: both succeed. If either fails, stop and report — plan assumes a working workspace.

- [ ] **Step P2: Confirm clean working tree**

Run: `git status --short`
Expected: empty output. If not empty, stop and ask the user — do not work on a dirty tree.

- [ ] **Step P3: Confirm no uncommitted plan from a previous attempt**

Run: `git log --oneline -5 -- docs/superpowers/plans/2026-05-02-wallet-ownership-proof.md`
Expected: shows the commit that created this plan, nothing in-progress.

---

## Task 1: Add `wallet_challenges` schema and migration

**Files:**
- Create: `packages/adapters/src/outbound/storage/schema/wallet-challenges.ts`
- Modify: `packages/adapters/src/outbound/storage/schema/index.ts`
- Modify: `packages/adapters/src/outbound/storage/db.ts`
- Create: `packages/adapters/drizzle/0001_<name>.sql` (generated)
- Modify: `packages/adapters/drizzle/meta/_journal.json` (generated)
- Create: `packages/adapters/drizzle/meta/0001_snapshot.json` (generated)

- [ ] **Step 1.1: Create the schema file**

Create `packages/adapters/src/outbound/storage/schema/wallet-challenges.ts`:

```ts
import { pgTable, text, bigint } from 'drizzle-orm/pg-core';

export const walletChallenges = pgTable('wallet_challenges', {
  walletId: text('wallet_id').primaryKey(),
  nonce: text('nonce').notNull(),
  expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
  issuedAt: bigint('issued_at', { mode: 'number' }).notNull(),
});
```

- [ ] **Step 1.2: Export from schema barrel**

Modify `packages/adapters/src/outbound/storage/schema/index.ts` — append at the end:

```ts
export * from './wallet-challenges.js';
```

(Keep all existing exports above it.)

- [ ] **Step 1.3: Register schema in `db.ts`**

Modify `packages/adapters/src/outbound/storage/db.ts`. Add the import after the `notificationEventsSchema` import:

```ts
import * as walletChallengesSchema from './schema/wallet-challenges.js';
```

And include it inside the `drizzle(client, { schema: { ... } })` spread, after `notificationEventsSchema`:

```ts
      ...walletChallengesSchema,
```

- [ ] **Step 1.4: Generate the migration**

Run:
```bash
DATABASE_URL=postgresql://placeholder pnpm --filter @clmm/adapters db:generate
```
Expected: drizzle-kit creates `packages/adapters/drizzle/0001_*.sql` containing `CREATE TABLE "wallet_challenges"` with all four columns and `wallet_id` as the primary key. Also writes `drizzle/meta/0001_snapshot.json` and updates `drizzle/meta/_journal.json`.

- [ ] **Step 1.5: Verify the generated SQL**

Run: `ls packages/adapters/drizzle/ && cat packages/adapters/drizzle/0001_*.sql`

Expected: a file named `0001_*.sql` containing exactly:

```sql
CREATE TABLE "wallet_challenges" (
	"wallet_id" text PRIMARY KEY NOT NULL,
	"nonce" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"issued_at" bigint NOT NULL
);
```

(Exact whitespace may vary slightly with drizzle-kit version. Column names, types, NOT NULL flags, and PK on `wallet_id` are what matter. If the generated SQL differs structurally — for example adds an unwanted `--> statement-breakpoint` between columns — stop and ask.)

- [ ] **Step 1.6: Typecheck the adapters package**

Run: `pnpm --filter @clmm/adapters typecheck`
Expected: PASS.

- [ ] **Step 1.7: Commit**

```bash
git add packages/adapters/src/outbound/storage/schema/wallet-challenges.ts \
        packages/adapters/src/outbound/storage/schema/index.ts \
        packages/adapters/src/outbound/storage/db.ts \
        packages/adapters/drizzle/0001_*.sql \
        packages/adapters/drizzle/meta/
git commit -m "feat(adapters): add wallet_challenges schema and migration"
```

---

## Task 2: Define `WalletChallengeRepository` port and DI token

**Files:**
- Modify: `packages/application/src/ports/index.ts`
- Modify: `packages/adapters/src/inbound/http/tokens.ts`

- [ ] **Step 2.1: Append the port interface**

Modify `packages/application/src/ports/index.ts`. Append after the `IdGeneratorPort` block at the bottom of the file:

```ts
// --- Wallet ownership challenge port ---

export type WalletChallengeRow = {
  walletId: WalletId;
  nonce: string;
  expiresAt: ClockTimestamp;
  issuedAt: ClockTimestamp;
};

export type ConsumeAndEnrollResult =
  | { kind: 'consumed' }
  | { kind: 'not_found' }
  | { kind: 'expired' }
  | { kind: 'mismatch' };

export interface WalletChallengeRepository {
  /**
   * Returns the existing unexpired challenge if one is active for `walletId`.
   * Otherwise stores and returns the supplied fresh challenge. Must NOT extend
   * the expiry of an active challenge.
   */
  issue(params: {
    walletId: WalletId;
    nonce: string;
    expiresAt: ClockTimestamp;
    issuedAt: ClockTimestamp;
    now: ClockTimestamp;
  }): Promise<WalletChallengeRow>;

  /** Non-consuming load. Returns null if no row exists. Returns expired rows. */
  get(walletId: WalletId): Promise<WalletChallengeRow | null>;

  /**
   * Atomic terminal step: in one transaction, delete the matching, unexpired
   * challenge and upsert `monitored_wallets`. If no row is deleted (not_found,
   * mismatch, or expired), the wallet is NOT enrolled. Mismatched/expired
   * rows MUST NOT be deleted — only success consumes the challenge.
   */
  consumeAndEnrollIfMatches(params: {
    walletId: WalletId;
    nonce: string;
    now: ClockTimestamp;
    enrolledAt: ClockTimestamp;
  }): Promise<ConsumeAndEnrollResult>;
}
```

- [ ] **Step 2.2: Append the DI token**

Modify `packages/adapters/src/inbound/http/tokens.ts`. Append:

```ts
export const WALLET_CHALLENGE_REPOSITORY = 'WALLET_CHALLENGE_REPOSITORY';
```

(Use a string token, matching every other token in this file.)

- [ ] **Step 2.3: Typecheck**

Run: `pnpm --filter @clmm/application typecheck && pnpm --filter @clmm/adapters typecheck`
Expected: both PASS.

- [ ] **Step 2.4: Boundaries**

Run: `pnpm boundaries`
Expected: PASS. Confirms no adapter import leaked into application from the new port.

- [ ] **Step 2.5: Commit**

```bash
git add packages/application/src/ports/index.ts packages/adapters/src/inbound/http/tokens.ts
git commit -m "feat(application): add WalletChallengeRepository port and DI token"
```

---

## Task 3: Add `FakeWalletChallengeRepository` to the testing package

**Files:**
- Create: `packages/testing/src/fakes/FakeWalletChallengeRepository.ts`
- Modify: `packages/testing/src/fakes/index.ts`

- [ ] **Step 3.1: Create the fake**

Create `packages/testing/src/fakes/FakeWalletChallengeRepository.ts`:

```ts
import type {
  WalletChallengeRepository,
  WalletChallengeRow,
  ConsumeAndEnrollResult,
  MonitoredWalletRepository,
} from '@clmm/application';
import type { WalletId, ClockTimestamp } from '@clmm/domain';

export class FakeWalletChallengeRepository implements WalletChallengeRepository {
  private rows = new Map<string, WalletChallengeRow>();

  constructor(private readonly monitoredWallets: MonitoredWalletRepository) {}

  async issue(params: {
    walletId: WalletId;
    nonce: string;
    expiresAt: ClockTimestamp;
    issuedAt: ClockTimestamp;
    now: ClockTimestamp;
  }): Promise<WalletChallengeRow> {
    const existing = this.rows.get(params.walletId);
    if (existing && existing.expiresAt >= params.now) {
      return existing;
    }
    const fresh: WalletChallengeRow = {
      walletId: params.walletId,
      nonce: params.nonce,
      expiresAt: params.expiresAt,
      issuedAt: params.issuedAt,
    };
    this.rows.set(params.walletId, fresh);
    return fresh;
  }

  async get(walletId: WalletId): Promise<WalletChallengeRow | null> {
    return this.rows.get(walletId) ?? null;
  }

  async consumeAndEnrollIfMatches(params: {
    walletId: WalletId;
    nonce: string;
    now: ClockTimestamp;
    enrolledAt: ClockTimestamp;
  }): Promise<ConsumeAndEnrollResult> {
    const row = this.rows.get(params.walletId);
    if (row === undefined) return { kind: 'not_found' };
    if (row.nonce !== params.nonce) return { kind: 'mismatch' };
    if (row.expiresAt < params.now) return { kind: 'expired' };

    // Atomic in production; in this fake, the two writes happen back-to-back
    // synchronously, which is sufficient for single-threaded test reasoning.
    this.rows.delete(params.walletId);
    await this.monitoredWallets.enroll(params.walletId, params.enrolledAt);
    return { kind: 'consumed' };
  }

  /** Test-only introspection. */
  getRowForTest(walletId: WalletId): WalletChallengeRow | undefined {
    return this.rows.get(walletId);
  }
}
```

- [ ] **Step 3.2: Export from the fakes barrel**

Modify `packages/testing/src/fakes/index.ts`. Append after the `FakeMonitoredWalletRepository` line:

```ts
export { FakeWalletChallengeRepository } from './FakeWalletChallengeRepository.js';
```

- [ ] **Step 3.3: Typecheck**

Run: `pnpm --filter @clmm/testing typecheck`
Expected: PASS.

- [ ] **Step 3.4: Commit**

```bash
git add packages/testing/src/fakes/FakeWalletChallengeRepository.ts \
        packages/testing/src/fakes/index.ts
git commit -m "test(testing): add FakeWalletChallengeRepository"
```

---

## Task 4: Implement `WalletVerification.ts` helpers (TDD)

**Files:**
- Create: `packages/adapters/src/inbound/http/WalletVerification.ts`
- Create: `packages/adapters/src/inbound/http/WalletVerification.test.ts`

This task is split into three steps per helper: base58 decoder, message builder, signature verifier.

### 4a — strict base58 decoder

- [ ] **Step 4a.1: Write failing tests**

Create `packages/adapters/src/inbound/http/WalletVerification.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  base58ToBuffer,
  buildWalletVerificationMessage,
  verifyWalletSignature,
} from './WalletVerification.js';
import { makeClockTimestamp } from '@clmm/domain';

const VALID_32_BYTE_ADDR = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';

describe('base58ToBuffer', () => {
  it('decodes a valid 32-byte Solana address', () => {
    const out = base58ToBuffer(VALID_32_BYTE_ADDR, 32);
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.length).toBe(32);
  });

  it('rejects a 32-byte address when expectedLength is 64', () => {
    expect(() => base58ToBuffer(VALID_32_BYTE_ADDR, 64)).toThrow(/expected 64/);
  });

  it('rejects invalid base58 characters', () => {
    // Replace the first 4 chars with invalid characters '0', 'O', 'I', 'l'.
    expect(() => base58ToBuffer('0OIl' + VALID_32_BYTE_ADDR.slice(4), 32))
      .toThrow(/Invalid base58/);
  });

  it('rejects an empty string', () => {
    expect(() => base58ToBuffer('', 32)).toThrow(/expected 32/);
  });
});
```

- [ ] **Step 4a.2: Run tests to verify they fail**

Run: `pnpm --filter @clmm/adapters test -- WalletVerification`
Expected: FAIL — module `./WalletVerification.js` not found.

- [ ] **Step 4a.3: Implement `base58ToBuffer`**

Create `packages/adapters/src/inbound/http/WalletVerification.ts`:

```ts
import type { ClockTimestamp } from '@clmm/domain';

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_MAP: Record<string, number> = {};
for (let i = 0; i < BASE58_ALPHABET.length; i++) {
  BASE58_MAP[BASE58_ALPHABET.charAt(i)] = i;
}

export function base58ToBuffer(str: string, expectedLength: number): Uint8Array {
  let leadingZeros = 0;
  for (const c of str) {
    if (c === '1') leadingZeros++;
    else break;
  }
  let n = 0n;
  for (const c of str.slice(leadingZeros)) {
    const v = BASE58_MAP[c];
    if (v === undefined) {
      throw new Error(`Invalid base58 character: ${c}`);
    }
    n = n * 58n + BigInt(v);
  }
  let hex = n === 0n ? '' : n.toString(16);
  if (hex.length % 2) hex = '0' + hex;

  const bodyBytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bodyBytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  const total = leadingZeros + bodyBytes.length;
  if (total !== expectedLength) {
    throw new Error(
      `Invalid base58 payload: decoded ${total} bytes, expected ${expectedLength}`,
    );
  }
  const out = new Uint8Array(expectedLength);
  out.set(bodyBytes, leadingZeros);
  return out;
}
```

(`buildWalletVerificationMessage` and `verifyWalletSignature` are not exported yet — the import will fail at typecheck time. That's expected; they're added in 4b/4c.)

### 4b — `buildWalletVerificationMessage`

- [ ] **Step 4b.1: Add failing tests**

Append to `packages/adapters/src/inbound/http/WalletVerification.test.ts`:

```ts
describe('buildWalletVerificationMessage', () => {
  it('emits the exact domain-bound multi-line format', () => {
    const message = buildWalletVerificationMessage({
      walletId: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
      nonce: 'abc123',
      expiresAt: makeClockTimestamp(1_713_628_800_000),
    });
    expect(message).toBe(
      [
        'CLMM wallet verification',
        '',
        'Wallet: Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
        'Nonce: abc123',
        'Expires: 2024-04-20T14:40:00.000Z',
      ].join('\n'),
    );
  });
});
```

- [ ] **Step 4b.2: Run tests to verify they fail**

Run: `pnpm --filter @clmm/adapters test -- WalletVerification`
Expected: FAIL on `buildWalletVerificationMessage` not exported.

- [ ] **Step 4b.3: Implement `buildWalletVerificationMessage`**

Append to `packages/adapters/src/inbound/http/WalletVerification.ts`:

```ts
export function buildWalletVerificationMessage(params: {
  walletId: string;
  nonce: string;
  expiresAt: ClockTimestamp;
}): string {
  return [
    'CLMM wallet verification',
    '',
    `Wallet: ${params.walletId}`,
    `Nonce: ${params.nonce}`,
    `Expires: ${new Date(params.expiresAt).toISOString()}`,
  ].join('\n');
}
```

- [ ] **Step 4b.4: Run tests to verify they pass**

Run: `pnpm --filter @clmm/adapters test -- WalletVerification`
Expected: PASS for `base58ToBuffer` (4 cases) and `buildWalletVerificationMessage` (1 case). `verifyWalletSignature` tests still fail (not yet exported).

### 4c — `verifyWalletSignature` (WebCrypto Ed25519, base64 signature)

- [ ] **Step 4c.1: Add failing tests**

Append to `packages/adapters/src/inbound/http/WalletVerification.test.ts`:

```ts
function bytesToBase58(bytes: Uint8Array): string {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let leadingZeros = 0;
  for (const b of bytes) {
    if (b === 0) leadingZeros++;
    else break;
  }
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = '';
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n = n / 58n;
  }
  return '1'.repeat(leadingZeros) + out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

async function makeEd25519KeyPair() {
  const keyPair = await globalThis.crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify'],
  );
  const rawPubkey = new Uint8Array(
    await globalThis.crypto.subtle.exportKey('raw', keyPair.publicKey),
  );
  return { keyPair, rawPubkey };
}

async function signBase64(privateKey: CryptoKey, message: string): Promise<string> {
  const sig = await globalThis.crypto.subtle.sign(
    { name: 'Ed25519' },
    privateKey,
    new TextEncoder().encode(message),
  );
  return bytesToBase64(new Uint8Array(sig));
}

describe('verifyWalletSignature', () => {
  it('accepts a real Ed25519 test vector', async () => {
    const { keyPair, rawPubkey } = await makeEd25519KeyPair();
    const walletId = bytesToBase58(rawPubkey);
    const message = 'hello wallet';
    const signatureBase64 = await signBase64(keyPair.privateKey, message);

    const ok = await verifyWalletSignature({ walletId, message, signatureBase64 });
    expect(ok).toBe(true);
  });

  it('rejects a tampered message', async () => {
    const { keyPair, rawPubkey } = await makeEd25519KeyPair();
    const walletId = bytesToBase58(rawPubkey);
    const signatureBase64 = await signBase64(keyPair.privateKey, 'original');

    const ok = await verifyWalletSignature({
      walletId,
      message: 'tampered',
      signatureBase64,
    });
    expect(ok).toBe(false);
  });

  it('rejects a signature from a different key', async () => {
    const { keyPair: alice } = await makeEd25519KeyPair();
    const { rawPubkey: bobPub } = await makeEd25519KeyPair();
    const walletId = bytesToBase58(bobPub);

    const message = 'hello';
    const signatureBase64 = await signBase64(alice.privateKey, message);

    const ok = await verifyWalletSignature({ walletId, message, signatureBase64 });
    expect(ok).toBe(false);
  });

  it('rejects a malformed wallet address', async () => {
    const { keyPair } = await makeEd25519KeyPair();
    const signatureBase64 = await signBase64(keyPair.privateKey, 'msg');

    const ok = await verifyWalletSignature({
      walletId: '0OIl-not-base58',
      message: 'msg',
      signatureBase64,
    });
    expect(ok).toBe(false);
  });

  it('rejects a signature of wrong length', async () => {
    const { rawPubkey } = await makeEd25519KeyPair();
    const walletId = bytesToBase58(rawPubkey);

    const ok = await verifyWalletSignature({
      walletId,
      message: 'x',
      signatureBase64: bytesToBase64(new Uint8Array(32)), // not 64 bytes
    });
    expect(ok).toBe(false);
  });

  it('rejects malformed base64 in the signature field', async () => {
    const { rawPubkey } = await makeEd25519KeyPair();
    const walletId = bytesToBase58(rawPubkey);

    const ok = await verifyWalletSignature({
      walletId,
      message: 'x',
      signatureBase64: '!!!not base64!!!',
    });
    expect(ok).toBe(false);
  });
});
```

- [ ] **Step 4c.2: Run tests to verify they fail**

Run: `pnpm --filter @clmm/adapters test -- WalletVerification`
Expected: FAIL — `verifyWalletSignature` not exported.

- [ ] **Step 4c.3: Implement `verifyWalletSignature`**

Append to `packages/adapters/src/inbound/http/WalletVerification.ts`:

```ts
export async function verifyWalletSignature(params: {
  walletId: string;
  message: string;
  signatureBase64: string;
}): Promise<boolean> {
  try {
    const publicKey = base58ToBuffer(params.walletId, 32);
    const signature = base64ToBytes(params.signatureBase64);
    if (signature.length !== 64) return false;

    const messageBytes = new TextEncoder().encode(params.message);

    const subtle = globalThis.crypto.subtle;
    const jwk = {
      kty: 'OKP',
      crv: 'Ed25519',
      x: bytesToBase64Url(publicKey),
    };
    const cryptoKey = await subtle.importKey(
      'jwk',
      jwk,
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    return await subtle.verify({ name: 'Ed25519' }, cryptoKey, signature, messageBytes);
  } catch {
    return false;
  }
}

function base64ToBytes(b64: string): Uint8Array {
  // Reject characters outside the base64 alphabet to avoid implementation-defined
  // tolerance in atob. atob throws on most invalid input but is permissive about
  // padding — we keep the strict check explicit.
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) {
    throw new Error('Invalid base64');
  }
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
```

- [ ] **Step 4c.4: Run all tests to verify they pass**

Run: `pnpm --filter @clmm/adapters test -- WalletVerification`
Expected: PASS — all 11 cases (4 base58 + 1 message + 6 signature).

- [ ] **Step 4c.5: Commit**

```bash
git add packages/adapters/src/inbound/http/WalletVerification.ts \
        packages/adapters/src/inbound/http/WalletVerification.test.ts
git commit -m "feat(adapters): add WalletVerification helpers (base58, message, Ed25519)"
```

---

## Task 5: Implement `WalletChallengePostgresAdapter`

**Files:**
- Create: `packages/adapters/src/outbound/storage/WalletChallengePostgresAdapter.ts`
- Create: `packages/adapters/src/outbound/storage/WalletChallengePostgresAdapter.test.ts`

Test note: existing Postgres adapters in this repo (`MonitoredWalletStorageAdapter.test.ts`, `OperationalStorageAdapter.test.ts` for the mock-DB style) cover SQL semantics indirectly. Real "exactly one success per challenge" and "consume + enroll transactionally coupled" assertions live in the controller tests against `FakeWalletChallengeRepository` (Tasks 6–7, including the replay test) plus the manual smoke step (Task 16.6). Match convention here with a shape test only.

- [ ] **Step 5.1: Write the shape test**

Create `packages/adapters/src/outbound/storage/WalletChallengePostgresAdapter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { WalletChallengePostgresAdapter } from './WalletChallengePostgresAdapter.js';

describe('WalletChallengePostgresAdapter (unit shape)', () => {
  it('implements issue, get, and consumeAndEnrollIfMatches', () => {
    const methods = ['issue', 'get', 'consumeAndEnrollIfMatches'] as const;
    for (const method of methods) {
      expect(
        typeof WalletChallengePostgresAdapter.prototype[
          method as keyof WalletChallengePostgresAdapter
        ],
      ).toBe('function');
    }
  });
});
```

- [ ] **Step 5.2: Run test to verify it fails**

Run: `pnpm --filter @clmm/adapters test -- WalletChallengePostgresAdapter`
Expected: FAIL — module not found.

- [ ] **Step 5.3: Implement the adapter**

Create `packages/adapters/src/outbound/storage/WalletChallengePostgresAdapter.ts`:

```ts
import { and, eq } from 'drizzle-orm';
import type { Db } from './db.js';
import { walletChallenges, monitoredWallets } from './schema/index.js';
import type {
  WalletChallengeRepository,
  WalletChallengeRow,
  ConsumeAndEnrollResult,
} from '@clmm/application';
import type { WalletId, ClockTimestamp } from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';

export class WalletChallengePostgresAdapter implements WalletChallengeRepository {
  constructor(private readonly db: Db) {}

  async issue(params: {
    walletId: WalletId;
    nonce: string;
    expiresAt: ClockTimestamp;
    issuedAt: ClockTimestamp;
    now: ClockTimestamp;
  }): Promise<WalletChallengeRow> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(walletChallenges)
        .where(eq(walletChallenges.walletId, params.walletId))
        .for('update');

      if (existing && existing.expiresAt >= params.now) {
        return {
          walletId: existing.walletId as WalletId,
          nonce: existing.nonce,
          expiresAt: makeClockTimestamp(existing.expiresAt),
          issuedAt: makeClockTimestamp(existing.issuedAt),
        };
      }

      // Either no row or the existing row is expired. Replace with a fresh one.
      await tx
        .insert(walletChallenges)
        .values({
          walletId: params.walletId,
          nonce: params.nonce,
          expiresAt: params.expiresAt,
          issuedAt: params.issuedAt,
        })
        .onConflictDoUpdate({
          target: walletChallenges.walletId,
          set: {
            nonce: params.nonce,
            expiresAt: params.expiresAt,
            issuedAt: params.issuedAt,
          },
        });

      return {
        walletId: params.walletId,
        nonce: params.nonce,
        expiresAt: params.expiresAt,
        issuedAt: params.issuedAt,
      };
    });
  }

  async get(walletId: WalletId): Promise<WalletChallengeRow | null> {
    const [row] = await this.db
      .select()
      .from(walletChallenges)
      .where(eq(walletChallenges.walletId, walletId));
    if (!row) return null;
    return {
      walletId: row.walletId as WalletId,
      nonce: row.nonce,
      expiresAt: makeClockTimestamp(row.expiresAt),
      issuedAt: makeClockTimestamp(row.issuedAt),
    };
  }

  async consumeAndEnrollIfMatches(params: {
    walletId: WalletId;
    nonce: string;
    now: ClockTimestamp;
    enrolledAt: ClockTimestamp;
  }): Promise<ConsumeAndEnrollResult> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(walletChallenges)
        .where(eq(walletChallenges.walletId, params.walletId))
        .for('update');

      if (!row) return { kind: 'not_found' };
      if (row.nonce !== params.nonce) return { kind: 'mismatch' };
      if (row.expiresAt < params.now) return { kind: 'expired' };

      await tx
        .delete(walletChallenges)
        .where(
          and(
            eq(walletChallenges.walletId, params.walletId),
            eq(walletChallenges.nonce, params.nonce),
          ),
        );

      await tx
        .insert(monitoredWallets)
        .values({
          walletId: params.walletId,
          enrolledAt: params.enrolledAt,
          active: true,
        })
        .onConflictDoUpdate({
          target: monitoredWallets.walletId,
          set: { active: true, enrolledAt: params.enrolledAt },
        });

      return { kind: 'consumed' };
    });
  }
}
```

- [ ] **Step 5.4: Run test to verify it passes**

Run: `pnpm --filter @clmm/adapters test -- WalletChallengePostgresAdapter`
Expected: PASS.

- [ ] **Step 5.5: Typecheck**

Run: `pnpm --filter @clmm/adapters typecheck`
Expected: PASS.

- [ ] **Step 5.6: Commit**

```bash
git add packages/adapters/src/outbound/storage/WalletChallengePostgresAdapter.ts \
        packages/adapters/src/outbound/storage/WalletChallengePostgresAdapter.test.ts
git commit -m "feat(adapters): add WalletChallengePostgresAdapter"
```

---

## Task 6: Rewrite `WalletController` — `issueChallenge` endpoint (TDD)

**Files:**
- Modify: `packages/adapters/src/inbound/http/WalletController.ts` (full rewrite)
- Create: `packages/adapters/src/inbound/http/WalletController.test.ts`

- [ ] **Step 6.1: Write the failing tests for `issueChallenge`**

Create `packages/adapters/src/inbound/http/WalletController.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { WalletController } from './WalletController.js';
import {
  FakeWalletChallengeRepository,
  FakeMonitoredWalletRepository,
  FakeClockPort,
} from '@clmm/testing';
import { buildWalletVerificationMessage } from './WalletVerification.js';
import { makeWalletId, makeClockTimestamp } from '@clmm/domain';

const VALID_WALLET_ID = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';

function makeController(opts?: { now?: number }) {
  const monitoredWallets = new FakeMonitoredWalletRepository();
  const challenges = new FakeWalletChallengeRepository(monitoredWallets);
  const clock = new FakeClockPort(opts?.now ?? 1_000_000);
  const controller = new WalletController(challenges, clock);
  return { controller, challenges, monitoredWallets, clock };
}

describe('WalletController.issueChallenge', () => {
  it('issues a 64-char hex nonce, 5-min expiry, and exact backend-built message', async () => {
    const { controller, challenges } = makeController({ now: 1_000_000 });

    const result = await controller.issueChallenge(VALID_WALLET_ID);

    expect(result.walletId).toBe(VALID_WALLET_ID);
    expect(result.nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(result.expiresAt).toBe(1_000_000 + 5 * 60 * 1000);
    expect(result.message).toBe(
      buildWalletVerificationMessage({
        walletId: VALID_WALLET_ID,
        nonce: result.nonce,
        expiresAt: makeClockTimestamp(result.expiresAt),
      }),
    );

    const stored = challenges.getRowForTest(makeWalletId(VALID_WALLET_ID));
    expect(stored?.nonce).toBe(result.nonce);
    expect(stored?.expiresAt).toBe(result.expiresAt);
    expect(stored?.issuedAt).toBe(1_000_000);
  });

  it('returns 400 WALLET_MALFORMED on invalid wallet id', async () => {
    const { controller, challenges } = makeController();

    await expect(controller.issueChallenge('not-a-real-address')).rejects.toMatchObject({
      status: 400,
      response: { code: 'WALLET_MALFORMED' },
    });
    expect(challenges.getRowForTest(makeWalletId('not-a-real-address'))).toBeUndefined();
  });

  it('is idempotent within the TTL: second call returns same nonce + expiry', async () => {
    const { controller, clock } = makeController({ now: 1_000_000 });

    const first = await controller.issueChallenge(VALID_WALLET_ID);
    clock.advance(60_000); // +1 min, well inside the 5-min TTL
    const second = await controller.issueChallenge(VALID_WALLET_ID);

    expect(second.nonce).toBe(first.nonce);
    expect(second.expiresAt).toBe(first.expiresAt);
    expect(second.message).toBe(first.message);
  });

  it('does not extend expiry on idempotent re-issue', async () => {
    const { controller, clock } = makeController({ now: 1_000_000 });

    const first = await controller.issueChallenge(VALID_WALLET_ID);
    clock.advance(60_000);
    const second = await controller.issueChallenge(VALID_WALLET_ID);

    expect(second.expiresAt).toBe(first.expiresAt); // unchanged
    expect(second.expiresAt).not.toBe(1_000_000 + 60_000 + 5 * 60 * 1000);
  });

  it('replaces nonce and expiry after the previous challenge expires', async () => {
    const { controller, clock } = makeController({ now: 1_000_000 });

    const first = await controller.issueChallenge(VALID_WALLET_ID);
    clock.advance(5 * 60 * 1000 + 1); // past TTL
    const second = await controller.issueChallenge(VALID_WALLET_ID);

    expect(second.nonce).not.toBe(first.nonce);
    expect(second.expiresAt).toBeGreaterThan(first.expiresAt);
  });
});
```

- [ ] **Step 6.2: Run tests to verify they fail**

Run: `pnpm --filter @clmm/adapters test -- WalletController`
Expected: FAIL — current `WalletController` has no `issueChallenge` method, and the constructor signature doesn't match.

- [ ] **Step 6.3: Rewrite `WalletController.ts` with `issueChallenge` only (other endpoints come next)**

Replace the full contents of `packages/adapters/src/inbound/http/WalletController.ts`:

```ts
import {
  Controller,
  Post,
  Param,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import type { WalletChallengeRepository, ClockPort } from '@clmm/application';
import type { WalletId, ClockTimestamp } from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';
import { WALLET_CHALLENGE_REPOSITORY, CLOCK_PORT } from './tokens.js';
import {
  base58ToBuffer,
  buildWalletVerificationMessage,
} from './WalletVerification.js';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

@Controller('wallets')
export class WalletController {
  constructor(
    @Inject(WALLET_CHALLENGE_REPOSITORY)
    private readonly challenges: WalletChallengeRepository,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
  ) {}

  @Post(':walletId/challenge')
  async issueChallenge(@Param('walletId') walletId: string) {
    assertValidWalletId(walletId);
    const now = this.clock.now();
    const candidateExpiresAt = makeClockTimestamp(now + CHALLENGE_TTL_MS);
    const candidateNonce = generateNonceHex();
    const row = await this.challenges.issue({
      walletId: walletId as WalletId,
      nonce: candidateNonce,
      expiresAt: candidateExpiresAt,
      issuedAt: now,
      now,
    });
    const message = buildWalletVerificationMessage({
      walletId: row.walletId,
      nonce: row.nonce,
      expiresAt: row.expiresAt,
    });
    return {
      walletId: row.walletId,
      nonce: row.nonce,
      expiresAt: row.expiresAt as number,
      message,
    };
  }
}

function assertValidWalletId(walletId: string): void {
  try {
    base58ToBuffer(walletId, 32);
  } catch {
    throw new BadRequestException({ code: 'WALLET_MALFORMED' });
  }
}

function generateNonceHex(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}
```

- [ ] **Step 6.4: Run tests to verify they pass**

Run: `pnpm --filter @clmm/adapters test -- WalletController`
Expected: PASS — all 5 `issueChallenge` cases. (NestJS `BadRequestException` exposes `status` 400 and `response` is the payload object passed to its constructor.)

- [ ] **Step 6.5: Typecheck**

Run: `pnpm --filter @clmm/adapters typecheck`
Expected: PASS.

- [ ] **Step 6.6: Commit**

```bash
git add packages/adapters/src/inbound/http/WalletController.ts \
        packages/adapters/src/inbound/http/WalletController.test.ts
git commit -m "feat(adapters): add POST /wallets/:walletId/challenge with idempotent issuance"
```

---

## Task 7: Add `enroll` endpoint to `WalletController` (TDD)

**Files:**
- Modify: `packages/adapters/src/inbound/http/WalletController.ts`
- Modify: `packages/adapters/src/inbound/http/WalletController.test.ts`

- [ ] **Step 7.1: Add failing tests for `enroll`**

Append to `packages/adapters/src/inbound/http/WalletController.test.ts`:

```ts
// Helpers for building a real signed challenge end-to-end.

function bytesToBase58(bytes: Uint8Array): string {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let leadingZeros = 0;
  for (const b of bytes) {
    if (b === 0) leadingZeros++;
    else break;
  }
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = '';
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n = n / 58n;
  }
  return '1'.repeat(leadingZeros) + out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

async function makeSignedChallenge(now: number) {
  const ctx = makeController({ now });
  const keyPair = await globalThis.crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify'],
  );
  const rawPubkey = new Uint8Array(
    await globalThis.crypto.subtle.exportKey('raw', keyPair.publicKey),
  );
  const walletId = bytesToBase58(rawPubkey);

  const challenge = await ctx.controller.issueChallenge(walletId);

  const signatureBytes = new Uint8Array(
    await globalThis.crypto.subtle.sign(
      { name: 'Ed25519' },
      keyPair.privateKey,
      new TextEncoder().encode(challenge.message),
    ),
  );

  return {
    ...ctx,
    walletId,
    nonce: challenge.nonce,
    message: challenge.message,
    signatureBase64: bytesToBase64(signatureBytes),
    keyPair,
  };
}

describe('WalletController.enroll', () => {
  it('enrolls the wallet when nonce, message, and signature all match', async () => {
    const ctx = await makeSignedChallenge(1_000_000);

    const result = await ctx.controller.enroll(ctx.walletId, {
      nonce: ctx.nonce,
      message: ctx.message,
      signature: ctx.signatureBase64,
    });

    expect(result.enrolled).toBe(true);
    expect(typeof result.enrolledAt).toBe('number');

    const active = await ctx.monitoredWallets.listActiveWallets();
    expect(active).toHaveLength(1);
    expect(active[0]?.walletId).toBe(ctx.walletId);

    expect(ctx.challenges.getRowForTest(makeWalletId(ctx.walletId))).toBeUndefined();
  });

  it('returns 400 WALLET_MALFORMED for invalid walletId', async () => {
    const { controller } = makeController();
    await expect(
      controller.enroll('not-a-base58-address', {
        nonce: 'a'.repeat(64),
        message: 'whatever',
        signature: 'AAAA',
      }),
    ).rejects.toMatchObject({ status: 400, response: { code: 'WALLET_MALFORMED' } });
  });

  it('returns 400 BAD_REQUEST on missing nonce', async () => {
    const { controller } = makeController();
    await expect(
      controller.enroll(VALID_WALLET_ID, {
        message: 'm',
        signature: 'AAAA',
      } as never),
    ).rejects.toMatchObject({ status: 400, response: { code: 'BAD_REQUEST' } });
  });

  it('returns 400 BAD_REQUEST on non-hex nonce', async () => {
    const { controller } = makeController();
    await expect(
      controller.enroll(VALID_WALLET_ID, {
        nonce: 'not-hex',
        message: 'm',
        signature: 'AAAA',
      }),
    ).rejects.toMatchObject({ status: 400, response: { code: 'BAD_REQUEST' } });
  });

  it('returns 400 CHALLENGE_NOT_FOUND when no challenge was issued', async () => {
    const { controller, monitoredWallets } = makeController();
    await expect(
      controller.enroll(VALID_WALLET_ID, {
        nonce: 'a'.repeat(64),
        message: 'whatever',
        signature: 'AAAA',
      }),
    ).rejects.toMatchObject({ status: 400, response: { code: 'CHALLENGE_NOT_FOUND' } });
    expect(await monitoredWallets.listActiveWallets()).toHaveLength(0);
  });

  it('returns 410 CHALLENGE_EXPIRED on expired challenge and does not consume', async () => {
    const ctx = await makeSignedChallenge(1_000_000);
    ctx.clock.advance(5 * 60 * 1000 + 1);

    await expect(
      ctx.controller.enroll(ctx.walletId, {
        nonce: ctx.nonce,
        message: ctx.message,
        signature: ctx.signatureBase64,
      }),
    ).rejects.toMatchObject({ status: 410, response: { code: 'CHALLENGE_EXPIRED' } });

    expect(await ctx.monitoredWallets.listActiveWallets()).toHaveLength(0);
    // Expired challenge row remains until the next /challenge call replaces it.
    expect(ctx.challenges.getRowForTest(makeWalletId(ctx.walletId))).toBeDefined();
  });

  it('returns 409 CHALLENGE_MISMATCH on wrong nonce and does not consume', async () => {
    const ctx = await makeSignedChallenge(1_000_000);

    await expect(
      ctx.controller.enroll(ctx.walletId, {
        nonce: 'b'.repeat(64),
        message: ctx.message,
        signature: ctx.signatureBase64,
      }),
    ).rejects.toMatchObject({ status: 409, response: { code: 'CHALLENGE_MISMATCH' } });

    expect(await ctx.monitoredWallets.listActiveWallets()).toHaveLength(0);
    expect(ctx.challenges.getRowForTest(makeWalletId(ctx.walletId))).toBeDefined();
  });

  it('returns 409 CHALLENGE_MISMATCH when message does not match expected', async () => {
    const ctx = await makeSignedChallenge(1_000_000);

    await expect(
      ctx.controller.enroll(ctx.walletId, {
        nonce: ctx.nonce,
        message: ctx.message + ' tampered',
        signature: ctx.signatureBase64,
      }),
    ).rejects.toMatchObject({ status: 409, response: { code: 'CHALLENGE_MISMATCH' } });

    expect(await ctx.monitoredWallets.listActiveWallets()).toHaveLength(0);
    expect(ctx.challenges.getRowForTest(makeWalletId(ctx.walletId))).toBeDefined();
  });

  it('returns 401 SIGNATURE_INVALID on bad signature and does not consume', async () => {
    const ctx = await makeSignedChallenge(1_000_000);
    const badSig = bytesToBase64(new Uint8Array(64)); // all zeros, not a valid Ed25519 sig

    await expect(
      ctx.controller.enroll(ctx.walletId, {
        nonce: ctx.nonce,
        message: ctx.message,
        signature: badSig,
      }),
    ).rejects.toMatchObject({ status: 401, response: { code: 'SIGNATURE_INVALID' } });

    expect(await ctx.monitoredWallets.listActiveWallets()).toHaveLength(0);
    expect(ctx.challenges.getRowForTest(makeWalletId(ctx.walletId))).toBeDefined();
  });

  it('rejects replay of a successful proof with CHALLENGE_NOT_FOUND', async () => {
    const ctx = await makeSignedChallenge(1_000_000);

    await ctx.controller.enroll(ctx.walletId, {
      nonce: ctx.nonce,
      message: ctx.message,
      signature: ctx.signatureBase64,
    });

    await expect(
      ctx.controller.enroll(ctx.walletId, {
        nonce: ctx.nonce,
        message: ctx.message,
        signature: ctx.signatureBase64,
      }),
    ).rejects.toMatchObject({ status: 400, response: { code: 'CHALLENGE_NOT_FOUND' } });
  });
});
```

- [ ] **Step 7.2: Run tests to verify they fail**

Run: `pnpm --filter @clmm/adapters test -- WalletController`
Expected: FAIL — `enroll` method not yet defined.

- [ ] **Step 7.3: Implement `enroll`**

Modify `packages/adapters/src/inbound/http/WalletController.ts`.

Replace the `@nestjs/common` import block with:

```ts
import {
  Controller,
  Post,
  Param,
  Body,
  Inject,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
  HttpException,
} from '@nestjs/common';
```

Replace the `WalletVerification` import block with:

```ts
import {
  base58ToBuffer,
  buildWalletVerificationMessage,
  verifyWalletSignature,
} from './WalletVerification.js';
```

Add the `enroll` method inside the `WalletController` class, after `issueChallenge`:

```ts
  @Post(':walletId/enroll')
  async enroll(
    @Param('walletId') walletId: string,
    @Body() body: { nonce?: unknown; message?: unknown; signature?: unknown },
  ) {
    assertValidWalletId(walletId);
    const { nonce, message, signature } = assertEnrollBody(body);

    const now = this.clock.now();
    const existing = await this.challenges.get(walletId as WalletId);
    if (existing === null) {
      throw new BadRequestException({ code: 'CHALLENGE_NOT_FOUND' });
    }
    if (existing.expiresAt < now) {
      throw new HttpException({ code: 'CHALLENGE_EXPIRED' }, 410);
    }
    if (existing.nonce !== nonce) {
      throw new ConflictException({ code: 'CHALLENGE_MISMATCH' });
    }

    const expectedMessage = buildWalletVerificationMessage({
      walletId,
      nonce: existing.nonce,
      expiresAt: existing.expiresAt,
    });
    if (message !== expectedMessage) {
      throw new ConflictException({ code: 'CHALLENGE_MISMATCH' });
    }

    const verified = await verifyWalletSignature({
      walletId,
      message: expectedMessage,
      signatureBase64: signature,
    });
    if (!verified) {
      throw new UnauthorizedException({ code: 'SIGNATURE_INVALID' });
    }

    const enrolledAt = this.clock.now();
    const result = await this.challenges.consumeAndEnrollIfMatches({
      walletId: walletId as WalletId,
      nonce,
      now: enrolledAt,
      enrolledAt,
    });

    switch (result.kind) {
      case 'consumed':
        return { enrolled: true, enrolledAt: enrolledAt as number };
      case 'not_found':
        // Concurrent request consumed the row between our get() and now.
        throw new BadRequestException({ code: 'CHALLENGE_NOT_FOUND' });
      case 'expired':
        throw new HttpException({ code: 'CHALLENGE_EXPIRED' }, 410);
      case 'mismatch':
        // A concurrent /challenge replaced the row with a fresh nonce.
        throw new ConflictException({ code: 'CHALLENGE_MISMATCH' });
    }
  }
```

Append the body-validation helper at the bottom of the file, below `generateNonceHex`:

```ts
function assertEnrollBody(body: {
  nonce?: unknown;
  message?: unknown;
  signature?: unknown;
}): { nonce: string; message: string; signature: string } {
  const { nonce, message, signature } = body ?? {};
  if (
    typeof nonce !== 'string' ||
    !/^[0-9a-f]{64}$/.test(nonce) ||
    typeof message !== 'string' ||
    message.length === 0 ||
    typeof signature !== 'string' ||
    signature.length === 0
  ) {
    throw new BadRequestException({ code: 'BAD_REQUEST' });
  }
  return { nonce, message, signature };
}
```

- [ ] **Step 7.4: Run tests to verify they pass**

Run: `pnpm --filter @clmm/adapters test -- WalletController`
Expected: PASS — all `issueChallenge` (5) + `enroll` (10) cases.

- [ ] **Step 7.5: Typecheck**

Run: `pnpm --filter @clmm/adapters typecheck`
Expected: PASS.

- [ ] **Step 7.6: Commit**

```bash
git add packages/adapters/src/inbound/http/WalletController.ts \
        packages/adapters/src/inbound/http/WalletController.test.ts
git commit -m "feat(adapters): add POST /wallets/:walletId/enroll with verification + atomic enroll"
```

---

## Task 8: Convert `/monitor` to a 410 tombstone

**Files:**
- Modify: `packages/adapters/src/inbound/http/WalletController.ts`
- Modify: `packages/adapters/src/inbound/http/WalletController.test.ts`

- [ ] **Step 8.1: Add failing test**

Append to `packages/adapters/src/inbound/http/WalletController.test.ts`:

```ts
describe('WalletController.monitor (tombstone)', () => {
  it('always returns 410 ENROLLMENT_UPGRADE_REQUIRED', async () => {
    const { controller, monitoredWallets } = makeController();

    await expect(controller.monitor(VALID_WALLET_ID)).rejects.toMatchObject({
      status: 410,
      response: { code: 'ENROLLMENT_UPGRADE_REQUIRED' },
    });

    expect(await monitoredWallets.listActiveWallets()).toHaveLength(0);
  });

  it('returns 410 even for a malformed walletId — never falls through to enrollment', async () => {
    const { controller, monitoredWallets } = makeController();

    await expect(controller.monitor('not-a-base58-address')).rejects.toMatchObject({
      status: 410,
      response: { code: 'ENROLLMENT_UPGRADE_REQUIRED' },
    });

    expect(await monitoredWallets.listActiveWallets()).toHaveLength(0);
  });
});
```

- [ ] **Step 8.2: Run test to verify it fails**

Run: `pnpm --filter @clmm/adapters test -- WalletController`
Expected: FAIL — `monitor` method does not exist.

- [ ] **Step 8.3: Add the tombstone handler**

Modify `packages/adapters/src/inbound/http/WalletController.ts`. Inside the `WalletController` class, after `enroll`, add:

```ts
  @Post(':walletId/monitor')
  monitor(@Param('walletId') _walletId: string): never {
    throw new HttpException({ code: 'ENROLLMENT_UPGRADE_REQUIRED' }, 410);
  }
```

(The `_walletId` parameter is intentionally unused — the endpoint never inspects it, never validates it, and never reaches the monitored-wallet repo.)

- [ ] **Step 8.4: Run tests to verify they pass**

Run: `pnpm --filter @clmm/adapters test -- WalletController`
Expected: PASS — all challenge (5) + enroll (10) + monitor (2) cases.

- [ ] **Step 8.5: Typecheck and lint**

Run: `pnpm --filter @clmm/adapters typecheck && pnpm --filter @clmm/adapters lint`
Expected: both PASS.

- [ ] **Step 8.6: Commit**

```bash
git add packages/adapters/src/inbound/http/WalletController.ts \
        packages/adapters/src/inbound/http/WalletController.test.ts
git commit -m "feat(adapters): convert POST /wallets/:walletId/monitor to 410 tombstone"
```

---

## Task 9: Wire `WalletChallengePostgresAdapter` into `AppModule`

**Files:**
- Modify: `packages/adapters/src/inbound/http/AppModule.ts`

- [ ] **Step 9.1: Register the adapter and provider**

Modify `packages/adapters/src/inbound/http/AppModule.ts`.

After the `MonitoredWalletStorageAdapter` import, add:

```ts
import { WalletChallengePostgresAdapter } from '../../outbound/storage/WalletChallengePostgresAdapter.js';
```

In the tokens import block, add `WALLET_CHALLENGE_REPOSITORY` next to `MONITORED_WALLET_REPOSITORY`:

```ts
  MONITORED_WALLET_REPOSITORY,
  WALLET_CHALLENGE_REPOSITORY,
```

After the `const monitoredWalletStorage = new MonitoredWalletStorageAdapter(db);` line, add:

```ts
const walletChallengeStorage = new WalletChallengePostgresAdapter(db);
```

Inside the `providers` array, after the `MONITORED_WALLET_REPOSITORY` provider entry, add:

```ts
    { provide: WALLET_CHALLENGE_REPOSITORY, useValue: walletChallengeStorage },
```

The existing `WalletController` is already in the `controllers` array; no change there.

- [ ] **Step 9.2: Typecheck the whole repo**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 9.3: Boundaries**

Run: `pnpm boundaries`
Expected: PASS.

- [ ] **Step 9.4: Commit**

```bash
git add packages/adapters/src/inbound/http/AppModule.ts
git commit -m "feat(adapters): wire WalletChallengePostgresAdapter in AppModule"
```

---

## Task 10: App API — typed `requestWalletChallenge` and `enrollWalletWithProof` with structured error parsing

**Files:**
- Modify: `apps/app/src/api/wallets.ts` (full rewrite)
- Create: `apps/app/src/api/wallets.test.ts`

This task introduces the typed API surface that the orchestrator (Task 14) will call. It replaces the existing `enrollWalletForMonitoring` export entirely. Connect screen still imports the old name — it's updated in Task 15.

- [ ] **Step 10.1: Write failing tests for the new client functions**

Create `apps/app/src/api/wallets.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  requestWalletChallenge,
  enrollWalletWithProof,
  type EnrollErrorCode,
} from './wallets';

const BASE_URL = 'https://bff.test';

beforeEach(() => {
  process.env['EXPO_PUBLIC_BFF_BASE_URL'] = BASE_URL;
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('requestWalletChallenge', () => {
  it('returns the parsed challenge on success', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse(200, {
        walletId: 'wallet-1',
        nonce: 'a'.repeat(64),
        expiresAt: 1_777_750_000_000,
        message: 'CLMM wallet verification\n…',
      }),
    );

    const result = await requestWalletChallenge('wallet-1');

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.challenge.walletId).toBe('wallet-1');
      expect(result.challenge.nonce).toMatch(/^[0-9a-f]{64}$/);
      expect(result.challenge.expiresAt).toBe(1_777_750_000_000);
    }
  });

  it('maps WALLET_MALFORMED to a typed error', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse(400, { code: 'WALLET_MALFORMED' }),
    );

    const result = await requestWalletChallenge('garbage');

    expect(result).toEqual({ kind: 'error', code: 'WALLET_MALFORMED' satisfies EnrollErrorCode });
  });

  it('maps unknown server errors to NETWORK_ERROR', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse(500, { error: 'oops' }),
    );

    const result = await requestWalletChallenge('wallet-1');

    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.code).toBe('NETWORK_ERROR');
    }
  });

  it('maps fetch failures to NETWORK_ERROR', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('offline'));

    const result = await requestWalletChallenge('wallet-1');
    expect(result).toEqual({ kind: 'error', code: 'NETWORK_ERROR' });
  });
});

describe('enrollWalletWithProof', () => {
  it('returns ok on success', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse(200, { enrolled: true, enrolledAt: 1_000_000 }),
    );

    const result = await enrollWalletWithProof('wallet-1', {
      nonce: 'a'.repeat(64),
      message: 'CLMM wallet verification\n…',
      signature: 'AAAA',
    });
    expect(result).toEqual({ kind: 'ok', enrolledAt: 1_000_000 });
  });

  it('parses each documented backend code into a typed outcome', async () => {
    const cases: Array<{ status: number; code: EnrollErrorCode }> = [
      { status: 400, code: 'WALLET_MALFORMED' },
      { status: 400, code: 'CHALLENGE_NOT_FOUND' },
      { status: 410, code: 'CHALLENGE_EXPIRED' },
      { status: 409, code: 'CHALLENGE_MISMATCH' },
      { status: 401, code: 'SIGNATURE_INVALID' },
      { status: 410, code: 'ENROLLMENT_UPGRADE_REQUIRED' },
      { status: 400, code: 'BAD_REQUEST' },
    ];

    for (const c of cases) {
      (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        jsonResponse(c.status, { code: c.code }),
      );
      const result = await enrollWalletWithProof('wallet-1', {
        nonce: 'a'.repeat(64),
        message: 'm',
        signature: 'AAAA',
      });
      expect(result).toEqual({ kind: 'error', code: c.code });
    }
  });
});
```

- [ ] **Step 10.2: Run tests to verify they fail**

Run: `pnpm --filter @clmm/app test -- src/api/wallets`
Expected: FAIL — new exports don't exist yet.

- [ ] **Step 10.3: Rewrite `apps/app/src/api/wallets.ts`**

Replace the full contents of `apps/app/src/api/wallets.ts`:

```ts
import { getBffBaseUrl } from './http';

export type WalletChallenge = {
  walletId: string;
  nonce: string;
  expiresAt: number;
  message: string;
};

export type EnrollErrorCode =
  | 'WALLET_MALFORMED'
  | 'CHALLENGE_NOT_FOUND'
  | 'CHALLENGE_EXPIRED'
  | 'CHALLENGE_MISMATCH'
  | 'SIGNATURE_INVALID'
  | 'ENROLLMENT_UPGRADE_REQUIRED'
  | 'BAD_REQUEST'
  | 'NETWORK_ERROR';

export type ChallengeResult =
  | { kind: 'ok'; challenge: WalletChallenge }
  | { kind: 'error'; code: EnrollErrorCode };

export type EnrollResult =
  | { kind: 'ok'; enrolledAt: number }
  | { kind: 'error'; code: EnrollErrorCode };

const KNOWN_CODES = new Set<EnrollErrorCode>([
  'WALLET_MALFORMED',
  'CHALLENGE_NOT_FOUND',
  'CHALLENGE_EXPIRED',
  'CHALLENGE_MISMATCH',
  'SIGNATURE_INVALID',
  'ENROLLMENT_UPGRADE_REQUIRED',
  'BAD_REQUEST',
]);

export async function requestWalletChallenge(walletId: string): Promise<ChallengeResult> {
  let response: Response;
  try {
    response = await fetch(`${getBffBaseUrl()}/wallets/${walletId}/challenge`, {
      method: 'POST',
    });
  } catch {
    return { kind: 'error', code: 'NETWORK_ERROR' };
  }
  if (!response.ok) {
    return { kind: 'error', code: await parseErrorCode(response) };
  }
  const body: unknown = await response.json().catch(() => null);
  const challenge = parseChallenge(body);
  if (challenge === null) return { kind: 'error', code: 'NETWORK_ERROR' };
  return { kind: 'ok', challenge };
}

export async function enrollWalletWithProof(
  walletId: string,
  proof: { nonce: string; message: string; signature: string },
): Promise<EnrollResult> {
  let response: Response;
  try {
    response = await fetch(`${getBffBaseUrl()}/wallets/${walletId}/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proof),
    });
  } catch {
    return { kind: 'error', code: 'NETWORK_ERROR' };
  }
  if (!response.ok) {
    return { kind: 'error', code: await parseErrorCode(response) };
  }
  const body: unknown = await response.json().catch(() => null);
  if (
    typeof body === 'object' &&
    body !== null &&
    'enrolledAt' in body &&
    typeof (body as { enrolledAt: unknown }).enrolledAt === 'number'
  ) {
    return { kind: 'ok', enrolledAt: (body as { enrolledAt: number }).enrolledAt };
  }
  return { kind: 'error', code: 'NETWORK_ERROR' };
}

function parseChallenge(value: unknown): WalletChallenge | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v['walletId'] !== 'string' ||
    typeof v['nonce'] !== 'string' ||
    typeof v['expiresAt'] !== 'number' ||
    typeof v['message'] !== 'string'
  ) {
    return null;
  }
  return {
    walletId: v['walletId'],
    nonce: v['nonce'],
    expiresAt: v['expiresAt'],
    message: v['message'],
  };
}

async function parseErrorCode(response: Response): Promise<EnrollErrorCode> {
  const body: unknown = await response.json().catch(() => null);
  if (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { code: unknown }).code === 'string' &&
    KNOWN_CODES.has((body as { code: string }).code as EnrollErrorCode)
  ) {
    return (body as { code: EnrollErrorCode }).code;
  }
  return 'NETWORK_ERROR';
}
```

- [ ] **Step 10.4: Run tests to verify they pass**

Run: `pnpm --filter @clmm/app test -- src/api/wallets`
Expected: PASS — all 10 cases.

- [ ] **Step 10.5: Typecheck**

Run: `pnpm --filter @clmm/app typecheck`
Expected: FAIL on `apps/app/app/connect.tsx` — `enrollWalletForMonitoring` no longer exists. This is expected and is fixed in Task 15. Do NOT add a re-export shim. Move on.

- [ ] **Step 10.6: Commit**

```bash
git add apps/app/src/api/wallets.ts apps/app/src/api/wallets.test.ts
git commit -m "feat(app): add typed wallet challenge/enroll API with structured error parsing"
```

---

## Task 11: App browser signer — add `signMessageBytes` to ConnectorKit adapter

**Files:**
- Modify: `apps/app/src/platform/browserWallet/connectorKitAdapter.web.ts`
- Modify: `apps/app/src/platform/browserWallet/connectorKitAdapter.ts`
- Modify: `apps/app/src/platform/browserWallet/connectorKitAdapter.native.ts`

Test note: existing tests for `useBrowserWalletSign` already use a mocked adapter shape. We extend the type and stubs uniformly so the build keeps compiling on every platform target.

Before writing code that touches `@solana/connector`, run the `solana-adapter-docs` skill or check Context7 for the current ConnectorKit message-signing API surface — the package has had breaking changes between minor versions.

- [ ] **Step 11.1: Confirm the message signer API on `@solana/connector`**

Use Skill `solana-adapter-docs` (or Context7) to confirm whether `useTransactionSigner` returns a signer with `signMessage`, or whether a dedicated `useMessageSigner` hook exists. The plan below assumes the same `signer` returned by `useTransactionSigner` exposes `signMessage(messageBytes: Uint8Array): Promise<Uint8Array | { signature: Uint8Array }>`. If the actual surface differs, adjust Step 11.2 to use the correct hook/method but keep the public `signMessageBytes(payload: Uint8Array): Promise<Uint8Array>` signature stable.

- [ ] **Step 11.2: Extend the web adapter**

Modify `apps/app/src/platform/browserWallet/connectorKitAdapter.web.ts`.

In the `ConnectorKitAdapterResult` type, after `signTransactionBytes`, add:

```ts
  signMessageBytes: (message: Uint8Array) => Promise<Uint8Array>;
```

Inside `useConnectorKitAdapter`, after the `signTransactionBytes` `useCallback`, add:

```ts
  const signMessageBytes = useCallback(
    async (message: Uint8Array): Promise<Uint8Array> => {
      if (!signer) {
        throw new Error('No wallet account is connected');
      }
      const signed = await signer.signMessage(message);
      if (signed instanceof Uint8Array) return signed;
      if (signed && typeof signed === 'object' && 'signature' in signed) {
        const sig = (signed as { signature: unknown }).signature;
        if (sig instanceof Uint8Array) return sig;
      }
      throw new Error('Signer returned unsupported message signature format');
    },
    [signer],
  );
```

Add `signMessageBytes` to the returned object (before the closing `})`):

```ts
      signMessageBytes,
```

And add `signMessageBytes` to the `useMemo` dependency array (after `signTransactionBytes`).

- [ ] **Step 11.3: Update the placeholder web adapter (`connectorKitAdapter.ts`)**

Modify `apps/app/src/platform/browserWallet/connectorKitAdapter.ts`. Add to the type after `signTransactionBytes`:

```ts
  signMessageBytes: (message: Uint8Array) => Promise<Uint8Array>;
```

Add to `UNRESOLVED_STUB` after `signTransactionBytes`:

```ts
  signMessageBytes: async () => {
    throw new Error('Browser wallet is not available on this platform');
  },
```

- [ ] **Step 11.4: Update the native stub (`connectorKitAdapter.native.ts`)**

Modify `apps/app/src/platform/browserWallet/connectorKitAdapter.native.ts`. Add to the type after `signTransactionBytes`:

```ts
  signMessageBytes: (message: Uint8Array) => Promise<Uint8Array>;
```

Add to `NATIVE_STUB` after `signTransactionBytes`:

```ts
  signMessageBytes: async () => {
    throw new Error('Browser wallet is not available on native platforms');
  },
```

- [ ] **Step 11.5: Typecheck**

Run: `pnpm --filter @clmm/app typecheck`
Expected: PASS for these files. (Connect screen is still broken from Task 10 — that's fine, it's fixed in Task 15.)

- [ ] **Step 11.6: Run any existing useBrowserWalletSign tests as a smoke check**

Run: `pnpm --filter @clmm/app test -- useBrowserWalletSign`
Expected: PASS — adding a method to the adapter type does not break existing tests, which already mock the adapter shape.

- [ ] **Step 11.7: Commit**

```bash
git add apps/app/src/platform/browserWallet/connectorKitAdapter.web.ts \
        apps/app/src/platform/browserWallet/connectorKitAdapter.ts \
        apps/app/src/platform/browserWallet/connectorKitAdapter.native.ts
git commit -m "feat(app): add signMessageBytes to ConnectorKit adapter (web + stubs)"
```

---

## Task 12: App native signer — `signNativeMessage` via MWA

**Files:**
- Modify: `apps/app/src/platform/nativeWallet.ts`

Before writing code that touches MWA, run the `solana-adapter-docs` skill or Context7 to confirm the current shape of `signMessages` on `@solana-mobile/mobile-wallet-adapter-protocol-kit`. The plan below assumes `signMessages({ addresses, payloads })` where `addresses` is an array of base58 wallet addresses and `payloads` is an array of base64-encoded message bytes, returning `{ signed_payloads: string[] }` of base64-encoded signature bytes (the same envelope shape as `signTransactions`). Adjust if the real surface differs.

- [ ] **Step 12.1: Confirm MWA `signMessages` shape**

Use Skill `solana-adapter-docs` (or Context7) to verify the parameter and return shape. If different, adjust Step 12.2 — but keep the public function signature stable.

- [ ] **Step 12.2: Add `signNativeMessage`**

Modify `apps/app/src/platform/nativeWallet.ts`.

Extend the `NativeSigningWallet` type to include `signMessages`:

```ts
type NativeSigningWallet = {
  authorize(args: { identity: typeof APP_IDENTITY; chain: Chain }): Promise<{
    accounts: Array<{ address: string }>;
  }>;
  signTransactions(args: { payloads: string[] }): Promise<{
    signed_payloads: string[];
  }>;
  signMessages(args: { addresses: string[]; payloads: string[] }): Promise<{
    signed_payloads: string[];
  }>;
};
```

Append the new function at the bottom of the file:

```ts
export async function signNativeMessage(params: {
  walletId: string;
  message: string;
  cluster?: string;
}): Promise<string> {
  return transact(async (wallet) => {
    const signingWallet = wallet as unknown as NativeSigningWallet;
    const authorization = await signingWallet.authorize({
      identity: APP_IDENTITY,
      chain: (params.cluster ?? 'solana:mainnet') as Chain,
    });
    const account = authorization.accounts[0];
    if (!account || account.address !== params.walletId) {
      throw new Error('Native wallet did not return the requested authorized account');
    }

    const messageBase64 = utf8ToBase64(params.message);
    const result = await signingWallet.signMessages({
      addresses: [params.walletId],
      payloads: [messageBase64],
    });
    const signed = result.signed_payloads[0];
    if (typeof signed !== 'string' || signed.length === 0) {
      throw new Error('Native wallet did not return a signed message');
    }
    return signed; // base64-encoded signature bytes
  });
}

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  if (typeof btoa === 'function') return btoa(binary);
  return Buffer.from(binary, 'binary').toString('base64');
}
```

- [ ] **Step 12.3: Typecheck**

Run: `pnpm --filter @clmm/app typecheck`
Expected: PASS for this file. (Connect screen still broken — fixed in Task 15.)

- [ ] **Step 12.4: Commit**

```bash
git add apps/app/src/platform/nativeWallet.ts
git commit -m "feat(app): add signNativeMessage via MWA signMessages"
```

---

## Task 13: App cross-platform message signer

**Files:**
- Create: `apps/app/src/wallet-verify/signMessageWithWallet.ts`

This module is a thin router that the orchestrator (Task 14) calls. It picks the correct platform signer based on `connectionKind` and asserts the signing account matches the requested `walletId` — the spec's "verify the signing account still matches the target `walletId`" requirement at the platform boundary.

- [ ] **Step 13.1: Create the signer router**

Create `apps/app/src/wallet-verify/signMessageWithWallet.ts`:

```ts
import { signNativeMessage } from '../platform/nativeWallet';
import type { WalletConnectionKind } from '../state/walletSessionStore';

export type SignMessageOutcome =
  | { kind: 'ok'; signatureBase64: string }
  | { kind: 'unsupported' }
  | { kind: 'wallet-mismatch' }
  | { kind: 'rejected' }
  | { kind: 'failed' };

export type BrowserMessageSigner = {
  isConnected: boolean;
  account: string | null;
  signMessageBytes: (message: Uint8Array) => Promise<Uint8Array>;
};

export async function signMessageWithWallet(params: {
  walletId: string;
  connectionKind: WalletConnectionKind;
  message: string;
  browserSigner: BrowserMessageSigner | null;
}): Promise<SignMessageOutcome> {
  if (params.connectionKind === 'native') {
    try {
      const signatureBase64 = await signNativeMessage({
        walletId: params.walletId,
        message: params.message,
      });
      return { kind: 'ok', signatureBase64 };
    } catch (error) {
      return classifyError(error, params.walletId);
    }
  }

  // Browser path
  const signer = params.browserSigner;
  if (signer === null || typeof signer.signMessageBytes !== 'function') {
    return { kind: 'unsupported' };
  }
  if (!signer.isConnected) {
    return { kind: 'failed' };
  }
  if (signer.account !== params.walletId) {
    return { kind: 'wallet-mismatch' };
  }

  try {
    const messageBytes = new TextEncoder().encode(params.message);
    const signatureBytes = await signer.signMessageBytes(messageBytes);
    return { kind: 'ok', signatureBase64: bytesToBase64(signatureBytes) };
  } catch (error) {
    return classifyError(error, params.walletId);
  }
}

function classifyError(error: unknown, walletId: string): SignMessageOutcome {
  const message = error instanceof Error ? error.message : String(error);
  if (/not return the requested authorized account/i.test(message)) {
    return { kind: 'wallet-mismatch' };
  }
  if (/wallet account is connected/i.test(message)) {
    return { kind: 'failed' };
  }
  if (/unsupported|not (?:available|implemented)/i.test(message)) {
    return { kind: 'unsupported' };
  }
  if (/reject|denied|cancell?ed|user/i.test(message)) {
    return { kind: 'rejected' };
  }
  // Mention walletId in the unhandled-failure path so logs aren't ambiguous.
  void walletId;
  return { kind: 'failed' };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  if (typeof btoa === 'function') return btoa(binary);
  return Buffer.from(binary, 'binary').toString('base64');
}
```

- [ ] **Step 13.2: Typecheck**

Run: `pnpm --filter @clmm/app typecheck`
Expected: PASS for this file.

- [ ] **Step 13.3: Commit**

```bash
git add apps/app/src/wallet-verify/signMessageWithWallet.ts
git commit -m "feat(app): add cross-platform signMessageWithWallet router"
```

---

## Task 14: App orchestrator — `verifyWalletEnrollment` (TDD)

**Files:**
- Create: `apps/app/src/wallet-verify/verifyWalletEnrollment.ts`
- Create: `apps/app/src/wallet-verify/verifyWalletEnrollment.test.ts`

This is the function `connect.tsx` will call after a successful wallet connection.

- [ ] **Step 14.1: Write failing tests**

Create `apps/app/src/wallet-verify/verifyWalletEnrollment.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyWalletEnrollment, type EnrollmentOutcome } from './verifyWalletEnrollment';
import type { WalletChallenge, ChallengeResult, EnrollResult } from '../api/wallets';
import type { SignMessageOutcome } from './signMessageWithWallet';

type Mocks = {
  requestWalletChallenge: ReturnType<typeof vi.fn>;
  enrollWalletWithProof: ReturnType<typeof vi.fn>;
  signMessageWithWallet: ReturnType<typeof vi.fn>;
};

let mocks: Mocks;

vi.mock('../api/wallets', () => ({
  requestWalletChallenge: (...args: unknown[]) => mocks.requestWalletChallenge(...args),
  enrollWalletWithProof: (...args: unknown[]) => mocks.enrollWalletWithProof(...args),
}));
vi.mock('./signMessageWithWallet', () => ({
  signMessageWithWallet: (...args: unknown[]) => mocks.signMessageWithWallet(...args),
}));

const VALID_CHALLENGE: WalletChallenge = {
  walletId: 'wallet-1',
  nonce: 'a'.repeat(64),
  expiresAt: 1_777_750_000_000,
  message: 'CLMM wallet verification\n\nWallet: wallet-1\nNonce: …',
};

beforeEach(() => {
  mocks = {
    requestWalletChallenge: vi.fn(),
    enrollWalletWithProof: vi.fn(),
    signMessageWithWallet: vi.fn(),
  };
});

describe('verifyWalletEnrollment', () => {
  it('returns enrolled on the happy path', async () => {
    mocks.requestWalletChallenge.mockResolvedValueOnce({
      kind: 'ok',
      challenge: VALID_CHALLENGE,
    } satisfies ChallengeResult);
    mocks.signMessageWithWallet.mockResolvedValueOnce({
      kind: 'ok',
      signatureBase64: 'AAAA',
    } satisfies SignMessageOutcome);
    mocks.enrollWalletWithProof.mockResolvedValueOnce({
      kind: 'ok',
      enrolledAt: 1_000_000,
    } satisfies EnrollResult);

    const outcome = await verifyWalletEnrollment({
      walletId: 'wallet-1',
      connectionKind: 'browser',
      browserSigner: { isConnected: true, account: 'wallet-1', signMessageBytes: async () => new Uint8Array(64) },
    });

    expect(outcome).toEqual({ kind: 'enrolled', enrolledAt: 1_000_000 } satisfies EnrollmentOutcome);
    expect(mocks.requestWalletChallenge).toHaveBeenCalledWith('wallet-1');
    expect(mocks.signMessageWithWallet).toHaveBeenCalledWith({
      walletId: 'wallet-1',
      connectionKind: 'browser',
      message: VALID_CHALLENGE.message,
      browserSigner: expect.any(Object),
    });
    expect(mocks.enrollWalletWithProof).toHaveBeenCalledWith('wallet-1', {
      nonce: VALID_CHALLENGE.nonce,
      message: VALID_CHALLENGE.message,
      signature: 'AAAA',
    });
  });

  it('returns challenge-failed on /challenge error and does not call /enroll or /monitor', async () => {
    mocks.requestWalletChallenge.mockResolvedValueOnce({
      kind: 'error',
      code: 'WALLET_MALFORMED',
    } satisfies ChallengeResult);

    const outcome = await verifyWalletEnrollment({
      walletId: 'bad',
      connectionKind: 'browser',
      browserSigner: null,
    });

    expect(outcome).toEqual({ kind: 'challenge-failed', code: 'WALLET_MALFORMED' });
    expect(mocks.signMessageWithWallet).not.toHaveBeenCalled();
    expect(mocks.enrollWalletWithProof).not.toHaveBeenCalled();
  });

  it('returns signing-unsupported when the signer cannot sign messages', async () => {
    mocks.requestWalletChallenge.mockResolvedValueOnce({ kind: 'ok', challenge: VALID_CHALLENGE });
    mocks.signMessageWithWallet.mockResolvedValueOnce({ kind: 'unsupported' });

    const outcome = await verifyWalletEnrollment({
      walletId: 'wallet-1',
      connectionKind: 'browser',
      browserSigner: null,
    });

    expect(outcome).toEqual({ kind: 'signing-unsupported' });
    expect(mocks.enrollWalletWithProof).not.toHaveBeenCalled();
  });

  it('returns wallet-mismatch when the signer account differs', async () => {
    mocks.requestWalletChallenge.mockResolvedValueOnce({ kind: 'ok', challenge: VALID_CHALLENGE });
    mocks.signMessageWithWallet.mockResolvedValueOnce({ kind: 'wallet-mismatch' });

    const outcome = await verifyWalletEnrollment({
      walletId: 'wallet-1',
      connectionKind: 'native',
      browserSigner: null,
    });

    expect(outcome).toEqual({ kind: 'wallet-mismatch' });
    expect(mocks.enrollWalletWithProof).not.toHaveBeenCalled();
  });

  it('returns user-rejected when the user declines to sign', async () => {
    mocks.requestWalletChallenge.mockResolvedValueOnce({ kind: 'ok', challenge: VALID_CHALLENGE });
    mocks.signMessageWithWallet.mockResolvedValueOnce({ kind: 'rejected' });

    const outcome = await verifyWalletEnrollment({
      walletId: 'wallet-1',
      connectionKind: 'browser',
      browserSigner: { isConnected: true, account: 'wallet-1', signMessageBytes: async () => new Uint8Array(64) },
    });

    expect(outcome).toEqual({ kind: 'user-rejected' });
    expect(mocks.enrollWalletWithProof).not.toHaveBeenCalled();
  });

  it('returns enroll-failed when /enroll returns an error code', async () => {
    mocks.requestWalletChallenge.mockResolvedValueOnce({ kind: 'ok', challenge: VALID_CHALLENGE });
    mocks.signMessageWithWallet.mockResolvedValueOnce({ kind: 'ok', signatureBase64: 'AAAA' });
    mocks.enrollWalletWithProof.mockResolvedValueOnce({
      kind: 'error',
      code: 'CHALLENGE_EXPIRED',
    } satisfies EnrollResult);

    const outcome = await verifyWalletEnrollment({
      walletId: 'wallet-1',
      connectionKind: 'browser',
      browserSigner: { isConnected: true, account: 'wallet-1', signMessageBytes: async () => new Uint8Array(64) },
    });

    expect(outcome).toEqual({ kind: 'enroll-failed', code: 'CHALLENGE_EXPIRED' });
  });

  it('never calls /monitor on any failure path', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    // Drive every failure outcome plus success and check fetch was never asked
    // to call a /monitor URL.
    mocks.requestWalletChallenge
      .mockResolvedValueOnce({ kind: 'error', code: 'WALLET_MALFORMED' })
      .mockResolvedValue({ kind: 'ok', challenge: VALID_CHALLENGE });
    mocks.signMessageWithWallet
      .mockResolvedValueOnce({ kind: 'unsupported' })
      .mockResolvedValueOnce({ kind: 'wallet-mismatch' })
      .mockResolvedValueOnce({ kind: 'rejected' })
      .mockResolvedValueOnce({ kind: 'failed' })
      .mockResolvedValue({ kind: 'ok', signatureBase64: 'AAAA' });
    mocks.enrollWalletWithProof
      .mockResolvedValueOnce({ kind: 'error', code: 'CHALLENGE_EXPIRED' })
      .mockResolvedValue({ kind: 'ok', enrolledAt: 1_000_000 });

    for (let i = 0; i < 7; i++) {
      await verifyWalletEnrollment({
        walletId: 'wallet-1',
        connectionKind: 'browser',
        browserSigner: { isConnected: true, account: 'wallet-1', signMessageBytes: async () => new Uint8Array(64) },
      });
    }

    const monitorCalls = fetchSpy.mock.calls.filter(([input]) =>
      typeof input === 'string' && input.includes('/monitor'),
    );
    expect(monitorCalls).toEqual([]);

    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 14.2: Run tests to verify they fail**

Run: `pnpm --filter @clmm/app test -- verifyWalletEnrollment`
Expected: FAIL — module does not exist.

- [ ] **Step 14.3: Implement the orchestrator**

Create `apps/app/src/wallet-verify/verifyWalletEnrollment.ts`:

```ts
import {
  requestWalletChallenge,
  enrollWalletWithProof,
  type EnrollErrorCode,
} from '../api/wallets';
import {
  signMessageWithWallet,
  type BrowserMessageSigner,
} from './signMessageWithWallet';
import type { WalletConnectionKind } from '../state/walletSessionStore';

export type EnrollmentOutcome =
  | { kind: 'enrolled'; enrolledAt: number }
  | { kind: 'challenge-failed'; code: EnrollErrorCode }
  | { kind: 'signing-unsupported' }
  | { kind: 'wallet-mismatch' }
  | { kind: 'user-rejected' }
  | { kind: 'signing-failed' }
  | { kind: 'enroll-failed'; code: EnrollErrorCode };

export async function verifyWalletEnrollment(params: {
  walletId: string;
  connectionKind: WalletConnectionKind;
  browserSigner: BrowserMessageSigner | null;
}): Promise<EnrollmentOutcome> {
  const challenge = await requestWalletChallenge(params.walletId);
  if (challenge.kind === 'error') {
    return { kind: 'challenge-failed', code: challenge.code };
  }

  const signed = await signMessageWithWallet({
    walletId: params.walletId,
    connectionKind: params.connectionKind,
    message: challenge.challenge.message,
    browserSigner: params.browserSigner,
  });

  switch (signed.kind) {
    case 'unsupported':
      return { kind: 'signing-unsupported' };
    case 'wallet-mismatch':
      return { kind: 'wallet-mismatch' };
    case 'rejected':
      return { kind: 'user-rejected' };
    case 'failed':
      return { kind: 'signing-failed' };
    case 'ok':
      break;
  }

  const enroll = await enrollWalletWithProof(params.walletId, {
    nonce: challenge.challenge.nonce,
    message: challenge.challenge.message,
    signature: signed.signatureBase64,
  });

  if (enroll.kind === 'error') {
    return { kind: 'enroll-failed', code: enroll.code };
  }
  return { kind: 'enrolled', enrolledAt: enroll.enrolledAt };
}
```

- [ ] **Step 14.4: Run tests to verify they pass**

Run: `pnpm --filter @clmm/app test -- verifyWalletEnrollment`
Expected: PASS — all 7 cases.

- [ ] **Step 14.5: Typecheck**

Run: `pnpm --filter @clmm/app typecheck`
Expected: still FAILS on `apps/app/app/connect.tsx` (the import we removed in Task 10). That's expected; Task 15 fixes it.

- [ ] **Step 14.6: Commit**

```bash
git add apps/app/src/wallet-verify/verifyWalletEnrollment.ts \
        apps/app/src/wallet-verify/verifyWalletEnrollment.test.ts
git commit -m "feat(app): add verifyWalletEnrollment orchestrator"
```

---

## Task 15: Wire `verifyWalletEnrollment` into the connect screen

**Files:**
- Modify: `apps/app/app/connect.tsx`

The current `connect.tsx` calls `enrollWalletForMonitoring(address).catch(() => {})` immediately after `markConnected` and then navigates regardless of the result. The spec requires:

> The app must not navigate to the ready app state until verified enrollment succeeds.

So enrollment must succeed before `navigateRoute(...)`. On any failure outcome, the screen must surface a non-success `connectionOutcome` and not navigate.

- [ ] **Step 15.1: Replace the import**

Modify `apps/app/app/connect.tsx`. Replace:

```ts
import { enrollWalletForMonitoring } from '../src/api/wallets';
```

with:

```ts
import { verifyWalletEnrollment, type EnrollmentOutcome } from '../src/wallet-verify/verifyWalletEnrollment';
import { useConnectorKitAdapter } from '../src/platform/browserWallet/connectorKitAdapter';
```

- [ ] **Step 15.2: Wire the browser signer at the top of the component**

Inside `ConnectRoute` (after `const browserConnect = useBrowserWalletConnect();`), add:

```ts
  const browserAdapter = useConnectorKitAdapter();
```

- [ ] **Step 15.3: Add a shared post-connect handler**

Inside `ConnectRoute`, before the `actions` `useMemo`, add:

```ts
  function mapEnrollmentToOutcomeReason(outcome: EnrollmentOutcome): string {
    switch (outcome.kind) {
      case 'challenge-failed':
        return `Could not start wallet verification (${outcome.code})`;
      case 'signing-unsupported':
        return 'This wallet does not support signing the verification message';
      case 'wallet-mismatch':
        return 'Signed by a different wallet than the one connected';
      case 'user-rejected':
        return 'Verification signature was declined';
      case 'signing-failed':
        return 'Failed to sign the verification message';
      case 'enroll-failed':
        return `Could not enroll wallet (${outcome.code})`;
      case 'enrolled':
        return '';
    }
  }

  async function completeConnect(address: string, kind: 'native' | 'browser') {
    markConnected({ walletAddress: address, connectionKind: kind });
    const outcome = await verifyWalletEnrollment({
      walletId: address,
      connectionKind: kind,
      browserSigner:
        kind === 'browser'
          ? {
              isConnected: browserAdapter.isConnected,
              account: browserAdapter.account,
              signMessageBytes: browserAdapter.signMessageBytes,
            }
          : null,
    });
    if (outcome.kind !== 'enrolled') {
      markOutcome({ kind: 'failed', reason: mapEnrollmentToOutcomeReason(outcome) });
      return;
    }
    navigateRoute({ router, path: returnTo, method: 'replace' });
  }
```

- [ ] **Step 15.4: Replace the three connection branches**

In the `actions` `useMemo`, replace each of these three blocks:

```ts
.then((address) => {
  markConnected({ walletAddress: address, connectionKind: 'native' });
  void enrollWalletForMonitoring(address).catch(() => {});
  navigateRoute({ router, path: returnTo, method: 'replace' });
})
```

…with the typed completer (use the matching `kind` for each branch — `'native'` for the MWA branch, `'browser'` for both the discovered-wallet and default-browser branches):

```ts
.then(({ address }) => completeConnect(address, 'browser'))
```

…and for the native branch (which resolves to a string, not `{ address }`):

```ts
.then((address) => completeConnect(address, 'native'))
```

Update the `useMemo` dependency array to include `browserAdapter` (so the closure captures the latest values).

> Important: do NOT keep `void enrollWalletForMonitoring(...)` calls anywhere. The new flow is `markConnected → verifyWalletEnrollment → navigateRoute on success only`. Any failure must end at `markOutcome({ kind: 'failed', ... })` and never reach `/monitor`.

- [ ] **Step 15.5: Typecheck the app**

Run: `pnpm --filter @clmm/app typecheck`
Expected: PASS.

- [ ] **Step 15.6: Run app tests**

Run: `pnpm --filter @clmm/app test`
Expected: PASS. The new orchestrator tests, the rewritten api/wallets tests, and existing tests all pass.

- [ ] **Step 15.7: Manually verify in dev (web)**

Run the dev server (`pnpm dev:api` in one terminal, `pnpm --filter @clmm/app exec expo start --web` in another) and walk through:

1. Open `/connect` in a browser with a Phantom-style wallet extension installed.
2. Click "Connect" → expect the wallet popup, approve the connection.
3. Expect a second wallet popup asking to sign a message starting with "CLMM wallet verification". Approve.
4. Confirm the app navigates to the ready route (positions list).
5. Repeat. Reject the signing prompt this time. Confirm the app does NOT navigate and surfaces a "verification declined" outcome on the connect screen.
6. Inspect network: `/wallets/:walletId/challenge` then `/wallets/:walletId/enroll` should appear, no `/wallets/:walletId/monitor` request.

If the UI cannot be tested locally, say so explicitly — type/test passes are not the same as a working flow.

- [ ] **Step 15.8: Commit**

```bash
git add apps/app/app/connect.tsx
git commit -m "feat(app): gate ready navigation on verified wallet enrollment"
```

---

## Task 16: Full repo verification gate

- [ ] **Step 16.1: Build**

Run: `pnpm build`
Expected: PASS across all packages.

- [ ] **Step 16.2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 16.3: Lint**

Run: `pnpm lint`
Expected: PASS. Do NOT add `eslint-disable` lines to mask new issues — fix them or refactor.

- [ ] **Step 16.4: Boundaries**

Run: `pnpm boundaries`
Expected: PASS. Specifically confirms:
- `packages/application` did not gain any adapter import.
- `packages/domain` is untouched.
- `packages/ui` is untouched.
- `apps/app` only imports `@clmm/adapters` from the approved composition entrypoint.

- [ ] **Step 16.5: Full test suite**

Run: `pnpm test`
Expected: PASS across all packages. New tests added in Tasks 4–14 are included; no prior test regressions.

- [ ] **Step 16.6: Manual smoke (preview deploy)**

After the code is pushed to a preview branch and Cloudflare has deployed:

1. Apply the migration against the preview DB:
   ```bash
   DATABASE_URL=<preview-db-url> pnpm --filter @clmm/adapters db:migrate
   ```
2. From a Node REPL:
   ```js
   // Generate a throwaway keypair, get the wallet address, request a challenge,
   // sign the returned message, and POST to /enroll. Pseudocode:
   //   1. globalThis.crypto.subtle.generateKey({name:'Ed25519'}, true, ['sign','verify'])
   //   2. base58-encode the raw public key → walletId
   //   3. fetch POST /wallets/:walletId/challenge → { nonce, expiresAt, message }
   //   4. globalThis.crypto.subtle.sign({name:'Ed25519'}, kp.privateKey, encoder.encode(message))
   //   5. base64-encode the signature
   //   6. fetch POST /wallets/:walletId/enroll with { nonce, message, signature }
   //      → expect 200 { enrolled: true, enrolledAt }
   ```
3. Repeat the `enroll` call with the same body → expect `400 CHALLENGE_NOT_FOUND` (replay rejected).
4. Call `POST /wallets/:walletId/monitor` → expect `410 ENROLLMENT_UPGRADE_REQUIRED`.
5. Query `SELECT * FROM monitored_wallets WHERE wallet_id = '<walletId>'` → exactly one active row.
6. Query `SELECT * FROM wallet_challenges WHERE wallet_id = '<walletId>'` → zero rows (consumed).
7. Issue two `/challenge` calls within 5 minutes → identical `nonce` and `expiresAt`.
8. Wait until past `expiresAt`, call `/challenge` again → fresh `nonce` and `expiresAt`.

If any step fails, stop and investigate — do not proceed to release.

- [ ] **Step 16.7: No commit — this is verification**

This step records that the gate ran. If anything failed, file a follow-up issue and return to the relevant task.

---

## Rollout

Ship backend and app changes in the same release.

1. **Apply the migration first** against production: `DATABASE_URL=<prod-url> pnpm --filter @clmm/adapters db:migrate`. Creates the `wallet_challenges` table.
2. **Deploy the backend** (Cloudflare Worker / API). It now serves `/challenge` and `/enroll`, and returns `410 ENROLLMENT_UPGRADE_REQUIRED` from `/monitor`.
3. **Deploy the app** in the same release window. New clients use the challenge → sign → enroll flow.
4. **Stale app clients** that still call `/monitor` receive `410 ENROLLMENT_UPGRADE_REQUIRED` and cannot perform unsigned public enrollment. They will need an app update.

Rollback: revert both deploys together. The new `wallet_challenges` table is safe to leave in place — no FKs, no readers outside the new controller. Drop in a follow-up if desired.
