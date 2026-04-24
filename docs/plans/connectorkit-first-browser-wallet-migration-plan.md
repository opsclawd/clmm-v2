# ConnectorKit-First Browser Wallet Integration Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Goal

Replace the brittle DIY injected-provider browser wallet path with a maintained, standards-aligned wallet integration that works across:

- Phantom mobile in-app browser
- Desktop Phantom extension
- Android Chrome mobile web
- Android Chrome-installed PWA
- Existing native Expo React Native MWA path
- Future Wallet Standard-compatible Solana wallets where practical

The migration must preserve the existing app-level execution contract:

- Server sends base64 serialized v0 transaction payload.
- Browser wallet path signs and returns base64 signed wire transaction.
- Native MWA path remains unchanged.
- `connectionKind` discriminator remains unchanged.
- `walletSessionStore`, navigation, monitoring enrollment, execution attempt flow, and server DTOs remain unchanged.
- The browser wallet implementation is hidden behind local app hooks, so library swaps do not leak into screens.

## Strategic Decision

Do **not** implement the previous direct-Wallet-Standard migration as-is.

The previous plan correctly identified the root problem: direct injected-provider patching was turning into reverse-engineering Phantom mobile quirks. But it was still too narrow because it optimized primarily for Phantom mobile in-app browser, not Android Chrome/PWA installed-wallet support.

The revised direction is:

1. **Primary path:** `@solana/connector` / ConnectorKit.
2. **Required mobile-web registration:** `@solana-mobile/wallet-standard-mobile` with explicit `registerMwa()` from a web-only, client-only provider boundary.
3. **Fallback A:** Direct Wallet Standard with `@wallet-standard/react-core` + `@solana/react` + explicit `registerMwa()`.
4. **Fallback B:** `@solana/wallet-adapter-react` only if ConnectorKit and direct Wallet Standard fail on real devices.
5. **Last-resort Phantom-specific escape hatch:** `@phantom/browser-sdk`, only if Phantom mobile in-app browser fails under the standard paths and the business priority requires Phantom-specific rescue.

Do **not** make `@phantom/browser-sdk` the first fallback. That would solve one wallet’s behavior while weakening broader mobile-browser compatibility.

### Why ConnectorKit-first despite v0.x

ConnectorKit (`@solana/connector` at 0.2.x) is pre-1.0, which is a legitimate concern after a multi-patch failure on injected providers. We still choose it as primary because:

1. **Built-in MWA registration.** ConnectorKit wraps `registerMwa()` so the Android Chrome / PWA path works without us owning the registration race logic. Direct Wallet Standard leaves that to us.
2. **Headless core matches our shape.** We already own custom wallet UI (`connect.tsx`, `WalletConnectScreen`) — we want primitives, not a modal. ConnectorKit's headless React hooks fit; `@solana/wallet-adapter-react-ui` would fight our existing UI.
3. **Kit + web3.js dual support.** Our adapters are `@solana/kit`-native; ConnectorKit supports both, whereas wallet-adapter is web3.js-v1 only.
4. **Single integration surface for connect / sign / disconnect / discovery / MWA.** Direct Wallet Standard requires stitching `@wallet-standard/react-core`, `@solana/react`, and `@solana-mobile/wallet-standard-mobile` together ourselves — four libraries with subtle version compatibility.
5. **Debugger in dev.** `@solana/connector-debugger` gives us connection-state visibility we otherwise have to build.

The v0.x risk is mitigated by:
- **Task 0 is a hard gate** deployed to a real Phantom-mobile device before any production refactor.
- **Hooks-only contract below** insulates screens — if ConnectorKit fails post-launch, Fallback A is an adapter-layer swap, not a screen rewrite.
- **Direct Wallet Standard is the first fallback,** not last — we stay one migration step from the standards-first alternative.

Record this rationale in the Task 0 decision note and re-confirm after spike evidence.

## Non-Negotiable Architecture Rule

Screens must not import ConnectorKit, Wallet Standard, wallet-adapter, Phantom SDK, or MWA libraries directly.

Only these local app abstractions may be consumed by screens:

```ts
useBrowserWalletConnect()
useBrowserWalletSign()
useBrowserWalletDisconnect()
BrowserWalletProvider
```

Those hooks expose this stable app contract:

```ts
type BrowserWalletConnect = {
  connect(): Promise<string>;
  connecting: boolean;
  error: Error | null;
};

type BrowserWalletSign = {
  sign(serializedPayloadBase64: string): Promise<string>;
  signing: boolean;
};

type BrowserWalletDisconnect = {
  disconnect(): Promise<void>;
  disconnecting: boolean;
};
```

This prevents another expensive migration if ConnectorKit fails and the implementation must fall back.

---

# Compatibility Target Matrix

| Surface | Required behavior | Gate |
|---|---|---|
| iOS Phantom in-app browser | Connect + sign + reject/cancel mapping works | Required |
| Android Phantom in-app browser | Connect + sign + reject/cancel mapping works | Required |
| Android Chrome browser | Installed-wallet/MWA option appears and connects | Required |
| Android Chrome-installed PWA | Installed-wallet/MWA option appears and connects | Required |
| Desktop Chrome + Phantom extension | Connect + sign + disconnect regression passes | Required |
| Native Expo app MWA path | Unchanged from current behavior | Required |
| iOS Safari regular browser | Shows valid fallback: Open in Phantom / Open in Solflare / unsupported MWA note | Required |
| Android Firefox/Brave/Opera | Does not falsely promise MWA; shows fallback path | Required |
| Social app in-app browsers | Shows explicit Open in browser / Open in wallet browser escape hatch | Required |

Do not claim broad mobile-wallet compatibility until this matrix passes on real devices.

---

# Library Decision Tree

## Preferred Path: ConnectorKit

Use this if the spike proves all required paths:

```bash
pnpm --filter @clmm/app add @solana/connector @solana-mobile/wallet-standard-mobile
```

Optional development helper:

```bash
pnpm --filter @clmm/app add -D @solana/connector-debugger
```

Expected advantages:

- Wallet Standard-first
- Headless enough for your custom UI
- Better alignment with `@solana/kit`
- Solana Mobile support directionally fits the Android Chrome/PWA requirement
- Avoids dragging screen code into wallet-adapter abstractions
- Can coexist with your base64 transaction DTO contract through local hook conversion

Risks:

- Newer library
- Less accumulated troubleshooting history than wallet-adapter
- Must be proven against Phantom mobile and Android Chrome before migration

## Fallback A: Direct Wallet Standard

Use only if ConnectorKit fails due to API mismatch, unstable behavior, bundling issues, or insufficient signing control.

```bash
pnpm --filter @clmm/app add @wallet-standard/react-core @solana/react @wallet-standard/app @solana-mobile/wallet-standard-mobile
```

Expected advantages:

- Thinest standards-based integration
- Clear Wallet Standard primitives
- Fewer framework abstractions
- Easier to reason about exact connect/sign/disconnect features

Risks:

- More integration burden
- You own wallet selection state and edge cases
- Android Chrome MWA must be explicitly registered and tested
- More test scaffolding required

## Fallback B: Solana Wallet Adapter

Use only if ConnectorKit and direct Wallet Standard fail.

```bash
pnpm --filter @clmm/app add @solana/wallet-adapter-react @solana/wallet-adapter-base @solana/wallet-adapter-wallets @solana/wallet-adapter-phantom @solana-mobile/wallet-standard-mobile
```

Expected advantages:

- Mature ecosystem
- Many examples
- Known Solana React integration path
- Existing Solana Mobile docs recognize this path

Risks:

- Older abstraction
- More `@solana/web3.js` gravity
- More adapter surface than your app needs
- Easier to leak wallet-adapter semantics into screens

## Last-Resort Phantom-Specific Rescue

Use only if the standard paths fail specifically in Phantom mobile and Phantom support is strategically mandatory.

```bash
pnpm --filter @clmm/app add @phantom/browser-sdk
```

Expected advantages:

- Official Phantom path
- Useful for Phantom-specific embedded/social login features
- Can rescue Phantom mobile quirks

Risks:

- Phantom-specific
- Does not solve broad wallet compatibility
- Must not replace the standards-based browser wallet abstraction

---

# File Structure

## New Files

```txt
apps/app/src/platform/browserWallet/
  BrowserWalletProvider.web.tsx
  BrowserWalletProvider.native.tsx
  useBrowserWalletConnect.ts
  useBrowserWalletSign.ts
  useBrowserWalletDisconnect.ts
  browserWalletTypes.ts
  walletSelection.ts
  base64Bytes.ts
  errorMapping.ts
  mobileWalletRegistration.web.ts
  connectorKitAdapter.web.ts
  connectorKitAdapter.test.ts
  useBrowserWalletConnect.test.ts
  useBrowserWalletSign.test.ts
  useBrowserWalletDisconnect.test.ts
  index.ts

apps/app/app/spike-wallet.tsx

docs/superpowers/notes/
  2026-04-24-browser-wallet-connector-selection.md

docs/solutions/integration-issues/
  phantom-mobile-injected-provider-migrated-to-connectorkit-wallet-standard-2026-04-24.md
```

## Modified Files

```txt
apps/app/app/_layout.tsx
apps/app/app/connect.tsx
apps/app/app/signing/[attemptId].tsx
apps/app/app/(tabs)/wallet.tsx
apps/app/package.json
pnpm-lock.yaml

packages/adapters/src/outbound/capabilities/WebPlatformCapabilityAdapter.ts
packages/adapters/src/outbound/capabilities/WebPlatformCapabilityAdapter.test.ts

apps/app/src/platform/webNavigation.ts
apps/app/src/platform/webNavigation.test.ts
apps/app/src/platform/walletConnection.ts
```

## Deleted or Collapsed Files After E2E Passes

```txt
apps/app/src/platform/browserWallet.ts
apps/app/src/platform/browserWallet.test.ts
```

Do not delete old injected-provider code until the full real-device matrix passes.

---

# Task 0: Connector Selection Spike

This is a hard gate. Do not migrate production call sites before this passes.

## Task 0.1: Create decision note

**Files:**

```txt
docs/superpowers/notes/2026-04-24-browser-wallet-connector-selection.md
```

- [ ] Create the note with sections:
  - Problem
  - Candidate libraries
  - **Why ConnectorKit is the primary choice despite v0.x** (restate the five points from the Strategic Decision section in your own words; if you can't defend them after reading the ConnectorKit source/docs, stop and raise the question before running the spike)
  - Device matrix
  - Spike results
  - Error shapes
  - Decision (re-confirmed or reversed after spike evidence)
  - Version pins
  - Follow-up risks

Commit:

```bash
git add docs/superpowers/notes/2026-04-24-browser-wallet-connector-selection.md
git commit -m "docs: start browser wallet connector selection record"
```

## Task 0.2: Install ConnectorKit spike dependencies

**Files:**

```txt
apps/app/package.json
pnpm-lock.yaml
```

- [ ] On throwaway branch `spike/connectorkit-wallet-probe`, install:

```bash
pnpm --filter @clmm/app add @solana/connector @solana-mobile/wallet-standard-mobile
pnpm install
```

- [ ] If available and useful, add debugger as dev dependency:

```bash
pnpm --filter @clmm/app add -D @solana/connector-debugger
```

- [ ] Run:

```bash
pnpm --filter @clmm/app typecheck 2>&1 | head -50
```

Expected: only known baseline errors. No new wallet-library import or platform errors.

## Task 0.3: Establish MWA registration ownership

**First question, before any code:** Does ConnectorKit register MWA internally when initialized with Solana mainnet/devnet chains?

- [ ] **Step 1: Check.** Read `@solana/connector`'s initialization source / docs. Look for any internal call to `registerMwa` from `@solana-mobile/wallet-standard-mobile`, or configuration options like `mobileWalletAdapter: true`.

  - If **ConnectorKit owns registration**: skip the manual registration module entirely. Do not double-register (Wallet Standard spec permits it, but two registrations produce duplicate wallet entries in `getWallets()`, breaking wallet-selection logic). Document in the decision note: *"MWA registered by ConnectorKit — manual registration not required."*
  - If **ConnectorKit does not own registration**: create the manual registration module below. Document in the decision note: *"MWA registered manually via `@solana-mobile/wallet-standard-mobile` — ConnectorKit does not handle this."*
  - If **unclear from docs/source**: register manually AND log the wallet count from `@wallet-standard/app`'s `getWallets().get()` before and after ConnectorKit mount. If the count increases by more than 1 across the ConnectorKit init, double-registration is happening. Remove the manual registration and rely on ConnectorKit.

- [ ] **Step 2 (only if manual registration is needed): create the web-only module.**

**Files:**

```txt
apps/app/src/platform/browserWallet/mobileWalletRegistration.web.ts
apps/app/src/platform/browserWallet/mobileWalletRegistration.native.ts
```

Sketch:

```ts
let registered = false;

export async function registerMobileWalletStandard(): Promise<void> {
  if (registered) return;
  if (typeof window === 'undefined') return;

  const {
    createDefaultAuthorizationCache,
    createDefaultChainSelector,
    createDefaultWalletNotFoundHandler,
    registerMwa,
  } = await import('@solana-mobile/wallet-standard-mobile');

  registerMwa({
    appIdentity: {
      name: 'CLMM V2', // must match native APP_IDENTITY in apps/app/src/platform/nativeWallet.ts
      uri: window.location.origin,
      icon: `${window.location.origin}/icon.png`,
    },
    authorizationCache: createDefaultAuthorizationCache(),
    chains: ['solana:mainnet', 'solana:devnet'],
    chainSelector: createDefaultChainSelector(),
    onWalletNotFound: createDefaultWalletNotFoundHandler(),
  });

  registered = true;
}
```

Native stub:

```ts
export async function registerMobileWalletStandard(): Promise<void> {
  return;
}
```

Rules:

- **App identity name must match the native MWA path exactly** (currently `'CLMM V2'` in `apps/app/src/platform/nativeWallet.ts`). A mismatched name shows a different string in wallet approval dialogs across web vs native, which users will rightly find suspicious.
- No static import of `@solana-mobile/wallet-standard-mobile` from native code.
- No `window` access during module evaluation.
- Registration happens from provider mount or spike route `useEffect`.
- If ConnectorKit handles registration (Step 1 yes), delete these files before Task 3 rather than leaving them as dormant dead code.

## Task 0.4: Build `/spike-wallet`

**Files:**

```txt
apps/app/app/spike-wallet.tsx
```

The spike route must render:

- Runtime platform
- User agent
- Whether Phantom injected provider exists
- Whether Wallet Standard registry exists
- Registered wallet names
- MWA registration status
- ConnectorKit discovered wallets
- Connect button
- Disconnect button
- Sign test button
- Reject/cancel test instructions
- Last error class/name/code/message
- Connected address
- Raw debug JSON block

Minimum UI actions:

```txt
1. Register mobile wallet standard
2. List wallets
3. Connect first supported Solana wallet
4. Connect selected wallet by name
5. Sign fixture transaction or sign supported test payload
6. Disconnect
7. Clear local connector state if available
```

The sign fixture **must** exercise real transaction signing, not message signing. Message signing would leave the production code path unproven and move the real failure discovery into Task 7 where rollback is expensive.

**Critical: prove the signer accepts bytes-from-server, not just kit-constructed transactions.** ConnectorKit exposes signer abstractions like `useTransactionSigner()` returning `TransactionSigner` and `useKitTransactionSigner()` returning `TransactionModifyingSigner` that operate at the `@solana/kit` transaction-message level, not raw bytes. Our production server delivers base64 v0 wire transactions built by `SolanaExecutionPreparationAdapter`; the spike must prove the full chain works end-to-end:

```
server base64 → Uint8Array → @solana/kit `getTransactionDecoder().decode(bytes)` → signer → re-serialize → base64
```

The decoded `Transaction` object from `@solana/kit` may or may not be the same shape ConnectorKit's signers expect. Possibilities and spike proofs:

- **If ConnectorKit's signer accepts a pre-decoded kit `Transaction`**: this is the happy path. Spike prints the base64 round-trip as proof.
- **If ConnectorKit's signer only accepts a kit `TransactionMessage` (pre-compile)**: we'd need to recompile the server's already-compiled v0 transaction, which requires decomposing it back to a message — possible but awkward. Spike documents the workaround and Task 7 inherits it.
- **If ConnectorKit's signer only accepts wallet-standard-native `SolanaSignTransaction` feature bytes**: bytes-in/bytes-out works directly. Spike uses that path.

**The spike UI must render the output base64 alongside the input base64, plus the derived signature**, so a reviewer can confirm the round-trip happened without trusting "no error" as success.

If the chain doesn't work cleanly, record the specific shape mismatch in the decision note under "Signing path — architecture adjustments needed" and surface it as a design issue for Task 7 *before* committing to ConnectorKit.

Use one of:

- A devnet no-op v0 transaction (single `SystemProgram.transfer` of 0 lamports to self) constructed in-route. Signs fine, broadcasts fine if the user wants to confirm, does nothing on-chain. **Preferred.**
- The existing valid v0 transaction fixture from `apps/app/src/platform/browserWallet.test.ts` (does not broadcast; tests serialization + signing round-trip only).

Explicitly prohibited:

- Message signing (`signMessage`) as the sole proof. A message-sign pass with a transaction-sign fail is exactly the gap that wastes Task 7. If the chosen library only exposes message signing, that is itself a reason to reject it.

Record the signed transaction's signature in the spike UI (raw base64 or explorer-pastable signature) so a reviewer can confirm the sign actually happened end-to-end.

## Task 0.5: Deploy spike preview

- [ ] Push branch.
- [ ] Deploy Cloudflare Pages preview.
- [ ] Open `/spike-wallet`.

Do not test only on localhost. Phantom mobile behavior on localhost is not enough for production confidence.

## Task 0.6: Test ConnectorKit on real devices

Record results in:

```txt
docs/superpowers/notes/2026-04-24-browser-wallet-connector-selection.md
```

Matrix:

| Device / browser | Expected |
|---|---|
| iOS Phantom in-app browser | Wallet discovered, connect works, sign works |
| Android Phantom in-app browser | Wallet discovered, connect works, sign works |
| Android Chrome browser with wallet installed | Installed-wallet/MWA option appears, connect works |
| Android Chrome-installed PWA | Installed-wallet/MWA option appears, connect works |
| Desktop Chrome + Phantom extension | Wallet discovered, connect works, sign works |
| iOS Safari | No false MWA promise; fallback UI needed |
| Android Firefox/Brave/Opera | No false MWA promise; fallback UI needed |

For each, record:

```md
### [Surface]

- Date:
- Device:
- OS:
- Browser/wallet version:
- Registered wallets before action:
- Connect outcome:
- Sign outcome:
- Disconnect outcome:
- Rejection/cancel error class:
- Rejection/cancel error name:
- Rejection/cancel error code:
- Rejection/cancel error message:
- Notes:
```

## Task 0.7: Decide library path

Decision rules:

- Choose **ConnectorKit** only if it passes Phantom mobile, desktop extension, Android Chrome, Android Chrome PWA *and* produces a verifiable transaction signature (base64 or explorer-pastable) on each of those surfaces. Connect-only passes do not qualify.
- Choose **Direct Wallet Standard** if ConnectorKit fails but Wallet Standard primitives with explicit `registerMwa()` pass the same transaction-signing bar.
- Choose **Wallet Adapter** if both standards-first paths fail.
- Choose **Phantom SDK rescue** only for a targeted Phantom-only branch, never as the universal browser wallet solution.

If the spike's transaction signing fails on any required surface, capture the raw error (class, name, code, message) in the decision note and either:
1. Try the next fallback before committing to it (do not rubber-stamp), or
2. If time-constrained, document the gap and land the plan as "partial — needs follow-up spike for \<surface\>" rather than falsely claiming full coverage.

Append:

```md
## Decision

Chosen path: [ConnectorKit | Direct Wallet Standard | Wallet Adapter | Phantom SDK rescue]

Why:
- ...

Rejected paths:
- ...

Version pins:
- ...

Known risks:
- ...
```

Commit the decision note to the migration branch (`feat/browser-wallet-connector-migration` or whatever Task 1 uses), **not to `main`**. Partial evidence shouldn't land on `main` ahead of the full migration. The note travels with the PR and merges when the migration merges. Delete the `spike/connectorkit-wallet-probe` branch once the note is captured; do not commit spike route code unless intentionally keeping a debug route behind a dev-only guard in the migration branch.

---

# Task 1: Lock dependency versions

**Files:**

```txt
apps/app/package.json
pnpm-lock.yaml
docs/superpowers/notes/2026-04-24-browser-wallet-connector-selection.md
```

- [ ] Install only the chosen path packages.
- [ ] Remove spike-only failed path packages.
- [ ] Pin versions in the decision note.
- [ ] Run:

```bash
pnpm --filter @clmm/app typecheck 2>&1 | head -50
pnpm --filter @clmm/app test 2>&1 | tail -40
```

Expected: no new failures beyond known baseline.

Commit:

```bash
git add apps/app/package.json pnpm-lock.yaml docs/superpowers/notes/2026-04-24-browser-wallet-connector-selection.md
git commit -m "chore(app): add selected browser wallet connector dependencies"
```

---

# Task 2: Create browser wallet abstraction skeleton

**Files:**

```txt
apps/app/src/platform/browserWallet/browserWalletTypes.ts
apps/app/src/platform/browserWallet/base64Bytes.ts
apps/app/src/platform/browserWallet/index.ts
```

Create stable app-facing types:

```ts
export type BrowserWalletAccount = {
  address: string;
  label?: string;
  walletName?: string;
};

export type BrowserWalletConnectResult = {
  address: string;
  walletName?: string;
};

export type BrowserWalletSignInput = {
  serializedPayloadBase64: string;
};

export type BrowserWalletSignResult = {
  signedPayloadBase64: string;
};
```

Create base64 helpers:

```ts
export function base64ToBytes(value: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }

  return Uint8Array.from(Buffer.from(value, 'base64'));
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = '';
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }

  return Buffer.from(bytes).toString('base64');
}
```

Barrel export — **must use platform-aware re-exports only**:

```ts
// index.ts
export * from './browserWalletTypes';
export * from './base64Bytes';
export * from './useBrowserWalletConnect';
export * from './useBrowserWalletSign';
export * from './useBrowserWalletDisconnect';
export * from './BrowserWalletProvider';
```

**Hard rule:** `index.ts` must **not** re-export anything from a `.web.ts` / `.web.tsx` module. Only re-export from files whose names are platform-agnostic (`foo.ts`) or whose Metro/Expo resolution handles both platforms (e.g., a module with sibling `.web.tsx` and `.native.tsx` is fine — a module named `connectorKitAdapter.web.ts` with no `.native.ts` twin is not). If something is web-only, import it *from the web-only provider module*, not through the barrel.

Commit:

```bash
git add apps/app/src/platform/browserWallet/
git commit -m "feat(app): add stable browser wallet abstraction types"
```

---

# Task 3: Implement `BrowserWalletProvider`

**Files:**

```txt
apps/app/src/platform/browserWallet/BrowserWalletProvider.web.tsx
apps/app/src/platform/browserWallet/BrowserWalletProvider.native.tsx
apps/app/app/_layout.tsx
```

## Web provider responsibilities

- Register MWA in `useEffect`.
- Mount the chosen ConnectorKit provider if required.
- Avoid static `window` access.
- Avoid importing web-only wallet packages from native.
- Preserve existing app providers.

## Expo web bundling split (required)

`@solana-mobile/wallet-standard-mobile` and `@solana/connector` contain web-only code paths that must not reach the native bundle. Guardrails:

1. **Pair every `.web.tsx` / `.web.ts` module with a `.native.tsx` / `.native.ts` stub.** Metro's default resolver picks the right one per platform. The stub must not import the web package.
2. **Barrel exports must not re-export web-only modules directly** (see Task 2's barrel rule).
3. **No dynamic `import()` of web packages from shared code.** A dynamic import from `mobileWalletRegistration.native.ts` (even behind a runtime `Platform.OS === 'web'` check) still causes Metro to attempt resolution during bundling.
4. **Verify web-only packages don't leak into the native import graph.** `pnpm --filter @clmm/app build` invokes `expo export` and only bundles the platform(s) you pass; it does not by itself prove native-side isolation. Use these three checks together:

   a. **Static import audit.** No cross-platform module may import web packages at top level:

   ```bash
   # From repo root. Expect: only .web.ts / .web.tsx files in results.
   rg -l "@solana/connector|@solana-mobile/wallet-standard-mobile|@wallet-standard/(app|react-core)|@solana/react" \
     apps/app/src apps/app/app | grep -vE "\.(web|test)\.(ts|tsx)$" || echo "OK: no leakage found"
   ```

   If a non-`.web` file appears in the output, the split is broken — fix the import.

   b. **Native typecheck.** TypeScript resolves `.native.ts` under Metro rules; a stray web import from shared code will surface as a type error:

   ```bash
   pnpm --filter @clmm/app typecheck 2>&1 | tail -30
   ```

   Expect same baseline errors as `main`; no new errors referencing `@solana/connector` etc.

   c. **Explicit native bundle export** (only if a native build exists in this branch):

   ```bash
   pnpm --filter @clmm/app exec expo export --platform android --output-dir /tmp/native-bundle-check
   rg "@solana/connector|@solana-mobile/wallet-standard-mobile" /tmp/native-bundle-check || echo "OK"
   rm -rf /tmp/native-bundle-check
   ```

   If the native bundle text contains any of those strings, the split leaked. If no native build is possible from this branch (web-only change), skip (c) and rely on (a) + (b).

5. **Hoist `@solana/web3.js` conditional usage behind the adapter layer.** If the chosen library pulls web3.js v1 only on web, don't let it leak into native by way of a shared utility.

Sketch:

```tsx
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { registerMobileWalletStandard } from './mobileWalletRegistration';

export function BrowserWalletProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    registerMobileWalletStandard().catch((error) => {
      console.warn('MWA registration failed', error);
    });
  }, []);

  return (
    <ChosenConnectorProvider>
      {children}
    </ChosenConnectorProvider>
  );
}
```

Native stub:

```tsx
import type { ReactNode } from 'react';

export function BrowserWalletProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
```

Wrap root:

```tsx
<QueryClientProvider client={queryClient}>
  <BrowserWalletProvider>
    <Stack screenOptions={{ headerShown: false }} />
  </BrowserWalletProvider>
</QueryClientProvider>
```

Run:

```bash
pnpm --filter @clmm/app typecheck 2>&1 | head -50
pnpm --filter @clmm/app test 2>&1 | tail -40
```

Commit:

```bash
git add apps/app/src/platform/browserWallet/BrowserWalletProvider.* apps/app/app/_layout.tsx
git commit -m "feat(app): mount browser wallet provider at app root"
```

---

# Task 4: Write failing connect hook tests

**Files:**

```txt
apps/app/src/platform/browserWallet/useBrowserWalletConnect.test.ts
```

Test requirements:

- Returns connected account address on approval.
- Throws `No supported browser wallet detected on this device` when no eligible wallet exists.
- Preserves raw user rejection error for centralized mapping.
- Exposes `connecting`.
- Records wallet name if available.
- Does not touch native MWA path.

Pseudo-shape:

```ts
describe('useBrowserWalletConnect', () => {
  it('returns address on successful connect', async () => {});
  it('throws when no browser wallet is available', async () => {});
  it('throws raw rejection error when user cancels', async () => {});
  it('sets connecting while request is in flight', async () => {});
});
```

Run and confirm failure:

```bash
pnpm --filter @clmm/app test -- --run src/platform/browserWallet/useBrowserWalletConnect.test.ts
```

Expected: fail because hook is not implemented.

Commit optional failing test only if your workflow accepts red commits. Otherwise implement in same task pair.

---

# Task 5: Implement `useBrowserWalletConnect`

**Files:**

```txt
apps/app/src/platform/browserWallet/useBrowserWalletConnect.ts
apps/app/src/platform/browserWallet/connectorKitAdapter.web.ts
apps/app/src/platform/browserWallet/connectorKitAdapter.native.ts
```

Implementation rules:

- Use ConnectorKit only inside adapter module.
- Hook returns the stable local contract.
- Select only wallets/chains compatible with `solana:mainnet` and `solana:devnet` as configured.
- Do not inspect `window.phantom.solana` directly except as a diagnostic fallback in capability detection, not primary connection.
- Throw raw wallet errors so `walletConnection.ts` maps them centrally.
- Do not mutate `walletSessionStore` inside this hook. Call sites own app session state.
- **Bounded wait for MWA registration.** Before throwing "no wallet," poll the chosen library's wallet list every 100 ms up to **1500 ms** total. If the list populates during that window, proceed with connect. If the cap expires empty, throw the raw "no wallet" error. This is the hook-side half of the MWA registration-race strategy specified in Task 14; do not extend the cap or add retries without updating both places.

  **Wallet-list source depends on the library path chosen in Task 0:**
  - **ConnectorKit**: use the library's own discovered-wallets accessor (e.g., `useWallets()` hook or an imperative `connector.getWallets()` — verify exact API in Task 1).
  - **Direct Wallet Standard (Fallback A)**: use `getWallets()` from `@wallet-standard/app`, which returns an object with `.get(): readonly Wallet[]`. Do **not** reach for `navigator.wallets` — that's not the Wallet Standard API surface.

  Sketch (ConnectorKit shape; adjust import per Task 1 pin):

  ```ts
  import { getWallets } from '@wallet-standard/app'; // if direct Wallet Standard
  // or use the ConnectorKit hook/imperative API per Task 1

  async function waitForWallets(
    readWallets: () => readonly Wallet[],
    timeoutMs = 1500,
    pollMs = 100,
  ): Promise<readonly Wallet[]> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const wallets = readWallets();
      if (wallets.length > 0) return wallets;
      await new Promise((r) => setTimeout(r, pollMs));
    }
    return readWallets();
  }
  ```

  Add a hook test that stubs `readWallets` to return empty then populated after ~300 ms and asserts `connect()` waits and succeeds. Add a second test that asserts it throws within ~1600 ms when the stub stays empty.

Expected hook shape:

```ts
export function useBrowserWalletConnect() {
  const adapter = useSelectedBrowserWalletAdapter();

  const connect = useCallback(async (): Promise<string> => {
    const result = await adapter.connect();
    return result.address;
  }, [adapter]);

  return {
    connect,
    connecting: adapter.connecting,
    error: adapter.error,
  };
}
```

Run:

```bash
pnpm --filter @clmm/app test -- --run src/platform/browserWallet/useBrowserWalletConnect.test.ts
```

Expected: pass.

Commit:

```bash
git add apps/app/src/platform/browserWallet/useBrowserWalletConnect.ts apps/app/src/platform/browserWallet/connectorKitAdapter.* apps/app/src/platform/browserWallet/useBrowserWalletConnect.test.ts
git commit -m "feat(app): add connector-backed browser wallet connect hook"
```

---

# Task 6: Write failing sign hook tests

**Files:**

```txt
apps/app/src/platform/browserWallet/useBrowserWalletSign.test.ts
```

Requirements:

- Accepts base64 serialized transaction payload.
- Converts base64 to `Uint8Array`.
- Passes raw transaction bytes to chosen connector signing API where supported.
- Returns base64 signed wire transaction.
- Throws if no wallet account is connected.
- Preserves raw rejection/cancel errors.
- Does not deserialize input unless the chosen library requires an object form.
- If deserialization is required, isolate it in a tiny helper and document why.

Use the existing valid v0 transaction fixture from old browser wallet tests.

Pseudo-shape:

```ts
describe('useBrowserWalletSign', () => {
  it('passes payload bytes to the wallet signer and returns base64 signed payload', async () => {});
  it('throws when no wallet is connected', async () => {});
  it('preserves wallet rejection errors', async () => {});
});
```

Run and confirm failure:

```bash
pnpm --filter @clmm/app test -- --run src/platform/browserWallet/useBrowserWalletSign.test.ts
```

---

# Task 7: Implement `useBrowserWalletSign`

**Files:**

```txt
apps/app/src/platform/browserWallet/useBrowserWalletSign.ts
apps/app/src/platform/browserWallet/connectorKitAdapter.web.ts
apps/app/src/platform/browserWallet/base64Bytes.ts
```

Implementation rules:

- Input: base64 string from server.
- Output: base64 string to server.
- Prefer bytes-in/bytes-out signing if ConnectorKit supports it.
- If ConnectorKit requires `VersionedTransaction`, deserialize at adapter boundary only.
- Do not broadcast from wallet hook.
- Do not use `signAndSendTransaction`.
- Do not alter server DTO shape.
- Enforce signing path only; execution submission remains existing BFF flow.

Expected shape:

```ts
export function useBrowserWalletSign() {
  const adapter = useSelectedBrowserWalletAdapter();

  const sign = useCallback(
    async (serializedPayloadBase64: string): Promise<string> => {
      const payloadBytes = base64ToBytes(serializedPayloadBase64);
      const signedBytes = await adapter.signTransactionBytes(payloadBytes);
      return bytesToBase64(signedBytes);
    },
    [adapter],
  );

  return {
    sign,
    signing: adapter.signing,
  };
}
```

Run:

```bash
pnpm --filter @clmm/app test -- --run src/platform/browserWallet/useBrowserWalletSign.test.ts
```

Expected: pass.

Commit:

```bash
git add apps/app/src/platform/browserWallet/useBrowserWalletSign.ts apps/app/src/platform/browserWallet/base64Bytes.ts apps/app/src/platform/browserWallet/useBrowserWalletSign.test.ts
git commit -m "feat(app): add connector-backed browser wallet signing hook"
```

---

# Task 8: Write failing disconnect hook tests

**Files:**

```txt
apps/app/src/platform/browserWallet/useBrowserWalletDisconnect.test.ts
```

Requirements:

- Calls connector disconnect when connected.
- No-ops when no wallet is connected.
- Exposes `disconnecting`.
- Does not throw on best-effort disconnect failure unless call site asks for strict behavior.

Pseudo-shape:

```ts
describe('useBrowserWalletDisconnect', () => {
  it('disconnects connected browser wallet', async () => {});
  it('no-ops when no browser wallet is connected', async () => {});
});
```

Run and confirm failure.

---

# Task 9: Implement `useBrowserWalletDisconnect`

**Files:**

```txt
apps/app/src/platform/browserWallet/useBrowserWalletDisconnect.ts
apps/app/src/platform/browserWallet/connectorKitAdapter.web.ts
```

Expected shape:

```ts
export function useBrowserWalletDisconnect() {
  const adapter = useSelectedBrowserWalletAdapter();

  const disconnect = useCallback(async (): Promise<void> => {
    await adapter.disconnect();
  }, [adapter]);

  return {
    disconnect,
    disconnecting: adapter.disconnecting,
  };
}
```

Run:

```bash
pnpm --filter @clmm/app test -- --run src/platform/browserWallet/useBrowserWalletDisconnect.test.ts
```

Expected: pass.

Commit:

```bash
git add apps/app/src/platform/browserWallet/useBrowserWalletDisconnect.ts apps/app/src/platform/browserWallet/useBrowserWalletDisconnect.test.ts apps/app/src/platform/browserWallet/index.ts
git commit -m "feat(app): add connector-backed browser wallet disconnect hook"
```

---

# Task 10: Update wallet error mapping

**Files:**

```txt
apps/app/src/platform/walletConnection.ts
apps/app/src/platform/walletConnection.test.ts
docs/superpowers/notes/2026-04-24-browser-wallet-connector-selection.md
```

Use captured errors from Task 0.

Add matchers for:

- User rejected connect
- User rejected sign
- User closed approval sheet
- Wallet not found
- Wallet not ready
- Unsupported chain
- Feature unsupported
- Request already pending
- App not authorized
- Mobile wallet unavailable

Rules:

- Do not normalize inside hooks.
- Hooks throw raw errors.
- `walletConnection.ts` maps user-facing outcomes.

Run:

```bash
pnpm --filter @clmm/app test -- --run src/platform/walletConnection.test.ts
```

Commit:

```bash
git add apps/app/src/platform/walletConnection.ts apps/app/src/platform/walletConnection.test.ts docs/superpowers/notes/2026-04-24-browser-wallet-connector-selection.md
git commit -m "fix(app): map connector wallet errors to existing wallet outcomes"
```

---

# Task 11: Switch `connect.tsx` to local browser wallet hook

**Files:**

```txt
apps/app/app/connect.tsx
```

Remove imports from old injected-provider browser wallet module.

Add:

```ts
import { useBrowserWalletConnect } from '../src/platform/browserWallet';
```

Use:

```tsx
const browserConnect = useBrowserWalletConnect();

async function handleSelectWallet(kind: 'native' | 'browser') {
  beginConnection();

  try {
    const walletAddress =
      kind === 'browser'
        ? await browserConnect.connect()
        : await walletPlatform.connectNativeWallet();

    markConnected({ walletAddress, connectionKind: kind });

    enrollWalletForMonitoring(walletAddress).catch((err) => {
      console.warn('Wallet enrollment failed:', err);
    });

    navigateRoute({ router, path: '/(tabs)/positions', method: 'replace' });
  } catch (error) {
    handleConnectionError(error);
  }
}
```

Rules:

- Do not call old `connectBrowserWallet`.
- Do not call `readInjectedBrowserWalletWindow`.
- Do not import ConnectorKit in screen.
- Native path unchanged.

Run:

```bash
pnpm --filter @clmm/app test 2>&1 | tail -40
pnpm --filter @clmm/app typecheck 2>&1 | head -50
```

Commit:

```bash
git add apps/app/app/connect.tsx
git commit -m "feat(app): route browser connect through browser wallet abstraction"
```

---

# Task 12: Switch signing route to local browser wallet hook

**Files:**

```txt
apps/app/app/signing/[attemptId].tsx
```

Remove old imports:

```ts
readInjectedBrowserWalletWindow
signBrowserTransaction
```

Add:

```ts
import { useBrowserWalletSign } from '../../src/platform/browserWallet';
```

Use:

```tsx
const browserSigner = useBrowserWalletSign();

const signedPayload =
  connectionKind === 'browser'
    ? await browserSigner.sign(signingPayload.serializedPayload)
    : await signNativeTransaction({
        serializedPayload: signingPayload.serializedPayload,
        walletId: walletAddress,
      });
```

Rules:

- Do not broadcast in browser wallet hook.
- Do not alter server submit route.
- Do not change native signing.
- Existing attempt reconciliation stays untouched.
- Existing abandonment/cancel handling stays centralized.

Run:

```bash
pnpm --filter @clmm/app test 2>&1 | tail -40
pnpm --filter @clmm/app typecheck 2>&1 | head -50
```

Commit:

```bash
git add apps/app/app/signing/\[attemptId\].tsx
git commit -m "feat(app): route browser signing through browser wallet abstraction"
```

---

# Task 13: Switch wallet tab disconnect to local browser wallet hook

**Files:**

```txt
apps/app/app/(tabs)/wallet.tsx
```

Remove old imports:

```ts
disconnectBrowserWallet
readInjectedBrowserWalletWindow
```

Add:

```ts
import { useBrowserWalletDisconnect } from '../../src/platform/browserWallet';
```

Use:

```tsx
const browserDisconnect = useBrowserWalletDisconnect();

if (connectionKind === 'browser') {
  try {
    await browserDisconnect.disconnect();
  } catch {
    // Best-effort. App session cleanup still proceeds.
  }
}
```

Rules:

- App state clears even if wallet disconnect fails.
- Native path unchanged.

Run tests and typecheck.

Commit:

```bash
git add apps/app/app/\(tabs\)/wallet.tsx
git commit -m "feat(app): route browser disconnect through browser wallet abstraction"
```

---

# Task 14: Update browser wallet capability detection

**Files:**

```txt
packages/adapters/src/outbound/capabilities/WebPlatformCapabilityAdapter.ts
packages/adapters/src/outbound/capabilities/WebPlatformCapabilityAdapter.test.ts
```

Purpose:

The adapter decides whether to show browser wallet affordances. With Wallet Standard and MWA, registration can be async. With regular mobile browsers, a blanket `true` creates false promises. Use layered detection.

### MWA registration race — explicit strategy

The registration race is real: `registerMwa()` runs in `BrowserWalletProvider`'s `useEffect`, while `WebPlatformCapabilityAdapter.getCapabilities()` is a synchronous port call that may run before registration completes. Chosen resolution:

**On the adapter side (synchronous, best-effort):**
- Return `browserWalletAvailable: true` when any of: Wallet Standard registry non-empty, legacy injected provider present, *or* user is on Android-Chrome-like UA (MWA registration is plausible and incoming).
- Return `false` on iOS Safari, Android non-Chrome, or desktop with no extension — these environments will never gain a wallet at runtime.

**On the hook side (handles the race at use-time):**
- `useBrowserWalletConnect().connect()` waits briefly for the Wallet Standard registry to populate before throwing "no wallet." Cap the wait at **1500 ms** (Android MWA registration typically resolves in under 300 ms; 1500 ms is safe headroom without feeling stuck).
- Implementation: poll the library's wallet-list accessor (ConnectorKit's `useWallets()`/`getWallets()` equivalent, or `getWallets().get()` from `@wallet-standard/app` on Fallback A) every 100 ms up to the cap. Stop on first non-zero read. If the cap expires with zero wallets, throw.
- No late-connect waiter, no event listener, no 60-second waits. The cap must be short enough that a real "no wallet" case fails fast.

This scopes the optimism to environments where MWA is plausibly incoming (Android Chrome family), avoids the blanket-`true` problem on iOS Safari, and gives the hook a bounded window to let registration complete before surfacing a hard error.

Detection order (sync, capability adapter):

1. Wallet Standard registry has Solana wallet.
2. ConnectorKit-discovered wallet if synchronously accessible.
3. Legacy injected provider exists as fallback signal.
4. Android Chrome-like environment where MWA registration is plausible.
5. Else false.

Implementation sketch:

```ts
// Wallet Standard discovery is via `getWallets()` from `@wallet-standard/app`, not
// `navigator.wallets`. Keep the import behind a dynamic boundary so native bundles
// don't pull it.
async function hasWalletStandardWallet(): Promise<boolean> {
  try {
    if (typeof window === 'undefined') return false;
    const { getWallets } = await import('@wallet-standard/app');
    return getWallets().get().length > 0;
  } catch {
    return false;
  }
}
```

Note: `getCapabilities()` is already async, so the `await` is free. If the chosen library is ConnectorKit, substitute ConnectorKit's own wallet-list accessor and remove the direct `@wallet-standard/app` import.

function hasLegacyInjectedSolanaProvider(): boolean {
  try {
    const win = globalThis as unknown as Record<string, unknown>;
    const phantom = win['phantom'] as { solana?: Record<string, unknown> } | undefined;
    if (typeof phantom?.solana?.['connect'] === 'function') return true;

    const solana = win['solana'] as Record<string, unknown> | undefined;
    if (typeof solana?.['connect'] === 'function') return true;

    return false;
  } catch {
    return false;
  }
}

function isAndroidChromeLike(): boolean {
  try {
    const ua = globalThis.navigator?.userAgent ?? '';
    return /Android/i.test(ua) && /Chrome/i.test(ua) && !/Edg|OPR|Firefox|Brave/i.test(ua);
  } catch {
    return false;
  }
}
```

Tests:

- Detects Wallet Standard registry.
- Falls back to Phantom injected provider.
- Returns true for Android Chrome MWA-plausible surface.
- Returns false on iOS Safari without injected wallet.
- Returns false on Android Firefox/Brave/Opera without injected wallet.
- Returns false on desktop browser without wallet.

Run:

```bash
pnpm --filter @clmm/adapters test -- --run src/outbound/capabilities/WebPlatformCapabilityAdapter.test.ts
```

Commit:

```bash
git add packages/adapters/src/outbound/capabilities/WebPlatformCapabilityAdapter.ts packages/adapters/src/outbound/capabilities/WebPlatformCapabilityAdapter.test.ts
git commit -m "refactor(adapters): detect browser wallet capability via standard registry and mobile wallet signals"
```

---

# Task 15: Update mobile web navigation detection

**Files:**

```txt
apps/app/src/platform/webNavigation.ts
apps/app/src/platform/webNavigation.test.ts
```

Purpose:

`isSolanaMobileWebView` decides whether to hard-nav or SPA-nav. Keep wallet-presence as a discriminator. Do not use UA-only detection.

Detection must accept:

- Wallet Standard registry wallet
- Legacy injected provider
- Known Phantom/Solflare mobile wallet browser signal if present

Detection must reject:

- Plain iOS Safari with no wallet
- Plain Android Chrome with no injected wallet when the question is wallet webview specifically
- Social-app webviews unless wallet signal exists

Add a separate helper if needed:

```ts
export function hasBrowserWalletPresence(): boolean
```

Tests:

- iPhone + Wallet Standard wallet => true
- iPhone + Phantom injected provider => true
- iPhone Safari + no wallet => false
- Android Phantom browser + injected provider => true
- Android Chrome + no wallet => false for wallet-webview detection
- Desktop Phantom extension + injected provider => false if function is specifically mobile webview

Run:

```bash
pnpm --filter @clmm/app test -- --run src/platform/webNavigation.test.ts
```

Commit:

```bash
git add apps/app/src/platform/webNavigation.ts apps/app/src/platform/webNavigation.test.ts
git commit -m "refactor(app): detect mobile wallet webview using wallet presence signals"
```

---

# Task 16: Add wallet browser fallback links

**Files:**

```txt
apps/app/src/platform/browserWallet/walletDeepLinks.ts
apps/app/src/platform/browserWallet/walletDeepLinks.test.ts
apps/app/app/connect.tsx
```

Create explicit user-tap actions for:

- Open in Phantom
- Open in Solflare
- Open in browser (for social-app embedded webviews)

Implementation:

```ts
export function buildPhantomBrowseUrl(currentUrl: string): string {
  return `https://phantom.app/ul/v1/browse/${encodeURIComponent(currentUrl)}`;
}

export function buildSolflareBrowseUrl(currentUrl: string): string {
  const encodedUrl = encodeURIComponent(currentUrl);
  const encodedRef = encodeURIComponent(new URL(currentUrl).origin);
  return `https://solflare.com/ul/v1/browse/${encodedUrl}?ref=${encodedRef}`;
}

// Social-app webview detection — UA-based, imperfect but actionable.
const SOCIAL_WEBVIEW_UA_PATTERNS = [
  /FBAN|FBAV|FB_IAB/i,   // Facebook in-app browser
  /Instagram/i,           // Instagram in-app browser
  /Twitter/i,             // Twitter in-app browser (includes X)
  /TikTok|musical_ly/i,   // TikTok in-app browser
  /LinkedIn/i,            // LinkedIn in-app browser
  /Line\//i,              // LINE in-app browser
];

export function isSocialAppWebView(userAgent: string): boolean {
  return SOCIAL_WEBVIEW_UA_PATTERNS.some((re) => re.test(userAgent));
}
```

### UI state machine — when fallback links appear

`connect.tsx` must show one of three UI states, decided from capability + failure state:

| State | Condition | UI |
|---|---|---|
| **Primary** | `browserWalletAvailable` true AND no connect error yet | Existing "Connect Browser Wallet" / "Use Installed Wallet" buttons |
| **Wallet fallback** | `browserWalletAvailable` false on a mobile UA, OR connect threw "no wallet" after the 1500 ms wait | Show "Open in Phantom" + "Open in Solflare" buttons below the primary buttons. Primary buttons stay visible (user may have installed after page load). Copy: *"No wallet detected. Open this page in a Solana wallet browser to continue."* |
| **Social-webview escape hatch** | `isSocialAppWebView(navigator.userAgent)` true | Replace primary buttons with a single "Open in Browser" button + instructions. Copy: *"Wallet connections don't work reliably in \<app\>'s in-app browser. Tap Open in Browser to continue in Safari/Chrome."* The "Open in Phantom/Solflare" fallback is additionally shown below. |

### Rules

- Do not auto-redirect on page load.
- Only navigate after explicit user tap.
- Preserve current route in browse URL (use `window.location.href` as the argument so the user returns to the same page inside the wallet browser).
- Social-webview detection is UA-based and imperfect — a UA miss is recoverable (user sees Primary state and manually hits fallback); a UA false positive is worse (blocks a functional flow). Prefer conservative matchers.
- **"Open in Browser" is best-effort, not a guaranteed escape hatch.** The URL schemes that escape social-app webviews (`intent://` with `;end` suffix on Android Chrome, `x-safari-https://` on iOS Safari) work in some apps and versions but are unreliable across the whole matrix — Instagram and TikTok have historically blocked or transformed these. Design the helper to try the best scheme for the detected UA, then *always* surface copy-to-clipboard + visible instructional copy as a guaranteed fallback:

  ```ts
  export async function openInExternalBrowser(currentUrl: string): Promise<'attempted' | 'copy-only'> {
    const ua = navigator.userAgent;
    const url = currentUrl;

    // Best-effort scheme — no guarantees.
    if (/Android/i.test(ua)) {
      // intent:// scheme — works in some Android in-app browsers.
      const intentUrl = `intent://${url.replace(/^https?:\/\//, '')}#Intent;scheme=https;end`;
      window.location.href = intentUrl;
      return 'attempted';
    }
    if (/iPhone|iPad/i.test(ua)) {
      // x-safari-https:// — works in some iOS contexts.
      window.location.href = `x-safari-${url.replace(/^http/, 'http')}`;
      return 'attempted';
    }
    return 'copy-only';
  }
  ```

  Regardless of `openInExternalBrowser` return value, always show copy-URL + instructions:

  > *"If this doesn't open in your browser, copy the link and paste it into Safari or Chrome."*

  Do not promise the escape hatch works. The instructions are the guaranteed path; the scheme attempt is a nice-to-have.

Tests:

- Phantom URL encodes current URL.
- Solflare URL encodes current URL and origin ref.
- Invalid URL handled safely.
- `isSocialAppWebView` returns true for representative Facebook, Instagram, Twitter/X, TikTok, LinkedIn, and LINE UAs.
- `isSocialAppWebView` returns false for Safari iOS 17, Chrome Android, Phantom mobile browser UAs.
- Connect screen state-machine tests: Primary / Wallet fallback / Social-webview escape hatch render the correct affordances given `browserWalletAvailable`, connect error, and UA stubs.

Run tests.

Commit:

```bash
git add apps/app/src/platform/browserWallet/walletDeepLinks.ts apps/app/src/platform/browserWallet/walletDeepLinks.test.ts apps/app/app/connect.tsx
git commit -m "feat(app): add explicit wallet browser fallback links"
```

---

# Task 17: Manual E2E validation

This is the real release gate. No cleanup before this passes.

**Files:**

```txt
docs/superpowers/notes/2026-04-24-browser-wallet-connector-selection.md
```

Deploy Cloudflare preview and test:

## 17.1 Phantom mobile in-app browser

- [ ] Fresh trust state / remove connected app.
- [ ] Open preview inside Phantom.
- [ ] Connect.
- [ ] Approve.
- [ ] Confirm address.
- [ ] Run execution preview.
- [ ] Sign transaction.
- [ ] Confirm attempt advances past `awaiting-signature`.
- [ ] Reject signing once and verify correct abandoned/cancel outcome.
- [ ] Disconnect.

## 17.2 Android Chrome browser

- [ ] Install supported Solana wallet.
- [ ] Open preview in Chrome.
- [ ] Confirm MWA / installed-wallet path appears.
- [ ] Connect.
- [ ] Sign.
- [ ] Reject signing once and verify mapping.
- [ ] Disconnect.

## 17.3 Android Chrome-installed PWA

- [ ] Install PWA from Chrome.
- [ ] Open installed PWA.
- [ ] Confirm MWA / installed-wallet path appears.
- [ ] Connect.
- [ ] Sign.
- [ ] Disconnect.

## 17.4 Desktop Chrome + Phantom extension

- [ ] Connect.
- [ ] Sign.
- [ ] Reject signing once.
- [ ] Disconnect.

## 17.5 Native Expo app regression

- [ ] Run native app build.
- [ ] Connect via existing native MWA path.
- [ ] Sign via existing native MWA path.
- [ ] Confirm no regression.

## 17.6 Unsupported surfaces

- [ ] iOS Safari regular browser shows fallback, not false MWA promise.
- [ ] Android Firefox/Brave/Opera shows fallback, not false MWA promise.
- [ ] Social-app in-app browser shows open-in-browser / open-in-wallet fallback.

Append record:

```md
## E2E Validation

| Surface | Connect | Sign | Reject mapping | Disconnect | Notes |
|---|---|---|---|---|---|
| iOS Phantom browser | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL | |
| Android Phantom browser | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL | |
| Android Chrome | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL | |
| Android Chrome PWA | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL | |
| Desktop Phantom | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL | |
| Native Expo MWA | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL | |
```

Commit:

```bash
git add docs/superpowers/notes/2026-04-24-browser-wallet-connector-selection.md
git commit -m "docs: record browser wallet real-device validation"
```

---

# Task 18: Delete dead injected-provider code

Only after Task 17 passes.

**Files:**

```txt
apps/app/src/platform/browserWallet.ts
apps/app/src/platform/browserWallet.test.ts
```

Find importers:

```bash
rg -n "browserWallet|readInjectedBrowserWalletWindow|connectBrowserWallet|signBrowserTransaction|disconnectBrowserWallet" apps packages
```

Expected:

- No call-site imports remain.
- Only new folder `src/platform/browserWallet/` remains.

Delete old files:

```bash
git rm apps/app/src/platform/browserWallet.ts apps/app/src/platform/browserWallet.test.ts
```

If a tiny helper is still needed, create a narrowly named module:

```txt
apps/app/src/platform/solanaTransactionSerialization.ts
```

Do not keep old injected-provider code as shims.

Run:

```bash
pnpm --filter @clmm/app test 2>&1 | tail -40
pnpm --filter @clmm/app typecheck 2>&1 | head -50
```

Commit:

```bash
git add -A
git commit -m "chore(app): remove legacy injected-provider browser wallet implementation"
```

---

# Task 19: Write solution document

**Files:**

```txt
docs/solutions/integration-issues/phantom-mobile-injected-provider-migrated-to-connectorkit-wallet-standard-2026-04-24.md
```

Document:

## Problem

The DIY injected-provider browser wallet path broke on Phantom mobile because it depended on implicit behavior from:

- `window.phantom.solana`
- `window.solana`
- `provider.connect()`
- `provider.on('connect')`
- `provider.publicKey`
- 4100 late approval behavior

Each patch addressed symptoms, not the contract failure.

## Root cause

The app targeted wallet-specific injected-provider behavior directly instead of the maintained standards layer. Phantom desktop and Phantom mobile do not behave identically enough for this to be safe.

## Failed approaches

- Prefer `window.phantom.solana` over `window.solana`
- Wait for `connect` event after late approval
- Poll `publicKey`
- Treat 4100 as recoverable with local waiting
- Patch more Phantom-specific behavior into app screens

## Final approach

- Use a ConnectorKit-first, Wallet Standard-aligned abstraction.
- Explicitly register Solana Mobile Wallet Standard for Android Chrome/PWA.
- Preserve native MWA path.
- Preserve server transaction DTO.
- Hide wallet library behind app-local hooks.
- Add explicit wallet-browser fallback links.

## Prevention

- Do not target injected wallet providers directly when Wallet Standard or MWA exists.
- Do not patch the same integration failure more than three times without questioning architecture.
- Keep wallet-library types out of screens.
- Real-device mobile wallet E2E is mandatory before cleanup.
- Android Chrome/PWA support must be tested separately from wallet in-app browser support.

Commit:

```bash
git add docs/solutions/integration-issues/phantom-mobile-injected-provider-migrated-to-connectorkit-wallet-standard-2026-04-24.md
git commit -m "docs(solutions): record browser wallet migration to connector standards"
```

---

# Task 20: Final repo-wide checks

Run:

```bash
pnpm test 2>&1 | tail -40
pnpm typecheck 2>&1 | tail -40
pnpm lint 2>&1 | tail -40
pnpm boundaries 2>&1 | tail -40
```

Known baseline TypeScript errors are acceptable only if they predate this branch and are documented. New errors are not acceptable.

Verify native path untouched:

```bash
rg -n "connectNativeWallet|signNativeTransaction|mobile-wallet-adapter-protocol-kit" apps packages
```

Verify old injected-provider assumptions are gone:

```bash
rg -n "readInjectedBrowserWalletWindow|connectBrowserWallet|signBrowserTransaction|disconnectBrowserWallet|provider\.publicKey|provider\.on\('connect'\)|4100" apps packages
```

Expected:

- No old browser wallet implementation references.
- No Phantom-specific lifecycle waiters.
- No direct screen-level wallet-provider calls.

---

# PR Description Template

```md
## Summary

Migrates browser wallet integration away from DIY injected-provider handling to a ConnectorKit-first / Wallet Standard-aligned browser wallet abstraction with explicit Solana Mobile Wallet Standard registration for Android Chrome and Chrome-installed PWAs.

## Why

The previous injected-provider path failed on Phantom mobile due to wallet-specific lifecycle differences. Repeated narrow patches created more complexity without establishing a reliable contract.

## Architecture

- Browser wallet implementation is hidden behind:
  - `useBrowserWalletConnect`
  - `useBrowserWalletSign`
  - `useBrowserWalletDisconnect`
  - `BrowserWalletProvider`
- Native MWA path unchanged.
- Server transaction DTO unchanged.
- Base64 v0 transaction wire format preserved.
- MWA registration is web-only and client-only.
- Wallet browser fallback links added for unsupported mobile browsers.

## Validation

| Surface | Result |
|---|---|
| iOS Phantom browser | PASS/FAIL |
| Android Phantom browser | PASS/FAIL |
| Android Chrome | PASS/FAIL |
| Android Chrome PWA | PASS/FAIL |
| Desktop Phantom extension | PASS/FAIL |
| Native Expo MWA | PASS/FAIL |
| iOS Safari fallback | PASS/FAIL |
| Android non-Chrome fallback | PASS/FAIL |
| Social-app webview fallback | PASS/FAIL |

## Risk

ConnectorKit is newer than wallet-adapter. Risk is mitigated by:
- Spike gate before migration
- Local app abstraction
- Direct Wallet Standard fallback
- Wallet Adapter fallback
- Real-device matrix

## Rollback

Revert call-site migration commits:
- connect route
- signing route
- wallet disconnect route

Provider and hook files can remain dormant if unused.
```

---

# Rollback Plan

If production migration fails after Task 17:

1. Revert Task 11, Task 12, and Task 13 commits.
2. Restore old `browserWallet.ts` from pre-migration branch.
3. Keep decision docs.
4. Keep spike findings.
5. Do not reattempt another patch without new real-device debug evidence.

Rollback restores prior browser behavior but does not solve Phantom mobile. Treat rollback as damage control, not a fix.

---

# Out of Scope

- Changing native Expo MWA implementation.
- Changing BFF signing payload DTO.
- Changing execution attempt lifecycle.
- Changing receipt program behavior.
- Introducing WalletConnect/Reown as primary path.
- Adding social login / embedded wallets.
- Supporting Slope or Sollet as launch-critical targets.
- Removing all `@solana/web3.js` usage.
- Redesigning wallet UX beyond required fallback buttons.

---

# Implementation Order Summary

1. Connector selection spike.
2. Real-device evidence.
3. Dependency lock.
4. Local abstraction skeleton.
5. Provider root wiring.
6. Connect hook.
7. Sign hook.
8. Disconnect hook.
9. Error mapping.
10. Screen call-site migration.
11. Capability detection.
12. Web navigation detection.
13. Fallback wallet browser links.
14. Full real-device E2E.
15. Delete old injected-provider code.
16. Solution doc.
17. Repo-wide checks.

The main discipline: **prove mobile behavior first, then migrate.** Anything else repeats the previous failure mode.

---

# Amendments log

- **2026-04-24** — Initial plan (GPT, superseding the `wallet-standard-migration` plan with broader scope + ConnectorKit primary).
- **2026-04-24 (post-review)** — Amendments applied:
  - **Added "Why ConnectorKit-first despite v0.x"** to the Strategic Decision section. Five-point rationale: built-in MWA registration, headless fits custom UI, kit+web3.js dual support, single integration surface, debugger in dev. Re-confirmation required in Task 0 decision note after spike evidence.
  - **Task 0 decision note now requires a "Why ConnectorKit" section** authored before running the spike, so the rationale is defended against the library's pre-1.0 version before commitment.
  - **Task 0 spike now requires transaction signing, not message signing.** Devnet no-op v0 tx preferred; explicit prohibition on message-signing-only passes. Verifiable signature must appear in the spike UI.
  - **Task 0 decision rules** updated: "connect + sign + disconnect" + verifiable signature on each required surface. Partial passes must be recorded as "partial — needs follow-up spike," never claimed as full coverage.
  - **Task 2 / Task 3 — Expo web bundling split guardrails.** `.web.ts` modules must be paired with `.native.ts` stubs; barrel must not re-export web-only modules; no dynamic imports of web packages from shared code; `pnpm build` output must be inspected for leakage of `@solana-mobile/wallet-standard-mobile` / `@solana/connector` into the native bundle.
  - **Task 14 — MWA registration race, explicit strategy.** Adapter returns `true` optimistically on Android-Chrome-like UAs. Hook (Task 5) handles the race with a bounded 1500 ms poll (100 ms cadence) of the Wallet Standard registry before throwing "no wallet." Cap is load-bearing; do not extend without updating both sites.
  - **Task 16 — fallback link UI state machine + social-webview handling.** Three explicit UI states (Primary / Wallet fallback / Social-webview escape hatch) with conditions and copy. `isSocialAppWebView()` UA matcher for Facebook, Instagram, Twitter/X, TikTok, LinkedIn, LINE. Social webview shows an "Open in Browser" action plus the wallet fallback.
  - **Task 16 — test coverage extended** to cover `isSocialAppWebView` positives/negatives and the connect-screen state machine.

All amendments preserve GPT's ConnectorKit-first ordering and the hooks-only architecture rule.

- **2026-04-24 (second review)** — GPT + GLM second-pass feedback applied:
  - **MWA registration ownership decided before code.** Task 0.3 now starts with a question: does ConnectorKit register MWA internally? Three branches (it does / it doesn't / unclear with wallet-count diff). Manual registration module only written if needed; deleted rather than left dormant if ConnectorKit owns it. Resolves the ConnectorKit-wraps-MWA-vs-manual-register contradiction.
  - **App identity aligned with native** — `'CLMM V2'` (matches `apps/app/src/platform/nativeWallet.ts` `APP_IDENTITY.name`) instead of the earlier `'CLMM Autopilot'` inconsistency.
  - **`navigator.wallets` references replaced** with the actual Wallet Standard API (`getWallets()` from `@wallet-standard/app` with `.get()`), or the ConnectorKit wallet-list accessor. Updated in Task 5 (connect hook), Task 14 (capability adapter), Task 15 (webNavigation notes).
  - **Native bundle verification** no longer relies solely on `expo export` — now a three-part check: static import audit (`rg` across shared code), native typecheck, and optional explicit `expo export --platform android` scan if a native build exists in the branch.
  - **Spike decision note commits to the migration branch**, not `main`. Merges with the migration PR; spike branch deleted after evidence capture.
  - **Open-in-browser escape hatch is best-effort with guaranteed fallback.** `intent://` on Android + `x-safari-https://` on iOS attempted, but copy-URL + instructional copy are the load-bearing path — no promises that the scheme succeeds.
  - **GLM's signer-shape risk flagged as explicit spike proof.** ConnectorKit's `useTransactionSigner` / `useKitTransactionSigner` operate at `@solana/kit` transaction-message level; server delivers base64 v0 wire transactions. Spike must prove the full round-trip (server bytes → decoder → signer → re-serialize → base64) with visible output, not just a "no error" pass. Shape mismatches recorded as "Signing path — architecture adjustments needed" before committing to ConnectorKit.
