---
title: "Wallet ownership proof enrollment: challenge-response with Ed25519 verification"
date: 2026-05-02
category: best-practices
module: wallet-verify
problem_type: best_practice
component: authentication
severity: critical
applies_when:
  - Implementing challenge-response auth flows
  - Building enrollment systems that need ownership proof
  - Port contracts need atomic side effects (delete + upsert)
  - Cross-platform crypto signing (mobile wallet adapter vs browser extension)
related_components: [wallet-challenge-repository, wallet-controller, wallet-verify]
tags: [challenge-response, ed25519, enrollment, ownership-proof, webcrypto, cross-platform, discriminated-union, transactional]
---

# Wallet ownership proof enrollment: challenge-response with Ed25519 verification

## Context

The old `enrollWalletForMonitoring` was a fire-and-forget call — any wallet address could be enrolled for CLMM position monitoring without proving control of the corresponding private key. This meant a third party could register arbitrary wallets and receive monitoring data about positions they didn't own. The system needed cryptographic proof that the enrollee controls the wallet before allowing enrollment.

## Guidance

### 3-method port contract pattern for challenge repositories

The `WalletChallengeRepository` interface defines three operations: `issue`, `get`, and `consumeAndEnrollIfMatches`. This separation keeps challenge creation, lookup, and atomic consumption distinct:

```typescript
export type ConsumeAndEnrollResult =
  | { kind: 'consumed' }
  | { kind: 'not_found' }
  | { kind: 'expired' }
  | { kind: 'mismatch' };

export interface WalletChallengeRepository {
  issue(params: {
    walletId: WalletId;
    nonce: string;
    expiresAt: ClockTimestamp;
    issuedAt: ClockTimestamp;
    now: ClockTimestamp;
  }): Promise<WalletChallengeRow>;

  get(walletId: WalletId): Promise<WalletChallengeRow | null>;

  consumeAndEnrollIfMatches(params: {
    walletId: WalletId;
    nonce: string;
    now: ClockTimestamp;
    enrolledAt: ClockTimestamp;
  }): Promise<ConsumeAndEnrollResult>;
}
```

Key property: `consumeAndEnrollIfMatches` returns a discriminated union rather than throwing, so callers can distinguish not-found, expired, and mismatch cases without catching.

### Transactional challenge consumption with FOR UPDATE locking

The Postgres adapter wraps `consumeAndEnrollIfMatches` in a transaction that locks the challenge row with `FOR UPDATE`, deletes it, and upserts `monitored_wallets` — all atomically:

```typescript
async consumeAndEnrollIfMatches(params: { ... }): Promise<ConsumeAndEnrollResult> {
  return this.db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(walletChallenges)
      .where(eq(walletChallenges.walletId, params.walletId))
      .for('update');

    if (!row) return { kind: 'not_found' };
    if (row.nonce !== params.nonce) return { kind: 'mismatch' };
    if (row.expiresAt < params.now) return { kind: 'expired' };

    await tx.delete(walletChallenges)
      .where(and(
        eq(walletChallenges.walletId, params.walletId),
        eq(walletChallenges.nonce, params.nonce),
      ));

    await tx.insert(monitoredWallets)
      .values({ walletId: params.walletId, enrolledAt: params.enrolledAt, active: true })
      .onConflictDoUpdate({
        target: monitoredWallets.walletId,
        set: { active: true, enrolledAt: params.enrolledAt },
      });

    return { kind: 'consumed' };
  });
}
```

### Idempotent challenge issuance with TTL

Challenge issuance is idempotent within the 5-minute TTL — if an unexpired challenge already exists for the wallet, the same nonce is returned. This allows clients to safely retry if the network drops:

```typescript
async issue(params: { ... }): Promise<WalletChallengeRow> {
  return this.db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(walletChallenges)
      .where(eq(walletChallenges.walletId, params.walletId))
      .for('update');

    if (existing && existing.expiresAt >= params.now) {
      return { walletId: existing.walletId, nonce: existing.nonce, ... };
    }

    await tx.insert(walletChallenges)
      .values({ ... })
      .onConflictDoUpdate({
        target: walletChallenges.walletId,
        set: { nonce: params.nonce, expiresAt: params.expiresAt, issuedAt: params.issuedAt },
      });

    return { walletId: params.walletId, nonce: params.nonce, ... };
  });
}
```

### Discriminated-union error types for type-safe error handling

Both the API layer and the orchestrator use discriminated unions so every error path has a named variant:

```typescript
// API layer — discriminated result types
export type ChallengeResult =
  | { kind: 'ok'; challenge: WalletChallenge }
  | { kind: 'error'; code: EnrollErrorCode };

export type EnrollErrorCode =
  | 'WALLET_MALFORMED'
  | 'CHALLENGE_NOT_FOUND'
  | 'CHALLENGE_EXPIRED'
  | 'CHALLENGE_MISMATCH'
  | 'SIGNATURE_INVALID'
  | 'ENROLLMENT_UPGRADE_REQUIRED'
  | 'BAD_REQUEST'
  | 'NETWORK_ERROR';

// Orchestrator — distinct outcome per failure mode
export type EnrollmentOutcome =
  | { kind: 'enrolled'; enrolledAt: number }
  | { kind: 'challenge-failed'; code: EnrollErrorCode }
  | { kind: 'signing-unsupported' }
  | { kind: 'wallet-mismatch' }
  | { kind: 'user-rejected' }
  | { kind: 'signing-failed' }
  | { kind: 'enroll-failed'; code: EnrollErrorCode };
```

### Cross-platform signing dispatch

The `signMessageWithWallet` router dispatches to native (MWA) or browser (wallet-standard) signing based on `connectionKind`:

```typescript
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

  const signer = params.browserSigner;
  if (signer === null || typeof signer.signMessageBytes !== 'function') {
    return { kind: 'unsupported' };
  }
  // ... browser signing path
}
```

### WebCrypto Ed25519 verification (no @solana/web3.js)

Signature verification uses the WebCrypto API with JWK-imported Ed25519 keys, avoiding any dependency on `@solana/web3.js` `Connection`, `PublicKey`, or `Transaction`:

```typescript
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
    const jwk = { kty: 'OKP', crv: 'Ed25519', x: bytesToBase64Url(publicKey) };
    const cryptoKey = await subtle.importKey(
      'jwk', jwk, { name: 'Ed25519' }, false, ['verify'],
    );
    return await subtle.verify(
      { name: 'Ed25519' }, cryptoKey, signature.buffer as ArrayBuffer, messageBytes,
    );
  } catch {
    return false;
  }
}
```

### Orchestrator: challenge → sign → enroll

The `verifyWalletEnrollment` function orchestrates the full three-step flow, with each step producing a discriminated outcome that the UI can handle:

```typescript
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

  // Switch on discriminated union — each case maps to EnrollmentOutcome
  switch (signed.kind) {
    case 'unsupported': return { kind: 'signing-unsupported' };
    case 'wallet-mismatch': return { kind: 'wallet-mismatch' };
    case 'rejected': return { kind: 'user-rejected' };
    case 'failed': return { kind: 'signing-failed' };
    case 'ok': break;
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

### Lint pitfalls with WebCrypto and sync throws

Two lint errors surfaced during implementation that are easy to hit in this pattern:

1. **`@typescript-eslint/no-unnecessary-type-assertion`** — `Uint8Array.buffer` is already `ArrayBuffer` in the type system, so `messageBytes.buffer as ArrayBuffer` is unnecessary. Since `Uint8Array` is a valid `BufferSource` for `subtle.verify`, pass it directly:
   ```typescript
   // Bad — unnecessary assertion
   subtle.verify({ name: 'Ed25519' }, cryptoKey, sig.buffer as ArrayBuffer, msg.buffer as ArrayBuffer)
   // Good — Uint8Array is already a valid BufferSource
   subtle.verify({ name: 'Ed25519' }, cryptoKey, sig.buffer as ArrayBuffer, messageBytes)
   ```

2. **`@typescript-eslint/await-thenable`** — Methods returning `never` (synchronous throws) must not be `await`ed. The `/monitor` tombstone throws a 410 `HttpException` synchronously, so `await controller.monitor(id)` triggers the lint error. Remove `await` for sync-throwing methods.

## Why This Matters

Without proof of ownership, any wallet address could be enrolled for monitoring. The challenge-response pattern with Ed25519 signature verification provides cryptographic proof that the enrollee controls the private key corresponding to the wallet address. Key security properties:

- **Failed signature verification does NOT consume the challenge** — the controller checks the signature before calling `consumeAndEnrollIfMatches`, allowing retry without re-issuing.
- **`consumeAndEnrollIfMatches` is transactional** — deletes the challenge and upserts `monitored_wallets` atomically, preventing double-enrollment or challenge replay.
- **The old `/monitor` endpoint is a 410 tombstone** — returns `ENROLLMENT_UPGRADE_REQUIRED` to guide legacy clients to the new flow.
- **No `@solana/web3.js` dependency** in verification — uses WebCrypto Ed25519 directly, keeping the adapter SDK_boundary clean.

## When to Apply

- When implementing challenge-response auth flows that require cryptographic proof of identity
- When building enrollment or registration systems that need ownership verification before side effects
- When port contracts need atomic side effects (e.g., delete one record + upsert another in the same transaction)
- When building cross-platform crypto signing where the same logical operation must dispatch to platform-specific APIs (MWA on native, wallet-standard on browser)
- When replacing fire-and-forget patterns with verified, user-confirmed flows

## Related

- [Outbound adapter fire-and-forget dual-seam pattern](./outbound-adapter-fire-and-forget-dual-seam-pattern-2026-04-19.md) — the pattern this enrollment replaces; `enrollWalletForMonitoring` was fire-and-forget with `.catch(() => {})`, this is verified challenge-response
- [Read-only data API discriminated unions BFF](./read-only-data-api-discriminated-unions-bff-2026-05-01.md) — same discriminated-union controller error mapping pattern applied to read-only data composition
- [Connect screen extraction regression](../ui-bugs/connect-screen-extraction-regression-review-findings-2026-04-25.md) — previous finding that fire-and-forget enrollment calls caused unhandled promise rejections; **refresh candidate** since this feature replaces that pattern entirely
- `packages/application/src/ports/index.ts` — port contract definitions (`WalletChallengeRepository`, `ConsumeAndEnrollResult`)
- `packages/adapters/src/outbound/storage/WalletChallengePostgresAdapter.ts` — transactional Postgres implementation
- `packages/adapters/src/inbound/http/WalletVerification.ts` — WebCrypto Ed25519 verification
- `packages/adapters/src/inbound/http/WalletController.ts` — 3 endpoints: `/challenge`, `/enroll`, `/monitor` (410 tombstone)
- `apps/app/src/wallet-verify/verifyWalletEnrollment.ts` — orchestrator with `EnrollmentOutcome` union
- `apps/app/src/wallet-verify/signMessageWithWallet.ts` — cross-platform signing dispatch
- `apps/app/src/api/wallets.ts` — API layer with `EnrollErrorCode` discriminated union
- `packages/testing/src/fakes/FakeWalletChallengeRepository.ts` — in-memory test fake