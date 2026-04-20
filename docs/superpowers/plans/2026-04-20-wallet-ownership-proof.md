# Wallet Ownership Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require an Ed25519 signature proving wallet ownership before enrolling a wallet into scanning. Replace `POST /wallets/:walletId/monitor` with `POST /:walletId/challenge` + `POST /:walletId/enroll`.

**Architecture:** New Postgres-backed `WalletChallengeRepository` port with `(wallet_id PK, nonce, expires_at)` rows, upsert on issue, atomic delete-returning on consume. Controller issues challenges, consumes on enroll, verifies signatures via WebCrypto Ed25519 against the submitted base58 wallet address. No new external infra. No `@solana/web3.js`.

**Tech Stack:** TypeScript, NestJS, drizzle-orm/postgres-js (Postgres), WebCrypto (`globalThis.crypto.subtle`), vitest, pnpm workspaces.

**Design spec:** `docs/superpowers/specs/2026-04-20-wallet-ownership-proof-design.md`

---

## Preflight

- [ ] **Step P1: Ensure dependencies installed and workspace built**

Run:
```bash
pnpm install --frozen-lockfile
pnpm build
```
Expected: Both succeed. If either fails, stop and report — plan assumes a working workspace.

- [ ] **Step P2: Confirm no uncommitted changes**

Run: `git status --short`
Expected: Empty output.
If not empty, stop and ask the user — do not proceed on a dirty tree.

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
});
```

- [ ] **Step 1.2: Export from schema barrel**

Modify `packages/adapters/src/outbound/storage/schema/index.ts` — append the export:

```ts
export * from './wallet-challenges.js';
```

(Keep all existing exports above it.)

- [ ] **Step 1.3: Register schema in `db.ts`**

Modify `packages/adapters/src/outbound/storage/db.ts`. Add the import and include it in the schema spread.

Add after the `notificationEventsSchema` import:
```ts
import * as walletChallengesSchema from './schema/wallet-challenges.js';
```

Add inside the `drizzle(client, { schema: { ... } })` spread, after `notificationEventsSchema`:
```ts
    ...walletChallengesSchema,
```

- [ ] **Step 1.4: Generate the migration**

Run:
```bash
cd packages/adapters && pnpm db:generate && cd -
```
Expected: a new file `packages/adapters/drizzle/0001_*.sql` is created containing `CREATE TABLE "wallet_challenges" (...)` with `"wallet_id" text PRIMARY KEY NOT NULL`, `"nonce" text NOT NULL`, `"expires_at" bigint NOT NULL`. Also updates `drizzle/meta/_journal.json` and creates `drizzle/meta/0001_snapshot.json`.

If `db:generate` complains about missing `DATABASE_URL`, export a placeholder before running:
```bash
DATABASE_URL=postgresql://placeholder cd packages/adapters && pnpm db:generate && cd -
```

- [ ] **Step 1.5: Verify the generated SQL**

Run: `ls packages/adapters/drizzle/ && cat packages/adapters/drizzle/0001_*.sql`
Expected: `0001_*.sql` exists and contains:
```sql
CREATE TABLE "wallet_challenges" (
	"wallet_id" text PRIMARY KEY NOT NULL,
	"nonce" text NOT NULL,
	"expires_at" bigint NOT NULL
);
```
(exact column order and formatting may vary slightly with drizzle-kit version; the table and three columns with correct types + PK on `wallet_id` is what matters)

- [ ] **Step 1.6: Run typecheck to confirm schema compiles**

Run: `pnpm --filter @clmm/adapters typecheck`
Expected: PASS (no errors).

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

## Task 2: Define `WalletChallengeRepository` port + DI token

**Files:**
- Modify: `packages/application/src/ports/index.ts`
- Modify: `packages/adapters/src/inbound/http/tokens.ts`

- [ ] **Step 2.1: Add the port interface**

Modify `packages/application/src/ports/index.ts`. Append at the end of the file, after the `IdGeneratorPort` block:

```ts
// --- Wallet challenge port (ownership proof storage) ---

export type ConsumeChallengeResult =
  | { kind: 'consumed'; expiresAt: ClockTimestamp }
  | { kind: 'not_found' }
  | { kind: 'mismatch' }
  | { kind: 'expired' };

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
  }): Promise<ConsumeChallengeResult>;
}
```

- [ ] **Step 2.2: Add the DI token**

Modify `packages/adapters/src/inbound/http/tokens.ts`. Append:

```ts
export const WALLET_CHALLENGE_REPOSITORY = Symbol('WALLET_CHALLENGE_REPOSITORY');
```

- [ ] **Step 2.3: Typecheck**

Run: `pnpm --filter @clmm/application typecheck && pnpm --filter @clmm/adapters typecheck`
Expected: Both PASS.

- [ ] **Step 2.4: Boundaries check**

Run: `pnpm boundaries`
Expected: PASS. Confirms no adapter imports leaked into application from the new port.

- [ ] **Step 2.5: Commit**

```bash
git add packages/application/src/ports/index.ts packages/adapters/src/inbound/http/tokens.ts
git commit -m "feat(application): add WalletChallengeRepository port"
```

---

## Task 3: Add `FakeWalletChallengeRepository` to testing package

**Files:**
- Create: `packages/testing/src/fakes/FakeWalletChallengeRepository.ts`
- Modify: `packages/testing/src/fakes/index.ts`

- [ ] **Step 3.1: Create the fake**

Create `packages/testing/src/fakes/FakeWalletChallengeRepository.ts`:

```ts
import type {
  WalletChallengeRepository,
  ConsumeChallengeResult,
} from '@clmm/application';
import type { WalletId, ClockTimestamp } from '@clmm/domain';

type ChallengeRow = {
  walletId: WalletId;
  nonce: string;
  expiresAt: ClockTimestamp;
};

export class FakeWalletChallengeRepository implements WalletChallengeRepository {
  private rows = new Map<string, ChallengeRow>();

  async issue(params: {
    walletId: WalletId;
    nonce: string;
    expiresAt: ClockTimestamp;
  }): Promise<void> {
    this.rows.set(params.walletId, { ...params });
  }

  async consume(params: {
    walletId: WalletId;
    nonce: string;
    now: ClockTimestamp;
  }): Promise<ConsumeChallengeResult> {
    const row = this.rows.get(params.walletId);
    if (row === undefined) return { kind: 'not_found' };

    // Atomic delete-returning: row is removed whether nonce matches or not.
    this.rows.delete(params.walletId);

    if (row.nonce !== params.nonce) return { kind: 'mismatch' };
    if (row.expiresAt < params.now) return { kind: 'expired' };
    return { kind: 'consumed', expiresAt: row.expiresAt };
  }

  // Test-only introspection.
  getRowForTest(walletId: WalletId): ChallengeRow | undefined {
    return this.rows.get(walletId);
  }
}
```

- [ ] **Step 3.2: Export from fakes barrel**

Modify `packages/testing/src/fakes/index.ts`. Append after the `FakeNotificationPort` line:

```ts
export { FakeWalletChallengeRepository } from './FakeWalletChallengeRepository.js';
```

- [ ] **Step 3.3: Typecheck**

Run: `pnpm --filter @clmm/testing typecheck`
Expected: PASS.

- [ ] **Step 3.4: Commit**

```bash
git add packages/testing/src/fakes/FakeWalletChallengeRepository.ts packages/testing/src/fakes/index.ts
git commit -m "test(testing): add FakeWalletChallengeRepository"
```

---

## Task 4: Implement `base58ToBuffer(str, expectedLength)` (TDD)

**Files:**
- Create: `packages/adapters/src/inbound/http/WalletVerification.ts`
- Create: `packages/adapters/src/inbound/http/WalletVerification.test.ts`

- [ ] **Step 4.1: Write the failing tests**

Create `packages/adapters/src/inbound/http/WalletVerification.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { base58ToBuffer } from './WalletVerification.js';

const VALID_32_BYTE_ADDR = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';
// A valid base58 encoding of a 64-byte payload (crafted: 64 zero bytes = 64× '1').
const VALID_64_BYTE_ZEROS = '1'.repeat(64);

describe('base58ToBuffer', () => {
  it('decodes a valid 32-byte Solana address', () => {
    const out = base58ToBuffer(VALID_32_BYTE_ADDR, 32);
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.length).toBe(32);
  });

  it('decodes a 64-byte zero-padded payload when expectedLength is 64', () => {
    const out = base58ToBuffer(VALID_64_BYTE_ZEROS, 64);
    expect(out.length).toBe(64);
    expect(Array.from(out).every((b) => b === 0)).toBe(true);
  });

  it('rejects a 32-byte address when expectedLength is 64', () => {
    expect(() => base58ToBuffer(VALID_32_BYTE_ADDR, 64)).toThrow(/expected 64/);
  });

  it('rejects a 64-byte payload when expectedLength is 32', () => {
    expect(() => base58ToBuffer(VALID_64_BYTE_ZEROS, 32)).toThrow(/expected 32/);
  });

  it('rejects invalid base58 characters', () => {
    expect(() => base58ToBuffer('0OIl' + VALID_32_BYTE_ADDR.slice(4), 32)).toThrow(/Invalid base58/);
  });
});
```

- [ ] **Step 4.2: Run tests to verify they fail (module not found)**

Run: `pnpm --filter @clmm/adapters test -- WalletVerification`
Expected: FAIL — `base58ToBuffer` cannot be imported (module doesn't exist yet).

- [ ] **Step 4.3: Implement `base58ToBuffer`**

Create `packages/adapters/src/inbound/http/WalletVerification.ts`:

```ts
/**
 * Transport-layer wallet ownership proof helpers.
 * Lives in the HTTP adapter because it does WebCrypto Ed25519 verification
 * and base58 decoding — both external concerns. Not a domain concept.
 */

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_MAP: Record<string, number> = {};
for (let i = 0; i < BASE58_ALPHABET.length; i++) {
  BASE58_MAP[BASE58_ALPHABET.charAt(i)] = i;
}

/**
 * Decode a base58-encoded string to exactly `expectedLength` bytes.
 * Throws on invalid characters or a length mismatch.
 * `expectedLength` is required — callers must declare the payload size
 * they expect (32 for Solana addresses, 64 for Ed25519 signatures).
 */
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
  // Leading zero bytes are already 0 from `new Uint8Array`.
  out.set(bodyBytes, leadingZeros);
  return out;
}
```

- [ ] **Step 4.4: Run tests to verify they pass**

Run: `pnpm --filter @clmm/adapters test -- WalletVerification`
Expected: PASS (all 5 cases).

- [ ] **Step 4.5: Commit**

```bash
git add packages/adapters/src/inbound/http/WalletVerification.ts packages/adapters/src/inbound/http/WalletVerification.test.ts
git commit -m "feat(adapters): add base58ToBuffer with length validation"
```

---

## Task 5: Implement `buildWalletVerificationMessage` (TDD)

**Files:**
- Modify: `packages/adapters/src/inbound/http/WalletVerification.ts`
- Modify: `packages/adapters/src/inbound/http/WalletVerification.test.ts`

- [ ] **Step 5.1: Add failing test**

Append to `packages/adapters/src/inbound/http/WalletVerification.test.ts` (before the closing brace of the file, add a new `describe` block):

```ts
import { buildWalletVerificationMessage } from './WalletVerification.js';

describe('buildWalletVerificationMessage', () => {
  it('emits the exact domain-bound multi-line format', () => {
    const message = buildWalletVerificationMessage({
      walletAddress: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
      nonce: 'abc123',
      expiresAt: 1_713_628_800_000,
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

(Consolidate the two imports at the top — replace the existing first line with `import { base58ToBuffer, buildWalletVerificationMessage } from './WalletVerification.js';` and remove the duplicate import.)

- [ ] **Step 5.2: Run test to verify it fails**

Run: `pnpm --filter @clmm/adapters test -- WalletVerification`
Expected: FAIL on `buildWalletVerificationMessage` — not exported yet.

- [ ] **Step 5.3: Implement**

Append to `packages/adapters/src/inbound/http/WalletVerification.ts`:

```ts
/**
 * Build the exact message the wallet must sign for ownership proof.
 * This is the single source of truth for the signed-message format —
 * both the challenge endpoint (which returns this string in the response)
 * and the enroll endpoint (which rebuilds and verifies) call this function.
 */
export function buildWalletVerificationMessage(params: {
  walletAddress: string;
  nonce: string;
  expiresAt: number;
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

- [ ] **Step 5.4: Run tests to verify they pass**

Run: `pnpm --filter @clmm/adapters test -- WalletVerification`
Expected: PASS (all 6 cases).

- [ ] **Step 5.5: Commit**

```bash
git add packages/adapters/src/inbound/http/WalletVerification.ts packages/adapters/src/inbound/http/WalletVerification.test.ts
git commit -m "feat(adapters): add buildWalletVerificationMessage (domain-bound format)"
```

---

## Task 6: Implement `verifyWalletSignature` via WebCrypto (TDD)

**Files:**
- Modify: `packages/adapters/src/inbound/http/WalletVerification.ts`
- Modify: `packages/adapters/src/inbound/http/WalletVerification.test.ts`

- [ ] **Step 6.1: Add failing tests**

Append to `packages/adapters/src/inbound/http/WalletVerification.test.ts` — add a new `describe` block at the end of the file:

```ts
import { verifyWalletSignature } from './WalletVerification.js';

// Base58 encode — small helper used only by these tests to produce real keys/signatures.
function base58Encode(bytes: Uint8Array): string {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let leadingZeros = 0;
  for (const b of bytes) {
    if (b === 0) leadingZeros++;
    else break;
  }
  let n = 0n;
  for (const b of bytes) {
    n = n * 256n + BigInt(b);
  }
  let out = '';
  while (n > 0n) {
    const mod = Number(n % 58n);
    out = ALPHABET[mod] + out;
    n = n / 58n;
  }
  return '1'.repeat(leadingZeros) + out;
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

async function signMessage(privateKey: CryptoKey, message: string): Promise<Uint8Array> {
  const sig = await globalThis.crypto.subtle.sign(
    { name: 'Ed25519' },
    privateKey,
    new TextEncoder().encode(message),
  );
  return new Uint8Array(sig);
}

describe('verifyWalletSignature', () => {
  it('returns true for a valid signature over the message', async () => {
    const { keyPair, rawPubkey } = await makeEd25519KeyPair();
    const walletAddress = base58Encode(rawPubkey);
    const message = 'hello wallet';
    const signature = await signMessage(keyPair.privateKey, message);

    const result = await verifyWalletSignature({ message, signature, walletAddress });
    expect(result).toBe(true);
  });

  it('returns false for a tampered message', async () => {
    const { keyPair, rawPubkey } = await makeEd25519KeyPair();
    const walletAddress = base58Encode(rawPubkey);
    const signature = await signMessage(keyPair.privateKey, 'original');

    const result = await verifyWalletSignature({
      message: 'tampered',
      signature,
      walletAddress,
    });
    expect(result).toBe(false);
  });

  it('returns false for a signature from a different key', async () => {
    const { keyPair: alice } = await makeEd25519KeyPair();
    const { rawPubkey: bobPub } = await makeEd25519KeyPair();
    const walletAddress = base58Encode(bobPub);

    const message = 'hello';
    const signature = await signMessage(alice.privateKey, message);

    const result = await verifyWalletSignature({ message, signature, walletAddress });
    expect(result).toBe(false);
  });

  it('returns false for a malformed wallet address', async () => {
    const { keyPair } = await makeEd25519KeyPair();
    const signature = await signMessage(keyPair.privateKey, 'msg');

    const result = await verifyWalletSignature({
      message: 'msg',
      signature,
      walletAddress: '0OIl-not-base58',
    });
    expect(result).toBe(false);
  });

  it('returns false for a signature of wrong length', async () => {
    const { rawPubkey } = await makeEd25519KeyPair();
    const walletAddress = base58Encode(rawPubkey);

    const result = await verifyWalletSignature({
      message: 'x',
      signature: new Uint8Array(32), // not 64 bytes
      walletAddress,
    });
    expect(result).toBe(false);
  });
});
```

Consolidate imports at the top of the file to a single line:
```ts
import { base58ToBuffer, buildWalletVerificationMessage, verifyWalletSignature } from './WalletVerification.js';
```

- [ ] **Step 6.2: Run tests to verify they fail**

Run: `pnpm --filter @clmm/adapters test -- WalletVerification`
Expected: FAIL — `verifyWalletSignature` not exported.

- [ ] **Step 6.3: Implement `verifyWalletSignature`**

Append to `packages/adapters/src/inbound/http/WalletVerification.ts`:

```ts
/**
 * Verify an Ed25519 signature against a message and a base58 Solana wallet address.
 * Returns false on any error (malformed address, wrong signature length, bad signature).
 *
 * Uses WebCrypto via `globalThis.crypto.subtle` — works in Node 18+ and Cloudflare
 * Workers. Ed25519 public keys are imported via JWK OKP format (raw 32 bytes →
 * base64url-encoded `x`), which is the only import path that accepts raw Solana
 * pubkeys without DER encoding.
 */
export async function verifyWalletSignature(params: {
  message: string;
  signature: Uint8Array;
  walletAddress: string;
}): Promise<boolean> {
  try {
    const { message, signature, walletAddress } = params;
    if (signature.length !== 64) return false;

    const messageBytes = new TextEncoder().encode(message);
    const publicKey = base58ToBuffer(walletAddress, 32);

    const subtle = globalThis.crypto.subtle;
    const jwk = {
      kty: 'OKP',
      crv: 'Ed25519',
      x: uint8ArrayToBase64Url(publicKey),
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

function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
```

- [ ] **Step 6.4: Run tests to verify they pass**

Run: `pnpm --filter @clmm/adapters test -- WalletVerification`
Expected: PASS — all 11 cases (5 base58 + 1 message + 5 signature).

- [ ] **Step 6.5: Commit**

```bash
git add packages/adapters/src/inbound/http/WalletVerification.ts packages/adapters/src/inbound/http/WalletVerification.test.ts
git commit -m "feat(adapters): add WebCrypto Ed25519 signature verification"
```

---

## Task 7: Implement `WalletChallengePostgresAdapter`

**Files:**
- Create: `packages/adapters/src/outbound/storage/WalletChallengePostgresAdapter.ts`
- Create: `packages/adapters/src/outbound/storage/WalletChallengePostgresAdapter.test.ts`

Note on test strategy: existing Postgres adapters in this repo (`MonitoredWalletStorageAdapter.test.ts`) use thin "unit shape" tests that assert method presence. Real behavioral coverage comes from `FakeWalletChallengeRepository` (already written in Task 3) exercised via controller tests. We match that convention: one unit shape test here; behavior is tested through the fake + controller in Tasks 8–9.

- [ ] **Step 7.1: Write the shape test**

Create `packages/adapters/src/outbound/storage/WalletChallengePostgresAdapter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { WalletChallengePostgresAdapter } from './WalletChallengePostgresAdapter.js';

describe('WalletChallengePostgresAdapter (unit shape)', () => {
  it('implements issue and consume methods', () => {
    const methods = ['issue', 'consume'] as const;
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

- [ ] **Step 7.2: Run test to verify it fails**

Run: `pnpm --filter @clmm/adapters test -- WalletChallengePostgresAdapter`
Expected: FAIL — module not found.

- [ ] **Step 7.3: Implement the adapter**

Create `packages/adapters/src/outbound/storage/WalletChallengePostgresAdapter.ts`:

```ts
import { eq } from 'drizzle-orm';
import type { Db } from './db.js';
import { walletChallenges } from './schema/index.js';
import type {
  WalletChallengeRepository,
  ConsumeChallengeResult,
} from '@clmm/application';
import type { WalletId, ClockTimestamp } from '@clmm/domain';

export class WalletChallengePostgresAdapter implements WalletChallengeRepository {
  constructor(private readonly db: Db) {}

  async issue(params: {
    walletId: WalletId;
    nonce: string;
    expiresAt: ClockTimestamp;
  }): Promise<void> {
    await this.db
      .insert(walletChallenges)
      .values({
        walletId: params.walletId,
        nonce: params.nonce,
        expiresAt: params.expiresAt,
      })
      .onConflictDoUpdate({
        target: walletChallenges.walletId,
        set: {
          nonce: params.nonce,
          expiresAt: params.expiresAt,
        },
      });
  }

  async consume(params: {
    walletId: WalletId;
    nonce: string;
    now: ClockTimestamp;
  }): Promise<ConsumeChallengeResult> {
    // Atomic delete-returning. On nonce mismatch the row is intentionally
    // discarded — simpler than a transactional re-insert and client recovery
    // (request a new challenge) is identical either way.
    const rows = await this.db
      .delete(walletChallenges)
      .where(eq(walletChallenges.walletId, params.walletId))
      .returning();

    if (rows.length === 0) return { kind: 'not_found' };
    const row = rows[0];
    if (row.nonce !== params.nonce) return { kind: 'mismatch' };
    if (row.expiresAt < params.now) return { kind: 'expired' };
    return { kind: 'consumed', expiresAt: row.expiresAt as ClockTimestamp };
  }
}
```

- [ ] **Step 7.4: Run test to verify it passes**

Run: `pnpm --filter @clmm/adapters test -- WalletChallengePostgresAdapter`
Expected: PASS.

- [ ] **Step 7.5: Typecheck**

Run: `pnpm --filter @clmm/adapters typecheck`
Expected: PASS.

- [ ] **Step 7.6: Commit**

```bash
git add packages/adapters/src/outbound/storage/WalletChallengePostgresAdapter.ts packages/adapters/src/outbound/storage/WalletChallengePostgresAdapter.test.ts
git commit -m "feat(adapters): add WalletChallengePostgresAdapter"
```

---

## Task 8: Rewrite `WalletController` — `issueChallenge` endpoint (TDD)

**Files:**
- Modify: `packages/adapters/src/inbound/http/WalletController.ts` (full rewrite)
- Create: `packages/adapters/src/inbound/http/WalletController.test.ts`

- [ ] **Step 8.1: Write the failing tests for `issueChallenge`**

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

const VALID_WALLET_ID = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';

function makeController(opts?: { now?: number }) {
  const challenges = new FakeWalletChallengeRepository();
  const monitoredWallets = new FakeMonitoredWalletRepository();
  const clock = new FakeClockPort(opts?.now ?? 1_000_000);
  const controller = new WalletController(challenges, monitoredWallets, clock);
  return { controller, challenges, monitoredWallets, clock };
}

describe('WalletController.issueChallenge', () => {
  it('issues a nonce + expiresAt + message and persists the challenge', async () => {
    const { controller, challenges } = makeController({ now: 1_000_000 });

    const result = await controller.issueChallenge(VALID_WALLET_ID);

    expect(result.nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(result.expiresAt).toBe(1_000_000 + 5 * 60 * 1000);
    expect(result.message).toBe(
      buildWalletVerificationMessage({
        walletAddress: VALID_WALLET_ID,
        nonce: result.nonce,
        expiresAt: result.expiresAt,
      }),
    );

    const stored = challenges.getRowForTest(VALID_WALLET_ID as never);
    expect(stored).toBeDefined();
    expect(stored?.nonce).toBe(result.nonce);
    expect(stored?.expiresAt).toBe(result.expiresAt);
  });

  it('rejects a malformed walletId with 400 WALLET_MALFORMED', async () => {
    const { controller, challenges } = makeController();

    await expect(controller.issueChallenge('not-a-real-address')).rejects.toMatchObject({
      status: 400,
      response: { error: 'WALLET_MALFORMED' },
    });
    expect(challenges.getRowForTest('not-a-real-address' as never)).toBeUndefined();
  });

  it('overwrites a prior challenge for the same wallet (upsert semantics)', async () => {
    const { controller, challenges, clock } = makeController({ now: 1_000_000 });

    const first = await controller.issueChallenge(VALID_WALLET_ID);
    clock.advance(1000);
    const second = await controller.issueChallenge(VALID_WALLET_ID);

    expect(second.nonce).not.toBe(first.nonce);
    const stored = challenges.getRowForTest(VALID_WALLET_ID as never);
    expect(stored?.nonce).toBe(second.nonce);
    expect(stored?.expiresAt).toBe(second.expiresAt);
  });
});
```

> **Note:** `FakeClockPort` exposes `advance(ms)` and `set(ms)` (confirmed at `packages/testing/src/fakes/FakeClockPort.ts`). Use `advance(1000)` as written above.

- [ ] **Step 8.2: Run tests to verify they fail**

Run: `pnpm --filter @clmm/adapters test -- WalletController`
Expected: FAIL — current `WalletController` has no `issueChallenge` method and the constructor signature doesn't match.

- [ ] **Step 8.3: Rewrite `WalletController.ts` with `issueChallenge` only (enroll comes next task)**

Replace the full contents of `packages/adapters/src/inbound/http/WalletController.ts`:

```ts
import {
  Controller,
  Post,
  Param,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import type {
  WalletChallengeRepository,
  MonitoredWalletRepository,
  ClockPort,
} from '@clmm/application';
import type { WalletId, ClockTimestamp } from '@clmm/domain';
import {
  WALLET_CHALLENGE_REPOSITORY,
  MONITORED_WALLET_REPOSITORY,
  CLOCK_PORT,
} from './tokens.js';
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
    @Inject(MONITORED_WALLET_REPOSITORY)
    private readonly monitoredWallets: MonitoredWalletRepository,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
  ) {}

  @Post(':walletId/challenge')
  async issueChallenge(@Param('walletId') walletId: string) {
    assertValidWalletId(walletId);
    const now = this.clock.now();
    const expiresAt = (now + CHALLENGE_TTL_MS) as ClockTimestamp;
    const nonce = generateNonceHex();
    await this.challenges.issue({
      walletId: walletId as WalletId,
      nonce,
      expiresAt,
    });
    const message = buildWalletVerificationMessage({
      walletAddress: walletId,
      nonce,
      expiresAt,
    });
    return { nonce, expiresAt, message };
  }
}

// ─── helpers ───────────────────────────────────────────────────────────────

function assertValidWalletId(walletId: string): void {
  try {
    base58ToBuffer(walletId, 32);
  } catch {
    throw new BadRequestException({ error: 'WALLET_MALFORMED' });
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

- [ ] **Step 8.4: Run tests to verify they pass**

Run: `pnpm --filter @clmm/adapters test -- WalletController`
Expected: PASS — all 3 `issueChallenge` cases. (`NestJS BadRequestException` has a `status` of 400 and a `response` of the payload object.)

If the `advance`/`setNow` helper name differs, read `FakeClockPort.ts` first and match the actual method name — do not invent one.

- [ ] **Step 8.5: Typecheck**

Run: `pnpm --filter @clmm/adapters typecheck`
Expected: PASS.

- [ ] **Step 8.6: Commit**

```bash
git add packages/adapters/src/inbound/http/WalletController.ts packages/adapters/src/inbound/http/WalletController.test.ts
git commit -m "feat(adapters): add POST /:walletId/challenge endpoint"
```

---

## Task 9: Add `enroll` endpoint to `WalletController` (TDD)

**Files:**
- Modify: `packages/adapters/src/inbound/http/WalletController.ts`
- Modify: `packages/adapters/src/inbound/http/WalletController.test.ts`

- [ ] **Step 9.1: Add failing tests for `enroll`**

Append to `packages/adapters/src/inbound/http/WalletController.test.ts`:

```ts
// Helpers for building a real signed challenge end-to-end in tests.

function base58Encode(bytes: Uint8Array): string {
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

async function makeSignedChallenge(now: number) {
  const keyPair = await globalThis.crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify'],
  );
  const rawPubkey = new Uint8Array(
    await globalThis.crypto.subtle.exportKey('raw', keyPair.publicKey),
  );
  const walletId = base58Encode(rawPubkey);

  const { controller, challenges, monitoredWallets, clock } = makeController({ now });
  const challenge = await controller.issueChallenge(walletId);

  const signatureBytes = new Uint8Array(
    await globalThis.crypto.subtle.sign(
      { name: 'Ed25519' },
      keyPair.privateKey,
      new TextEncoder().encode(challenge.message),
    ),
  );
  const signatureBase58 = base58Encode(signatureBytes);

  return {
    controller,
    challenges,
    monitoredWallets,
    clock,
    walletId,
    nonce: challenge.nonce,
    signatureBase58,
    keyPair,
  };
}

describe('WalletController.enroll', () => {
  it('enrolls the wallet when the signature verifies', async () => {
    const ctx = await makeSignedChallenge(1_000_000);

    const result = await ctx.controller.enroll(ctx.walletId, {
      nonce: ctx.nonce,
      signature: ctx.signatureBase58,
    });

    expect(result.enrolled).toBe(true);
    expect(typeof result.enrolledAt).toBe('number');

    const active = await ctx.monitoredWallets.listActiveWallets();
    expect(active).toHaveLength(1);
    expect(active[0]?.walletId).toBe(ctx.walletId);
  });

  it('returns 400 CHALLENGE_NOT_FOUND when no challenge was issued', async () => {
    const { controller, monitoredWallets } = makeController();
    await expect(
      controller.enroll(VALID_WALLET_ID, {
        nonce: 'a'.repeat(64),
        signature: '1'.repeat(64),
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: { error: 'CHALLENGE_NOT_FOUND' },
    });
    expect(await monitoredWallets.listActiveWallets()).toHaveLength(0);
  });

  it('returns 409 CHALLENGE_MISMATCH when nonce does not match stored', async () => {
    const ctx = await makeSignedChallenge(1_000_000);
    await expect(
      ctx.controller.enroll(ctx.walletId, {
        nonce: 'b'.repeat(64),
        signature: ctx.signatureBase58,
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: 'CHALLENGE_MISMATCH' },
    });
    expect(await ctx.monitoredWallets.listActiveWallets()).toHaveLength(0);
  });

  it('returns 410 CHALLENGE_EXPIRED when stored challenge is expired', async () => {
    const ctx = await makeSignedChallenge(1_000_000);
    ctx.clock.advance(5 * 60 * 1000 + 1); // past TTL

    await expect(
      ctx.controller.enroll(ctx.walletId, {
        nonce: ctx.nonce,
        signature: ctx.signatureBase58,
      }),
    ).rejects.toMatchObject({
      status: 410,
      response: { error: 'CHALLENGE_EXPIRED' },
    });
    expect(await ctx.monitoredWallets.listActiveWallets()).toHaveLength(0);
  });

  it('returns 401 SIGNATURE_INVALID when signature does not verify', async () => {
    const ctx = await makeSignedChallenge(1_000_000);
    // Flip a byte — the resulting signature will be well-formed but invalid.
    const badSig = base58Encode(
      (() => {
        const bytes = new Uint8Array(64);
        bytes[0] = 0x01;
        return bytes;
      })(),
    );
    await expect(
      ctx.controller.enroll(ctx.walletId, {
        nonce: ctx.nonce,
        signature: badSig,
      }),
    ).rejects.toMatchObject({
      status: 401,
      response: { error: 'SIGNATURE_INVALID' },
    });
    expect(await ctx.monitoredWallets.listActiveWallets()).toHaveLength(0);
  });

  it('returns 401 SIGNATURE_INVALID when signature fails to base58-decode to 64 bytes', async () => {
    const ctx = await makeSignedChallenge(1_000_000);
    await expect(
      ctx.controller.enroll(ctx.walletId, {
        nonce: ctx.nonce,
        signature: 'too-short',
      }),
    ).rejects.toMatchObject({
      status: 401,
      response: { error: 'SIGNATURE_INVALID' },
    });
  });

  it('returns 400 BAD_REQUEST on malformed body (missing nonce)', async () => {
    const { controller } = makeController();
    await expect(
      controller.enroll(VALID_WALLET_ID, { signature: '1'.repeat(64) } as never),
    ).rejects.toMatchObject({
      status: 400,
      response: { error: 'BAD_REQUEST' },
    });
  });

  it('returns 400 BAD_REQUEST on malformed body (non-hex nonce)', async () => {
    const { controller } = makeController();
    await expect(
      controller.enroll(VALID_WALLET_ID, {
        nonce: 'not-hex',
        signature: '1'.repeat(64),
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: { error: 'BAD_REQUEST' },
    });
  });

  it('returns 400 WALLET_MALFORMED when walletId is invalid', async () => {
    const { controller } = makeController();
    await expect(
      controller.enroll('not-a-base58-address', {
        nonce: 'a'.repeat(64),
        signature: '1'.repeat(64),
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: { error: 'WALLET_MALFORMED' },
    });
  });
});
```

- [ ] **Step 9.2: Run tests to verify they fail**

Run: `pnpm --filter @clmm/adapters test -- WalletController`
Expected: FAIL — `enroll` method not yet defined.

- [ ] **Step 9.3: Implement `enroll`**

Modify `packages/adapters/src/inbound/http/WalletController.ts`.

Replace the first `import { ... } from '@nestjs/common';` block (added in Task 8.3) with:

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

Replace the `import { base58ToBuffer, buildWalletVerificationMessage } from './WalletVerification.js';` block with:

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
    @Body() body: { nonce?: unknown; signature?: unknown },
  ) {
    assertValidWalletId(walletId);
    const { nonce, signature } = assertEnrollBody(body);

    const now = this.clock.now();
    const consumeResult = await this.challenges.consume({
      walletId: walletId as WalletId,
      nonce,
      now,
    });
    switch (consumeResult.kind) {
      case 'not_found':
        throw new BadRequestException({ error: 'CHALLENGE_NOT_FOUND' });
      case 'mismatch':
        throw new ConflictException({ error: 'CHALLENGE_MISMATCH' });
      case 'expired':
        throw new HttpException({ error: 'CHALLENGE_EXPIRED' }, 410);
      case 'consumed':
        break;
    }

    const expectedMessage = buildWalletVerificationMessage({
      walletAddress: walletId,
      nonce,
      expiresAt: consumeResult.expiresAt,
    });
    const signatureBytes = tryBase58ToBuffer(signature, 64);
    if (signatureBytes === null) {
      throw new UnauthorizedException({ error: 'SIGNATURE_INVALID' });
    }

    const verified = await verifyWalletSignature({
      message: expectedMessage,
      signature: signatureBytes,
      walletAddress: walletId,
    });
    if (!verified) {
      throw new UnauthorizedException({ error: 'SIGNATURE_INVALID' });
    }

    const enrolledAt = this.clock.now();
    await this.monitoredWallets.enroll(walletId as WalletId, enrolledAt);
    return { enrolled: true, enrolledAt };
  }
```

And append the two new helpers at the bottom of the file, below `generateNonceHex`:

```ts
function assertEnrollBody(body: {
  nonce?: unknown;
  signature?: unknown;
}): { nonce: string; signature: string } {
  const { nonce, signature } = body ?? {};
  if (
    typeof nonce !== 'string' ||
    !/^[0-9a-f]{64}$/.test(nonce) ||
    typeof signature !== 'string' ||
    signature.length === 0
  ) {
    throw new BadRequestException({ error: 'BAD_REQUEST' });
  }
  return { nonce, signature };
}

function tryBase58ToBuffer(str: string, expectedLength: number): Uint8Array | null {
  try {
    return base58ToBuffer(str, expectedLength);
  } catch {
    return null;
  }
}
```

- [ ] **Step 9.4: Run tests to verify they pass**

Run: `pnpm --filter @clmm/adapters test -- WalletController`
Expected: PASS — all 12 cases (3 challenge + 9 enroll).

- [ ] **Step 9.5: Typecheck**

Run: `pnpm --filter @clmm/adapters typecheck`
Expected: PASS.

- [ ] **Step 9.6: Commit**

```bash
git add packages/adapters/src/inbound/http/WalletController.ts packages/adapters/src/inbound/http/WalletController.test.ts
git commit -m "feat(adapters): add POST /:walletId/enroll with signature verification"
```

---

## Task 10: Wire the adapter in `AppModule`

**Files:**
- Modify: `packages/adapters/src/inbound/http/AppModule.ts`

- [ ] **Step 10.1: Register the adapter + token**

Modify `packages/adapters/src/inbound/http/AppModule.ts`.

Add near the top with the other adapter imports (after the `MonitoredWalletStorageAdapter` import):
```ts
import { WalletChallengePostgresAdapter } from '../../outbound/storage/WalletChallengePostgresAdapter.js';
```

Add to the tokens import block (add `WALLET_CHALLENGE_REPOSITORY` alongside `MONITORED_WALLET_REPOSITORY`):
```ts
import {
  // …existing tokens…
  MONITORED_WALLET_REPOSITORY,
  WALLET_CHALLENGE_REPOSITORY,
  // …existing tokens…
} from './tokens.js';
```

Near the other `new *Adapter(db)` lines (after `const monitoredWalletStorage = new MonitoredWalletStorageAdapter(db);`):
```ts
const walletChallengeStorage = new WalletChallengePostgresAdapter(db);
```

And inside the `providers` array (after the `MONITORED_WALLET_REPOSITORY` provider):
```ts
    { provide: WALLET_CHALLENGE_REPOSITORY, useValue: walletChallengeStorage },
```

- [ ] **Step 10.2: Typecheck the whole repo**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 10.3: Boundaries**

Run: `pnpm boundaries`
Expected: PASS.

- [ ] **Step 10.4: Commit**

```bash
git add packages/adapters/src/inbound/http/AppModule.ts
git commit -m "feat(adapters): wire WalletChallengePostgresAdapter in AppModule"
```

---

## Task 11: Full verification gate

- [ ] **Step 11.1: Build**

Run: `pnpm build`
Expected: PASS across all packages.

- [ ] **Step 11.2: Lint**

Run: `pnpm lint`
Expected: PASS. If ESLint complains about `@typescript-eslint/no-unused-vars` or similar on imports in `WalletController.ts`, prune accordingly — do **not** add `eslint-disable` comments to hide real issues.

- [ ] **Step 11.3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 11.4: Boundaries**

Run: `pnpm boundaries`
Expected: PASS. Specifically confirms that:
- `packages/application` does not import from adapters.
- `packages/domain` gained no new imports.
- `packages/ui` and `apps/app` are untouched.

- [ ] **Step 11.5: Full test suite**

Run: `pnpm test`
Expected: PASS across all packages. New tests added in Tasks 4–9 are included. No prior test regressions.

- [ ] **Step 11.6: Manual smoke (preview deploy)**

After the code is pushed to a preview branch and Cloudflare has deployed:

1. Apply the migration against the preview DB: `cd packages/adapters && DATABASE_URL=<preview-db-url> pnpm db:migrate && cd -`.
2. Generate a throwaway Ed25519 keypair locally. Sample Node script:
   ```js
   // scratch.mjs — DO NOT COMMIT
   import { webcrypto as subtle } from 'node:crypto';
   import { Buffer } from 'node:buffer';
   const kp = await subtle.subtle.generateKey({ name: 'Ed25519' }, true, ['sign','verify']);
   const rawPub = Buffer.from(await subtle.subtle.exportKey('raw', kp.publicKey));
   console.log('walletId base58:', /* encode rawPub to base58 using tweetnacl or similar */);
   // then: fetch POST /:walletId/challenge → sign the returned .message → POST /:walletId/enroll
   ```
3. Call `POST https://<preview>/wallets/:walletId/challenge` → inspect `{ nonce, expiresAt, message }`.
4. Sign the returned `message` with the private key (`subtle.subtle.sign({ name: 'Ed25519' }, kp.privateKey, Buffer.from(message))`).
5. Base58-encode the signature.
6. Call `POST https://<preview>/wallets/:walletId/enroll` with `{ nonce, signature }` → expect `{ enrolled: true, enrolledAt }`.
7. Query `SELECT * FROM monitored_wallets WHERE wallet_id = '<walletId>'` → one active row.
8. Query `SELECT * FROM wallet_challenges WHERE wallet_id = '<walletId>'` → **zero rows** (challenge was consumed).

If all steps succeed, the manual gate passes. If Step 6 returns `SIGNATURE_INVALID`, double-check that the signature was base58-encoded (not base64) and exactly 64 bytes.

- [ ] **Step 11.7: Commit nothing — this is a verification step**

No code change. If manual smoke reveals a bug, open a new iteration.

---

## Deploy sequence (for the PR description)

When this plan's PR is merged and ready to ship:

1. **Run migration first:** `pnpm --filter @clmm/adapters db:migrate` against production DB. Creates `wallet_challenges` table.
2. **Deploy code** (Cloudflare Worker). Controller expects the table to exist.
3. **Watch for 30–60 min:** check that `/challenge` and `/enroll` requests appear in logs with expected response codes.
4. **Follow-up (separate PR):** wire the `apps/app` client side to call `/challenge` → `wallet.signMessage(message)` → `/enroll`. Until this lands, the flow exists but isn't used by the shipped app.

Rollback: revert code deploy. `wallet_challenges` table can remain empty with zero impact — no FKs, no readers outside the new controller. Drop the table separately if desired.

---

## Non-goals reminder (for reviewers)

- No session tokens / JWT post-enroll.
- No rate limiting on `/challenge` (PK-upsert already bounds storage).
- No multi-challenge-per-wallet.
- No backward-compat `/monitor` alias — intentionally deleted.
- No `apps/app` wiring — separate PR.
