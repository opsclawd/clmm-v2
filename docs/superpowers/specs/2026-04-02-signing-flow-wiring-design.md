# Signing Flow Wiring Design

**Date:** 2026-04-02
**Status:** Approved
**Scope:** Wire the complete client-to-server signing flow so that the `/signing/:attemptId` page actually prompts the user's browser wallet and submits the signed transaction.

---

## Problem

The signing route (`apps/app/app/signing/[attemptId].tsx`) is entirely passive. After the user approves an execution from the preview page, they land on the signing page which:

1. Polls `GET /executions/:attemptId` every 5 seconds
2. Displays "Awaiting your signature / Wallet approval required"
3. Has no buttons, no wallet interaction, no transaction payload

No wallet prompt ever appears. The poll runs indefinitely. The root causes:

- No BFF endpoint exists to prepare an unsigned transaction payload for the client
- The signing page has no action button or wallet integration code
- The `GET /executions/:attemptId` response contains no signable payload
- The `BrowserWalletProvider` type does not include `signTransaction()`

---

## Design Decisions

These were explicitly chosen during brainstorming:

1. **Separate `POST /executions/:attemptId/prepare` endpoint** — approval is a business decision; preparation is a freshness-sensitive technical step (blockhash, instruction accounts). Fusing them risks stale payloads.
2. **Payload versioning** — `prepare` returns `payloadVersion`; `submit` validates it matches the latest prepared version.
3. **Three-endpoint split** — `approve` -> `prepare` -> `submit`, each with a single responsibility.
4. **Browser wallet first** — Phantom injected provider via `window.solana`. No MWA/native in this pass.
5. **Stop wasteful polling** — no polling while in `awaiting-signature`; only poll after submit to track confirmation.
6. **Explicit action button** — "Sign & Execute" button triggers the prepare -> sign -> submit sequence.

---

## Architecture

### Three-Endpoint Flow

```
POST /executions/approve              (existing, unchanged)
  -> creates attempt in awaiting-signature state
  -> returns { attemptId }
  -> client navigates to /signing/:attemptId

POST /executions/:attemptId/prepare   (NEW)
  -> reconstructs ExecutionPlan from stored preview + DirectionalExitPolicyService
  -> calls ExecutionPreparationPort.prepareExecution()
  -> stores prepared payload in DB (prepared_payloads table)
  -> returns { unsignedPayloadBase64, payloadVersion, expiresAt, requiresSignature: true }

POST /executions/:attemptId/submit    (existing, enhanced)
  -> validates payloadVersion matches latest prepared version
  -> rejects stale payloads (409) or expired payloads (410)
  -> submits signed transaction + reconciles
  -> returns result
```

### Client Signing Sequence

```
User taps "Sign & Execute"
  |
  v
Client: POST /executions/:attemptId/prepare
  -> receives { unsignedPayloadBase64, payloadVersion, expiresAt }
  |
  v
Client: decode base64 to Uint8Array
  -> call window.solana.signTransaction() via Phantom injected provider
  -> receives signed transaction bytes
  |
  v
Client: base64-encode signed bytes
  -> POST /executions/:attemptId/submit { signedPayload, payloadVersion }
  |
  v
Navigate to /execution/:attemptId (result page)
```

---

## Server Changes

### New: `prepared_payloads` Table

| Column | Type | Notes |
|--------|------|-------|
| `payload_id` | text PK | generated ID |
| `attempt_id` | text, unique | one active payload per attempt |
| `unsigned_payload` | bytea | serialized transaction bytes |
| `payload_version` | text | random ID, changes each prepare call |
| `expires_at` | bigint | blockhash-based TTL (~90s from prepare time) |
| `created_at` | bigint | |

The unique constraint on `attempt_id` means each new `prepare` call overwrites the previous payload for that attempt. This is intentional — only the latest payload is valid.

### New: `POST /executions/:attemptId/prepare` Endpoint

Added to `ExecutionController`. Logic:

1. Load the attempt from `ExecutionRepository` — 404 if not found
2. Validate attempt is in `awaiting-signature` state — 409 if not
3. Load the linked preview from `ExecutionRepository` (the approve step stores the `previewId` on the attempt)
4. Apply `DirectionalExitPolicyService` to get policy result (posture + swap instruction)
5. Build `ExecutionPlan` via `ExecutionPlanFactory` (domain service)
6. Call `ExecutionPreparationPort.prepareExecution()` with the plan — gets `serializedPayload` + `preparedAt`
7. Generate `payloadVersion` ID
8. Calculate `expiresAt` = `preparedAt` + 90_000ms (blockhash validity window)
9. Upsert into `prepared_payloads` table
10. Return `{ unsignedPayloadBase64, payloadVersion, expiresAt, requiresSignature: true }`

**Dependency injection**: `ExecutionPreparationPort` needs to be injected. Add `EXECUTION_PREPARATION_PORT` to `tokens.ts`, wire `SolanaExecutionPreparationAdapter` in `AdaptersModule`.

### Enhanced: `POST /executions/:attemptId/submit` Endpoint

Before processing the signed payload, the submit endpoint now:

1. Loads `prepared_payloads` row for this `attemptId`
2. Validates `body.payloadVersion` matches row's `payload_version` — 409 Conflict if mismatch
3. Validates `row.expires_at > clock.now()` — 410 Gone if expired
4. Proceeds with existing submission flow if both pass

New request body shape: `{ signedPayload: string; payloadVersion: string; breachDirection?: ... }`

### New: Port for Prepared Payload Storage

The `prepared_payloads` table access is handled within the existing `OperationalStorageAdapter` scope. New methods on `ExecutionRepository`:

```typescript
savePreparedPayload(params: {
  payloadId: string;
  attemptId: string;
  unsignedPayload: Uint8Array;
  payloadVersion: string;
  expiresAt: ClockTimestamp;
  createdAt: ClockTimestamp;
}): Promise<void>;

getPreparedPayload(attemptId: string): Promise<{
  payloadVersion: string;
  unsignedPayload: Uint8Array;
  expiresAt: ClockTimestamp;
} | null>;
```

### Linking Preview to Attempt

The approve step currently creates a `StoredExecutionAttempt` without a reference to the `previewId`. The prepare endpoint needs to know which preview to reconstruct the plan from. Two options:

- **Option A**: Add `previewId` field to `StoredExecutionAttempt` and `execution_attempts` table
- **Option B**: Pass `previewId` in the prepare request body from the client

**Chosen: Option A** — the server already has the `previewId` at approve time. Storing it on the attempt avoids the client needing to track and forward it, and prevents the client from substituting a different preview.

This means:
- Add `preview_id` column to `execution_attempts` table (nullable for backwards compat, but required for new attempts)
- Extend `StoredExecutionAttempt` type with `previewId?: string`
- Set it in the approve endpoint when creating the attempt

### Wallet ID for Prepare

`ExecutionPreparationPort.prepareExecution()` requires a `walletId`. The approve step does not currently store which wallet is executing. Two options:

- **Option A**: Add `walletId` to `StoredExecutionAttempt` and pass it at approve time
- **Option B**: Pass `walletId` in the prepare request body from the client

**Chosen: Option B** — the wallet address is known on the client (from `walletSessionStore`). Passing it in the prepare body is simpler and avoids coupling approval to a specific wallet session (the user could reconnect a different wallet between approve and prepare, though unlikely).

Prepare request body: `{ walletId: string }`

---

## Client Changes

### Extended `BrowserWalletProvider` Type

`apps/app/src/platform/browserWallet.ts` adds:

```typescript
export type BrowserWalletProvider = {
  isPhantom?: boolean;
  publicKey?: BrowserWalletPublicKey | null;
  connect(): Promise<{ publicKey?: BrowserWalletPublicKey | null } | null | undefined>;
  disconnect?(): Promise<void>;
  signTransaction?(transaction: Uint8Array): Promise<Uint8Array>;  // NEW
};
```

New helper function:

```typescript
export async function signTransactionWithBrowserWallet(
  browserWindow: BrowserWalletWindow | undefined,
  serializedTransaction: Uint8Array,
): Promise<Uint8Array> {
  const provider = getInjectedBrowserProvider(browserWindow);
  if (!provider) throw new Error('No supported browser wallet detected');
  if (!provider.signTransaction) throw new Error('Wallet does not support transaction signing');
  return provider.signTransaction(serializedTransaction);
}
```

Note: The actual Phantom provider's `signTransaction()` accepts a `Transaction` object, not raw bytes. The exact API shape will be verified against Phantom docs during implementation. The adapter may need to deserialize the bytes into a Transaction object before passing to Phantom. This is an implementation detail that does not affect the overall design.

### New: `prepareExecution` Client API Function

`apps/app/src/api/executions.ts` adds:

```typescript
export type PrepareResponse = {
  unsignedPayloadBase64: string;
  payloadVersion: string;
  expiresAt: number;
  requiresSignature: true;
};

export async function prepareExecution(
  attemptId: string,
  walletId: string,
): Promise<PrepareResponse> {
  const response = await fetch(`${getBffBaseUrl()}/executions/${attemptId}/prepare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletId }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Prepare failed: HTTP ${response.status}${text ? `: ${text}` : ''}`);
  }
  return response.json() as Promise<PrepareResponse>;
}
```

`submitExecution` updated to include `payloadVersion`:

```typescript
export async function submitExecution(
  attemptId: string,
  signedPayload: string,
  payloadVersion: string,
): Promise<{ result: 'confirmed' | 'failed' | 'partial' | 'pending' }> { ... }
```

### Updated: Signing Route (`apps/app/app/signing/[attemptId].tsx`)

The route becomes the orchestrator for the prepare -> sign -> submit flow:

```typescript
export default function SigningRoute() {
  const { attemptId } = useLocalSearchParams<{ attemptId: string }>();
  const router = useRouter();
  const walletAddress = useWalletSessionStore((s) => s.walletAddress);

  const [signingState, setSigningState] = useState<
    'idle' | 'preparing' | 'signing' | 'submitting' | 'error'
  >('idle');
  const [signingError, setSigningError] = useState<string | undefined>();

  // Fetch attempt data (no automatic polling while awaiting-signature)
  const executionQuery = useQuery({
    queryKey: ['execution', attemptId],
    queryFn: () => fetchExecution(attemptId!),
    enabled: attemptId != null && attemptId.length > 0,
    refetchInterval: (query) => {
      const state = query.state.data?.lifecycleState?.kind;
      // Only poll after submit, not while awaiting signature
      if (state === 'submitted') return 5_000;
      return false;
    },
  });

  // Navigate to result page on terminal state
  useEffect(() => { ... same as current ... });

  async function handleSignAndExecute() {
    try {
      setSigningState('preparing');
      setSigningError(undefined);

      const prepared = await prepareExecution(attemptId!, walletAddress!);

      setSigningState('signing');
      const unsignedBytes = Uint8Array.from(atob(prepared.unsignedPayloadBase64), c => c.charCodeAt(0));
      const signedBytes = await signTransactionWithBrowserWallet(window, unsignedBytes);
      const signedBase64 = btoa(String.fromCharCode(...signedBytes));

      setSigningState('submitting');
      await submitExecution(attemptId!, signedBase64, prepared.payloadVersion);

      // After submit, the query will start polling (state is now 'submitted')
      await executionQuery.refetch();
    } catch (err) {
      setSigningState('error');
      setSigningError(err instanceof Error ? err.message : 'Signing failed');
    }
  }

  return (
    <SigningStatusScreen
      lifecycleState={attempt?.lifecycleState}
      breachDirection={attempt?.breachDirection}
      retryEligible={attempt?.retryEligible}
      signingState={signingState}
      signingError={signingError}
      onSignAndExecute={handleSignAndExecute}
      walletConnected={walletAddress != null}
    />
  );
}
```

### Updated: `SigningStatusScreen` (`packages/ui/src/screens/SigningStatusScreen.tsx`)

New props:

```typescript
type Props = {
  lifecycleState?: ExecutionLifecycleState;
  breachDirection?: BreachDirection;
  retryEligible?: boolean;
  signingState: 'idle' | 'preparing' | 'signing' | 'submitting' | 'error';
  signingError?: string;
  onSignAndExecute: () => void;
  walletConnected: boolean;
};
```

Renders:
- Directional policy card (existing, unchanged)
- Execution state card (existing, unchanged)
- **"Sign & Execute" button** — visible when `signingState === 'idle'` and `lifecycleState.kind === 'awaiting-signature'` and `walletConnected`
- **Progress indicator** — visible during `preparing` / `signing` / `submitting` states with contextual label
- **Error card** — visible when `signingState === 'error'`, shows `signingError` text and a "Try Again" button
- **"No wallet connected" message** — visible when `!walletConnected`

---

## Error Handling

| Failure | Client Behavior | Server Behavior |
|---------|----------------|-----------------|
| Prepare fails (500) | Show error, "Try Again" button | Log error, return 500 |
| Attempt not in awaiting-signature (409 on prepare) | Show terminal error, navigate to result | Return 409 with current state |
| Wallet declines signing | Show "Signing declined", "Try Again" | No server call |
| Wallet popup blocked/unavailable | Show "Wallet unavailable" error | No server call |
| Submit — version mismatch (409) | Show error, "Try Again" (user re-triggers full flow) | Return 409 with reason |
| Submit — payload expired (410) | Show error, "Try Again" (user re-triggers full flow) | Return 410 with reason |
| Submit — attempt state conflict (409) | Show terminal error, navigate to result | Return 409 with state |
| Submission succeeds, reconciliation pending | Navigate to result page, poll for confirmation | Return `{ result: 'pending' }` |

On version mismatch or expiry, "Try Again" re-runs the entire prepare -> sign -> submit sequence. No automatic retry — the user must explicitly re-trigger because each attempt involves a wallet signature prompt.

---

## Polling Behavior

**Current (broken):** Unconditional 5-second polling regardless of lifecycle state.

**New:** Conditional polling based on lifecycle state:
- `awaiting-signature`: no polling (user must act)
- `submitted`: poll every 5 seconds (waiting for on-chain confirmation)
- Terminal states (`confirmed`, `failed`, `partial`, `abandoned`): no polling (navigate to result)

Implemented via TanStack Query's `refetchInterval` callback which receives the current query state.

---

## Files Changed

### New Files
- `packages/adapters/src/outbound/storage/schema/prepared-payloads.ts` — Drizzle schema for `prepared_payloads` table
- Drizzle migration file for the new table + `preview_id` column on `execution_attempts`

### Modified Files (Server)
- `packages/application/src/ports/index.ts` — add `savePreparedPayload`, `getPreparedPayload` to `ExecutionRepository`; add `previewId` to `StoredExecutionAttempt`
- `packages/application/src/dto/index.ts` — add `PreparedPayloadDto` type
- `packages/adapters/src/inbound/http/ExecutionController.ts` — add `prepare` endpoint, enhance `submit` with version validation
- `packages/adapters/src/inbound/http/tokens.ts` — add `EXECUTION_PREPARATION_PORT` token
- `packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts` — implement `savePreparedPayload`, `getPreparedPayload`; store `previewId` on attempts
- `packages/adapters/src/outbound/storage/schema/executions.ts` — add `preview_id` column to `execution_attempts`
- `packages/adapters/src/composition/AdaptersModule.ts` — wire `EXECUTION_PREPARATION_PORT`

### Modified Files (Client)
- `apps/app/src/platform/browserWallet.ts` — add `signTransaction` to `BrowserWalletProvider` type, add `signTransactionWithBrowserWallet` function
- `apps/app/src/api/executions.ts` — add `prepareExecution` function, update `submitExecution` signature
- `apps/app/app/signing/[attemptId].tsx` — rewrite with signing orchestration, conditional polling, state management
- `packages/ui/src/screens/SigningStatusScreen.tsx` — add button, progress states, error display

### Modified Files (Testing)
- `packages/testing/src/fakes/` — update `FakeExecutionRepository` with new methods, add fake prepared payload storage

---

## Out of Scope

- MWA / native wallet signing (browser-first for localhost web development)
- Automatic prepare-on-page-load (user explicitly triggers via button)
- WebSocket for real-time state updates (polling after submit is sufficient)
- Retry for partial completions (partial is terminal per domain rules)
- Changes to the domain layer (DirectionalExitPolicyService, state machine, etc.)
- Changes to the approve endpoint (except storing `previewId` on the attempt)
