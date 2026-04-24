# Browser Wallet Standard Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the DIY injected-provider browser wallet path with a maintained Wallet Standard integration so Phantom mobile in-app browser connect/sign works without reverse-engineering Phantom's undocumented lifecycle.

**Architecture:** Keep the native MWA path unchanged. In the browser path, boot Wallet Standard at app root and use React hooks for connect/sign/disconnect. Preserve existing non-wallet seams: server DTO contract (base64 v0 wire transaction in/out), `connectionKind` discriminator, `walletSessionStore`, navigation. Delete all injected-provider speculation code: 4100 late-approval waiter, `provider.on('connect')` polling, phantom-scoped shape preference.

**Execution model: spike, then migrate.** The load-bearing unknown is whether Phantom mobile in-app browser auto-registers as a Wallet Standard wallet. Task 0 is a thin connect-only spike deployed to a Cloudflare preview and tested in Phantom mobile. The spike gates everything else. If Wallet Standard self-registration works on Phantom mobile, the rest of the plan proceeds as written. If it doesn't, Task 0 forks to one of two fallbacks (`@phantom/browser-sdk` — registers Wallet Standard internally — or `@solana/wallet-adapter-react` + `@solana/wallet-adapter-phantom`) before any broader refactor.

**Tech Stack (subject to Task 0 confirmation):**
- `@wallet-standard/react-core` (v1.x) — `useWallets`, `useConnect`, `useDisconnect`.
- `@solana/react` (v6.x) — `useSignTransaction(account, chain)` (Uint8Array in/out), `useSelectedWalletAccount`, `SelectedWalletAccountContextProvider`.
- `@wallet-standard/app` (transitive) — window-event bootstrap for registry.
- **Fallback branch A:** `@phantom/browser-sdk` — ensures Wallet Standard registration when Phantom mobile doesn't self-register.
- **Fallback branch B:** `@solana/wallet-adapter-react` + `@solana/wallet-adapter-phantom` — if Wallet Standard path is unviable on Phantom mobile entirely.
- Existing: `@solana/kit` (transaction decoding/encoding), `@solana/web3.js` v1 (scoped to `VersionedTransaction.deserialize` only if the chosen hook requires an object instead of bytes).
- Preserved: `@solana-mobile/mobile-wallet-adapter-protocol-kit` (native path).

---

## Library choice and fallbacks

**Preferred path — Wallet Standard direct:** `@wallet-standard/react-core` (connect/disconnect/wallet discovery) + `@solana/react` (bytes-in/bytes-out signing via `useSignTransaction(account, chain)`). Rationale:
1. Aligns with `@solana/kit` already used throughout adapters (bytes in, bytes out).
2. `docs/superpowers/plans/2026-04-03-worktree-port-v2.md:1058` flagged `@solana/react`'s `useSignTransaction` as the intended browser signing surface.
3. Wallet Standard is the direction Solana wallets are converging on; alternatives wrap it anyway.

**Load-bearing unknown (resolved by Task 0 spike):** Whether Phantom's mobile in-app browser self-registers as a Wallet Standard wallet. `@wallet-standard/app` dispatches `wallet-standard:app-ready` on mount and expects wallets to respond with `wallet-standard:register-wallet`. Phantom's own `@phantom/browser-sdk` does this internally, but it's unconfirmed whether Phantom mobile's native injection does without the SDK loaded.

**Fallback A — load `@phantom/browser-sdk` on web:** If Phantom mobile doesn't self-register, `@phantom/browser-sdk` v2.x performs Wallet Standard registration itself. Same hooks on top still work. Adds a Phantom-specific dependency but keeps the Wallet Standard abstraction for our code.

**Fallback B — `@solana/wallet-adapter-react` + `@solana/wallet-adapter-phantom`:** Pre-Wallet-Standard abstraction that explicitly knows about Phantom's quirks. Larger surface, web3.js-v1 internally. Chosen only if A also fails.

**Decision gate:** Task 0 produces a deployed spike that picks one of {Preferred, Fallback A, Fallback B} based on real Phantom-mobile behavior. Tasks 1–18 assume the gate resolved.

---

## File Structure

### New files

- `apps/app/src/platform/walletStandard/WalletStandardProvider.tsx` — thin React provider wrapping `SelectedWalletAccountContextProvider` (from `@solana/react`) and whatever registry bootstrap Task 0 determined is required. Rendered at app root, web-only.
- `apps/app/src/platform/walletStandard/useBrowserWalletConnect.ts` — hook returning `{ connect(): Promise<string>, connecting: boolean, error: Error | null }`. Encapsulates wallet selection + connection for the browser path.
- `apps/app/src/platform/walletStandard/useBrowserWalletSign.ts` — hook returning `{ sign(serializedPayload: string): Promise<string>, signing: boolean }`. Bytes-in/bytes-out over base64 to match the server DTO.
- `apps/app/src/platform/walletStandard/useBrowserWalletDisconnect.ts` — hook returning `{ disconnect(): Promise<void> }`.
- `apps/app/src/platform/walletStandard/index.ts` — barrel export of the three hooks + provider.
- `apps/app/src/platform/walletStandard/useBrowserWalletConnect.test.ts`
- `apps/app/src/platform/walletStandard/useBrowserWalletSign.test.ts`
- `apps/app/src/platform/walletStandard/useBrowserWalletDisconnect.test.ts`
- `docs/solutions/integration-issues/phantom-mobile-injected-provider-migrated-to-wallet-standard-2026-04-24.md` — compound-engineering doc recording why DIY failed and what Wallet Standard replaces.

### Modified files

- `apps/app/app/_layout.tsx` — wrap the tree with `<WalletStandardProvider>`. Web-only (gated by `Platform.OS === 'web'`).
- `apps/app/app/connect.tsx` — use `useBrowserWalletConnect()`; delete inline `readInjectedBrowserWalletWindow()`.
- `apps/app/app/signing/[attemptId].tsx` — use `useBrowserWalletSign()`; delete inline `readInjectedBrowserWalletWindow()`.
- `apps/app/app/(tabs)/wallet.tsx` — use `useBrowserWalletDisconnect()`; delete inline `readInjectedBrowserWalletWindow()`.
- `apps/app/package.json` — add the library set chosen in Task 0 (preferred: `@wallet-standard/react-core` + `@solana/react` + `@wallet-standard/app`; Fallback A adds `@phantom/browser-sdk`; Fallback B replaces all with `@solana/wallet-adapter-react` + `@solana/wallet-adapter-phantom`).
- `packages/adapters/src/outbound/capabilities/WebPlatformCapabilityAdapter.ts` — probe Wallet Standard registry first (best-effort sync call); if empty, fall back to sniffing `window.phantom?.solana` / `window.solana` so the button still shows during the Wallet Standard registration race on page load.
- `apps/app/src/platform/webNavigation.ts` — `isSolanaMobileWebView` keeps its wallet-presence signal (needed to discriminate wallet WebView from regular mobile Safari/Chrome). Extend the signal to accept *either* a registered Wallet Standard wallet *or* a legacy injected provider (`window.phantom?.solana` / `window.solana` with a `connect` function). UA-only detection would misfire on plain mobile Safari and trigger unnecessary hard-navs.

### Deleted files

- None outright. `apps/app/src/platform/browserWallet.ts` collapses to a single exported `VersionedTransaction.deserialize` helper (or is deleted entirely if no kit-only consumers remain). Its tests shrink in parallel.

---

## Task 0: Connect-only spike in Phantom mobile (HARD GATE)

This task is the load-bearing gate for the entire plan. It proves, with a deployed preview URL and a real Phantom-mobile attempt, which of the three library paths actually works before any broader refactor. **Do not proceed to Task 1 until this task passes on Phantom mobile.**

**Files (on a throwaway `spike/wallet-standard-probe` branch — none of this ships to `main`):**
- Create: `apps/app/app/spike-connect.tsx` — a standalone route that only demonstrates connect, nothing else.
- Modify: `apps/app/app/_layout.tsx` — mount the minimum provider wrapper required by the preferred library.
- Modify: `apps/app/package.json` — add `@wallet-standard/react-core`, `@solana/react`, `@wallet-standard/app` at their current versions.

### Step 0.1: Library research, not version-pinning

- [ ] **Query Phantom docs** for Wallet Standard self-registration on mobile:

  ```bash
  npx ctx7@latest docs /websites/phantom "Wallet Standard mobile in-app browser wallet-standard:register-wallet auto-register without SDK"
  ```

  We want: does Phantom mobile in-app browser respond to `wallet-standard:app-ready` without `@phantom/browser-sdk` being loaded? The answer guides Fallback A vs Preferred.

- [ ] **Resolve `@solana/react` and `@wallet-standard/react-core` versions** and confirm the exact hook locations documented in the plan header (based on Kimi's finding: `useWallets`/`useConnect`/`useDisconnect` in `@wallet-standard/react-core`, `useSignTransaction`/`useSelectedWalletAccount` in `@solana/react`):

  ```bash
  npx ctx7@latest library "wallet-standard react-core" "useWallets useConnect useDisconnect register-wallet"
  npx ctx7@latest docs <resolved-id> "useWallets useConnect React hook setup"
  npx ctx7@latest library "solana react" "useSignTransaction useSelectedWalletAccount SelectedWalletAccountContextProvider"
  npx ctx7@latest docs <resolved-id> "useSignTransaction Uint8Array bytes signing"
  ```

  Record findings in `docs/superpowers/notes/2026-04-24-wallet-standard-package-survey.md`.

### Step 0.2: Build the minimal spike route

- [ ] Add deps for the Preferred path:

  ```bash
  pnpm --filter @clmm/app add @wallet-standard/react-core @solana/react @wallet-standard/app
  pnpm install
  ```

- [ ] Wrap the tree in `apps/app/app/_layout.tsx` with the provider(s) the docs require. Web-only (`Platform.OS === 'web'` guard).

- [ ] Create `apps/app/app/spike-connect.tsx` — a single screen with a "Connect" button, a "Show wallets" debug list, and a "Status" line. Use `useWallets()` to render how many wallets are registered and their names. Use `useConnect(firstWallet)` to call connect, and render the resulting address or error.

  Concretely:

  ```tsx
  import { useWallets, useConnect } from '@wallet-standard/react-core';

  export default function SpikeConnect() {
    const wallets = useWallets();
    const first = wallets[0];
    const [connect, isConnecting] = first ? useConnect(first) : [null, false];
    const [status, setStatus] = useState('idle');
    const [address, setAddress] = useState<string | null>(null);

    return (
      <View>
        <Text>Registered wallets: {wallets.length}</Text>
        {wallets.map(w => <Text key={w.name}>- {w.name}</Text>)}
        <Button title="Connect" disabled={!connect || isConnecting} onPress={async () => {
          try {
            setStatus('connecting');
            const accounts = await connect!();
            setAddress(accounts[0]?.address ?? null);
            setStatus('connected');
          } catch (e) {
            setStatus(`error: ${e instanceof Error ? e.message : String(e)}`);
          }
        }} />
        <Text>Status: {status}</Text>
        <Text>Address: {address ?? '—'}</Text>
      </View>
    );
  }
  ```

  (Exact API per docs — this is illustrative. The spike uses library APIs verbatim.)

### Step 0.3: Deploy + test in Phantom mobile

- [ ] Push `spike/wallet-standard-probe`; wait for Cloudflare Pages preview.

- [ ] Open preview URL at `/spike-connect` in Phantom mobile in-app browser.

- [ ] Observe "Registered wallets" count *before* tapping Connect.
  - **Count > 0** → Phantom mobile self-registers. Preferred path is viable. Set decision: **Preferred**.
  - **Count = 0** → Phantom mobile does not self-register. Try Fallback A (Step 0.4).

- [ ] If count > 0, tap Connect.
  - Approval sheet appears → user approves → address renders → **Preferred confirmed**.
  - Any other outcome (hang, error, no sheet) → document and try Fallback A.

### Step 0.4: Fallback A spike (only if Preferred fails)

- [ ] Add `@phantom/browser-sdk` to deps:

  ```bash
  pnpm --filter @clmm/app add @phantom/browser-sdk
  ```

- [ ] Initialize it at app root before `@wallet-standard/app` bootstraps. This should cause Phantom to register via Wallet Standard.

- [ ] Redeploy. Retest the same Phantom mobile flow at `/spike-connect`.
  - Registered wallets count > 0 + connect succeeds → **Fallback A confirmed**.
  - Still broken → try Fallback B (Step 0.5).

### Step 0.5: Fallback B spike (only if A fails)

- [ ] Replace the preferred libs with:

  ```bash
  pnpm --filter @clmm/app remove @wallet-standard/react-core @solana/react @wallet-standard/app @phantom/browser-sdk
  pnpm --filter @clmm/app add @solana/wallet-adapter-react @solana/wallet-adapter-phantom @solana/wallet-adapter-base
  ```

- [ ] Rewrite the spike route to use `useWallet()` from `@solana/wallet-adapter-react` with Phantom adapter explicitly registered. Redeploy. Retest.
  - Success → **Fallback B confirmed**. All subsequent tasks in this plan rewrite to wallet-adapter-react.
  - Failure → stop. Open an investigation ticket; DIY can't be fixed and neither can Wallet Standard from this environment. Out of scope for this plan.

### Step 0.6: Record decision and tear down

- [ ] Append to `docs/superpowers/notes/2026-04-24-wallet-standard-package-survey.md`:

  ```md
  ## Decision (YYYY-MM-DD)

  Chosen: [Preferred | Fallback A | Fallback B]

  Evidence:
  - Phantom mobile in-app browser registered wallets at page load: [N]
  - Connect attempt outcome: [success / hang / error text]
  - Version pins: @wallet-standard/react-core@X.Y.Z, @solana/react@X.Y.Z, ...
  ```

- [ ] Commit the survey note to `main` (not the spike branch). Delete the spike branch after the note lands.

**Gate:** Tasks 1–18 below assume the Preferred path. If Fallback A was chosen, adjust Task 2 (add `@phantom/browser-sdk`) and Task 9 (initialize it in `WalletStandardProvider`). If Fallback B was chosen, tasks 2–12 are rewritten against `@solana/wallet-adapter-react` API surfaces — the task skeleton stands but hook names, provider shape, and test stubs all change. Do not attempt Fallback B on the existing task scaffolding without rewriting.

---

## Task 1: Lock version pins and document findings

**Files:**
- Modify: `docs/superpowers/notes/2026-04-24-wallet-standard-package-survey.md`

- [ ] **Step 1: Confirm hook import paths (Kimi's finding)**

Verify and record in the survey note:
- `useWallets`, `useConnect`, `useDisconnect` are in `@wallet-standard/react-core` (not `@solana/react`).
- `useSignTransaction(account, chain)` returns `{ signedTransaction: Uint8Array }` or similar — record exact return shape.
- `useSelectedWalletAccount()` returns `[account, setAccount, filteredWallets]` — record exact shape.
- The required provider components and their order (likely `SelectedWalletAccountContextProvider` wrapping the tree).

- [ ] **Step 2: Confirm commit**

Amend the survey note with the confirmed imports and a small "Minimal setup" snippet that Task 9 will copy from verbatim.

```bash
git add docs/superpowers/notes/2026-04-24-wallet-standard-package-survey.md
git commit -m "docs: lock wallet-standard library pins and minimal setup snippet"
```

---

## Task 2: Install dependencies

**Files:**
- Modify: `apps/app/package.json`

- [ ] **Step 1: Install the confirmed packages**

Run (replace `<pkg>` with the name(s) from Task 1):
```bash
pnpm --filter @clmm/app add <pkg>@<version>
pnpm install
```

- [ ] **Step 2: Verify install and lock file**

Run:
```bash
pnpm --filter @clmm/app typecheck 2>&1 | head -30
```

Expected: same baseline TS errors as current `main` (`payloadVersion`, `srLevels`, async-storage). No *new* errors from the install.

- [ ] **Step 3: Commit**

```bash
git add apps/app/package.json pnpm-lock.yaml
git commit -m "chore(app): add wallet-standard packages for browser wallet migration"
```

---

## Task 3: Write the failing useBrowserWalletConnect test

**Files:**
- Create: `apps/app/src/platform/walletStandard/useBrowserWalletConnect.test.ts`

- [ ] **Step 1: Write the failing test**

Test shape:

```ts
import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
// Adjust imports to the library Task 1 chose.
import { useBrowserWalletConnect } from './useBrowserWalletConnect';

describe('useBrowserWalletConnect', () => {
  it('returns the connected account address on approve', async () => {
    // Arrange: stub useWallets + useConnect from the chosen library so that:
    //  - useWallets returns [phantomMock]
    //  - useConnect returns a connect() that resolves with accounts[0].address = 'Addr111...'
    const { result } = renderHook(() => useBrowserWalletConnect(), {
      wrapper: /* provider stub */,
    });

    let address: string | undefined;
    await act(async () => {
      address = await result.current.connect();
    });

    expect(address).toBe('Addr111...');
  });

  it('throws when no wallet is registered', async () => {
    const { result } = renderHook(() => useBrowserWalletConnect(), {
      wrapper: /* provider stub with zero wallets */,
    });

    await expect(result.current.connect()).rejects.toThrow(
      'No supported browser wallet detected on this device',
    );
  });

  it('throws when the user cancels approval', async () => {
    // Arrange: connect() rejects with a user-rejected error.
    const { result } = renderHook(() => useBrowserWalletConnect(), {
      wrapper: /* provider stub */,
    });

    await expect(result.current.connect()).rejects.toThrow(/rejected|denied|cancel/i);
  });
});
```

Use `@testing-library/react` for hook testing. If not already in devDependencies, add it.

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @clmm/app test -- --run src/platform/walletStandard/useBrowserWalletConnect.test.ts`
Expected: FAIL (module not found).

---

## Task 4: Implement useBrowserWalletConnect

**Files:**
- Create: `apps/app/src/platform/walletStandard/useBrowserWalletConnect.ts`

- [ ] **Step 1: Implement the hook**

Sketch (based on Kimi's research — `@wallet-standard/react-core` for discovery/connect, verify exact API against the pin from Task 1):

```ts
import { useWallets, useConnect } from '@wallet-standard/react-core';
import { useCallback, useState } from 'react';

const SOLANA_CHAIN = 'solana:mainnet' as const;

function pickSolanaWallet(wallets: readonly Wallet[]): Wallet | null {
  return wallets.find((w) => w.chains.includes(SOLANA_CHAIN) && w.features['standard:connect']) ?? null;
}

export function useBrowserWalletConnect() {
  const wallets = useWallets();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const connect = useCallback(async (): Promise<string> => {
    setConnecting(true);
    setError(null);
    try {
      const wallet = pickSolanaWallet(wallets);
      if (!wallet) {
        throw new Error('No supported browser wallet detected on this device');
      }
      const { accounts } = await wallet.features['standard:connect'].connect();
      const first = accounts[0];
      if (!first) {
        throw new Error('Wallet did not return an account');
      }
      return first.address;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setConnecting(false);
    }
  }, [wallets]);

  return { connect, connecting, error };
}
```

- [ ] **Step 2: Run tests to verify pass**

Run: `pnpm --filter @clmm/app test -- --run src/platform/walletStandard/useBrowserWalletConnect.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/platform/walletStandard/useBrowserWalletConnect.ts apps/app/src/platform/walletStandard/useBrowserWalletConnect.test.ts
git commit -m "feat(app): add useBrowserWalletConnect hook backed by wallet-standard"
```

---

## Task 5: Write the failing useBrowserWalletSign test

**Files:**
- Create: `apps/app/src/platform/walletStandard/useBrowserWalletSign.test.ts`

- [ ] **Step 1: Write the failing test**

Follow the contract established by `signBrowserTransaction`: base64 in, base64 out.

```ts
import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBrowserWalletSign } from './useBrowserWalletSign';

// Reuse the valid v0 transaction fixture from browserWallet.test.ts — it's a real
// serialized v0 tx that `VersionedTransaction.deserialize` (and presumably wallet-standard) can parse.
const VALID_V0_TRANSACTION_BASE64 =
  'AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAQABA8Ad1mDmJHOT4w9SKImj8qzR0ItAoMpTpj/M0nP1p4YpfC/b4w9Qc3vmYbf/YFgTZoQYCeG3U3QFBeWvvqvS5/YAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQICAAEMAgAAAAEAAAAAAAAAAA==';

describe('useBrowserWalletSign', () => {
  it('passes raw payload bytes to wallet-standard signTransaction and returns base64 signed payload', async () => {
    // Arrange: stub useSignTransaction to return a Uint8Array; capture the input bytes.
    const receivedBytes: Uint8Array[] = [];
    // ... provider stub

    const { result } = renderHook(() => useBrowserWalletSign(), { wrapper: /*...*/ });

    let signed: string | undefined;
    await act(async () => {
      signed = await result.current.sign(VALID_V0_TRANSACTION_BASE64);
    });

    expect(receivedBytes).toHaveLength(1);
    expect(receivedBytes[0]).toBeInstanceOf(Uint8Array);
    expect(typeof signed).toBe('string');
    expect(signed!.length).toBeGreaterThan(0);
  });

  it('throws when no wallet is connected', async () => {
    const { result } = renderHook(() => useBrowserWalletSign(), { wrapper: /* empty */ });
    await expect(result.current.sign(VALID_V0_TRANSACTION_BASE64)).rejects.toThrow(
      /no.*wallet.*connected|no.*account/i,
    );
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @clmm/app test -- --run src/platform/walletStandard/useBrowserWalletSign.test.ts`
Expected: FAIL (module not found).

---

## Task 6: Implement useBrowserWalletSign

**Files:**
- Create: `apps/app/src/platform/walletStandard/useBrowserWalletSign.ts`

- [ ] **Step 1: Implement the hook**

```ts
import { useCallback } from 'react';
import { useSignTransaction, useSelectedWalletAccount } from '@solana/react';

const SOLANA_CHAIN = 'solana:mainnet' as const;

export function useBrowserWalletSign() {
  const account = useSelectedWalletAccount();
  const signTransaction = useSignTransaction(account, SOLANA_CHAIN);

  const sign = useCallback(async (serializedPayloadBase64: string): Promise<string> => {
    if (!account) {
      throw new Error('No wallet account connected for signing');
    }
    const payloadBytes = base64ToBytes(serializedPayloadBase64);
    const { signedTransaction } = await signTransaction({ transaction: payloadBytes });
    return bytesToBase64(signedTransaction);
  }, [account, signTransaction]);

  return { sign };
}

function base64ToBytes(value: string): Uint8Array { /* reuse existing helper or inline */ }
function bytesToBase64(bytes: Uint8Array): string { /* reuse existing helper or inline */ }
```

If Wallet Standard's `signTransaction` returns a `Uint8Array` that's the full wire transaction, we're done. If it returns a `VersionedTransaction` object, call `.serialize()` before base64-encoding.

**Do not reintroduce `VersionedTransaction.deserialize` on the input side.** Wallet Standard accepts raw bytes; that's the whole point. If it doesn't in practice, document and keep the decoder.

- [ ] **Step 2: Run tests to verify pass**

Run: `pnpm --filter @clmm/app test -- --run src/platform/walletStandard/useBrowserWalletSign.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/platform/walletStandard/useBrowserWalletSign.ts apps/app/src/platform/walletStandard/useBrowserWalletSign.test.ts
git commit -m "feat(app): add useBrowserWalletSign hook backed by wallet-standard"
```

---

## Task 7: Write the failing useBrowserWalletDisconnect test

**Files:**
- Create: `apps/app/src/platform/walletStandard/useBrowserWalletDisconnect.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe('useBrowserWalletDisconnect', () => {
  it('invokes the wallet disconnect feature when a wallet is connected', async () => {
    const disconnect = vi.fn(() => Promise.resolve());
    // provider stub with wallet exposing features['standard:disconnect'].disconnect = disconnect

    const { result } = renderHook(() => useBrowserWalletDisconnect(), { wrapper: /*...*/ });

    await act(async () => {
      await result.current.disconnect();
    });

    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when no wallet is connected', async () => {
    const { result } = renderHook(() => useBrowserWalletDisconnect(), { wrapper: /* empty */ });
    await expect(result.current.disconnect()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Expected: FAIL.

---

## Task 8: Implement useBrowserWalletDisconnect

**Files:**
- Create: `apps/app/src/platform/walletStandard/useBrowserWalletDisconnect.ts`

- [ ] **Step 1: Implement**

```ts
import { useCallback } from 'react';
import { useSelectedWalletAccount } from '@solana/react';
import { useDisconnect } from '@wallet-standard/react-core';

export function useBrowserWalletDisconnect() {
  const wallet = useSelectedWallet();

  const disconnect = useCallback(async (): Promise<void> => {
    const feature = wallet?.features['standard:disconnect'];
    if (feature == null) return;
    await feature.disconnect();
  }, [wallet]);

  return { disconnect };
}
```

- [ ] **Step 2: Run tests**

Expected: PASS.

- [ ] **Step 3: Barrel export**

Create `apps/app/src/platform/walletStandard/index.ts`:

```ts
export { useBrowserWalletConnect } from './useBrowserWalletConnect';
export { useBrowserWalletSign } from './useBrowserWalletSign';
export { useBrowserWalletDisconnect } from './useBrowserWalletDisconnect';
export { WalletStandardProvider } from './WalletStandardProvider';
```

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/platform/walletStandard/
git commit -m "feat(app): add useBrowserWalletDisconnect hook and barrel export"
```

---

## Task 9: Wire WalletStandardProvider at app root

**Files:**
- Create: `apps/app/src/platform/walletStandard/WalletStandardProvider.tsx`
- Modify: `apps/app/app/_layout.tsx`

- [ ] **Step 1: Create the provider wrapper**

```tsx
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
// Adjust to the exact provider component from Task 1.
import { ChosenWalletsProvider } from '<chosen-lib>';

export function WalletStandardProvider({ children }: { children: ReactNode }) {
  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }
  return <ChosenWalletsProvider>{children}</ChosenWalletsProvider>;
}
```

Gate on `Platform.OS === 'web'` — Wallet Standard is browser-only. Native code must not import it.

- [ ] **Step 2: Wrap the root Stack**

In `apps/app/app/_layout.tsx`, wrap the existing `<Stack>` inside `<WalletStandardProvider>`:

```tsx
return (
  <QueryClientProvider client={queryClient}>
    <WalletStandardProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </WalletStandardProvider>
  </QueryClientProvider>
);
```

- [ ] **Step 3: Verify typecheck + tests**

Run:
```bash
pnpm --filter @clmm/app typecheck 2>&1 | grep -v '(existing known errors)' | head
pnpm --filter @clmm/app test 2>&1 | tail
```

Expected: no new type errors; all existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/platform/walletStandard/WalletStandardProvider.tsx apps/app/app/_layout.tsx
git commit -m "feat(app): mount WalletStandardProvider at web app root"
```

---

## Task 10: Switch connect.tsx to the new hook

**Files:**
- Modify: `apps/app/app/connect.tsx`

- [ ] **Step 1: Replace imports and handler**

Remove:
```ts
import { connectBrowserWallet, readInjectedBrowserWalletWindow } from '../src/platform/browserWallet';
```

Add:
```ts
import { useBrowserWalletConnect } from '../src/platform/walletStandard';
```

In the component, call the hook at the top level and use it in the handler:

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

**Do not** call `connectBrowserWallet` or `readInjectedBrowserWalletWindow` anywhere in this file. No try/catch around the hook call — error handling lives in the mutation/handler as before.

- [ ] **Step 2: Run existing tests (connect flow has no direct tests)**

Run:
```bash
pnpm --filter @clmm/app test 2>&1 | tail
```

Expected: all currently-passing tests still pass.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/connect.tsx
git commit -m "feat(app): use wallet-standard hook for browser connect flow"
```

---

## Task 11: Switch signing/[attemptId].tsx to the new hook

**Files:**
- Modify: `apps/app/app/signing/[attemptId].tsx`

- [ ] **Step 1: Replace imports and sign call**

Remove:
```ts
import { readInjectedBrowserWalletWindow, signBrowserTransaction } from '../../src/platform/browserWallet';
```

Add:
```ts
import { useBrowserWalletSign } from '../../src/platform/walletStandard';
```

Inside the component:

```tsx
const browserSigner = useBrowserWalletSign();
```

Inside the `signMutation` mutationFn, replace:

```tsx
const signedPayload =
  connectionKind === 'browser'
    ? await signBrowserTransaction({
        browserWindow: readInjectedBrowserWalletWindow(),
        serializedPayload: signingPayload.serializedPayload,
      })
    : await signNativeTransaction({
        serializedPayload: signingPayload.serializedPayload,
        walletId: walletAddress,
      });
```

with:

```tsx
const signedPayload =
  connectionKind === 'browser'
    ? await browserSigner.sign(signingPayload.serializedPayload)
    : await signNativeTransaction({
        serializedPayload: signingPayload.serializedPayload,
        walletId: walletAddress,
      });
```

- [ ] **Step 2: Verify signing mutation error mapping still routes through `mapWalletErrorToOutcome`**

The existing catch inside the mutationFn routes cancellation/interruption back to the server. Confirm that the Wallet Standard error shapes (user rejected, etc.) include strings that match the matchers in `apps/app/src/platform/walletConnection.ts`. If they don't, add the missing matchers here rather than catching them in the hook — the hook should throw the raw error.

Run:
```bash
grep -n "user rejected\|declined\|cancelled\|canceled" apps/app/src/platform/walletConnection.ts
```

If the Wallet Standard library throws errors with other wording (e.g., `WalletStandardError: standard:connect was rejected`), extend the matcher list.

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @clmm/app test 2>&1 | tail
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/app/app/signing/\[attemptId\].tsx apps/app/src/platform/walletConnection.ts
git commit -m "feat(app): use wallet-standard hook for browser signing flow"
```

---

## Task 12: Switch (tabs)/wallet.tsx disconnect to the new hook

**Files:**
- Modify: `apps/app/app/(tabs)/wallet.tsx`

- [ ] **Step 1: Replace imports and disconnect call**

Remove:
```ts
import { disconnectBrowserWallet, readInjectedBrowserWalletWindow } from '../../src/platform/browserWallet';
```

Add:
```ts
import { useBrowserWalletDisconnect } from '../../src/platform/walletStandard';
```

Replace the inline disconnect:

```tsx
const browserDisconnect = useBrowserWalletDisconnect();
// ...
if (connectionKind === 'browser' && typeof window !== 'undefined') {
  try {
    await browserDisconnect.disconnect();
  } catch {
    // best-effort
  }
}
```

- [ ] **Step 2: Run tests**

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/\(tabs\)/wallet.tsx
git commit -m "feat(app): use wallet-standard hook for browser disconnect"
```

---

## Task 13: Update WebPlatformCapabilityAdapter

**Files:**
- Modify: `packages/adapters/src/outbound/capabilities/WebPlatformCapabilityAdapter.ts`
- Modify: `packages/adapters/src/outbound/capabilities/WebPlatformCapabilityAdapter.test.ts`

The adapter decides whether to show the "Connect Browser Wallet" button. With Wallet Standard, wallets register asynchronously (window event after page load), so a purely synchronous capability check can miss them. A blanket `true` on web would show the button on no-wallet desktop browsers and produce a post-click error. Compromise: probe Wallet Standard registry first; if empty, fall back to synchronous injected-provider sniff (`window.phantom?.solana` / `window.solana`). If both are empty, return false. (GLM's catch.)

- [ ] **Step 1: Update the adapter**

```ts
const injectedBrowserWallet = ((): boolean => {
  try {
    const win = globalThis as unknown as Record<string, unknown>;
    if (typeof (win as { window?: unknown }).window === 'undefined') return false;

    // Wallet Standard registry (best-effort; may be empty during the registration race).
    const nav = (win as { navigator?: unknown }).navigator as Record<string, unknown> | undefined;
    const walletsRegistry = nav?.['wallets'] as { get?: () => readonly unknown[] } | undefined;
    if (typeof walletsRegistry?.get === 'function' && walletsRegistry.get().length > 0) {
      return true;
    }

    // Synchronous legacy sniff — preserves capability when Wallet Standard hasn't bootstrapped yet.
    const phantom = win['phantom'] as { solana?: Record<string, unknown> } | undefined;
    if (typeof phantom?.solana?.['connect'] === 'function') return true;
    const solana = win['solana'] as Record<string, unknown> | undefined;
    if (typeof solana?.['connect'] === 'function') return true;

    return false;
  } catch {
    return false;
  }
})();
```

Delete only the *phantom-scoped-only preference* added in PR #29 — the sniff itself stays (it's a fallback now, not the only path).

- [ ] **Step 2: Update tests**

Three test cases:

```ts
it('detects browser wallet via Wallet Standard registry', async () => {
  vi.stubGlobal('navigator', { wallets: { get: () => [{ name: 'Phantom' }] } });
  vi.stubGlobal('window', {});
  const adapter = new WebPlatformCapabilityAdapter();
  await expect(adapter.getCapabilities()).resolves.toMatchObject({ browserWalletAvailable: true });
});

it('falls back to window.phantom.solana when registry is empty', async () => {
  vi.stubGlobal('navigator', { wallets: { get: () => [] } });
  vi.stubGlobal('window', { phantom: { solana: { connect: vi.fn() } } });
  const adapter = new WebPlatformCapabilityAdapter();
  await expect(adapter.getCapabilities()).resolves.toMatchObject({ browserWalletAvailable: true });
});

it('returns false when no registry entry and no injected provider', async () => {
  vi.stubGlobal('navigator', { wallets: { get: () => [] } });
  vi.stubGlobal('window', {});
  const adapter = new WebPlatformCapabilityAdapter();
  await expect(adapter.getCapabilities()).resolves.toMatchObject({ browserWalletAvailable: false });
});
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @clmm/adapters test -- --run src/outbound/capabilities/WebPlatformCapabilityAdapter.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/adapters/src/outbound/capabilities/WebPlatformCapabilityAdapter.ts packages/adapters/src/outbound/capabilities/WebPlatformCapabilityAdapter.test.ts
git commit -m "refactor(adapters): detect browser wallet via Wallet Standard registry with sync fallback"
```

---

## Task 14: Update webNavigation.ts mobile-webview detection

**Files:**
- Modify: `apps/app/src/platform/webNavigation.ts`
- Modify: `apps/app/src/platform/webNavigation.test.ts`

`isSolanaMobileWebView` decides between hard nav and SPA nav. The wallet-presence check is **load-bearing** — without it, hard-nav would fire on regular mobile Safari where it's not needed and would cause unnecessary full page reloads on every route change. GLM's catch: keep the wallet-presence signal; extend it to recognize Wallet Standard-registered wallets in addition to legacy injected providers.

- [ ] **Step 1: Update the detection**

```ts
export function isSolanaMobileWebView(): boolean {
  if (!isWebPlatform()) return false;
  try {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const uaMatchesMobileWebView = /wv\)/.test(ua) || /iPhone/.test(ua) || /iPad/.test(ua);
    if (!uaMatchesMobileWebView) return false;

    // Wallet-presence signal discriminates "inside a wallet's WebView" from
    // "regular mobile Safari/Chrome." Accept either a registered Wallet Standard
    // wallet OR a legacy injected provider.
    const nav = navigator as unknown as { wallets?: { get?: () => readonly unknown[] } };
    const walletStandardPresent = typeof nav.wallets?.get === 'function' && nav.wallets.get().length > 0;
    if (walletStandardPresent) return true;

    const win = window as unknown as Record<string, unknown>;
    const phantom = win['phantom'] as { solana?: Record<string, unknown> } | undefined;
    if (typeof phantom?.solana?.['connect'] === 'function') return true;
    const solana = win['solana'] as Record<string, unknown> | undefined;
    if (typeof solana?.['connect'] === 'function') return true;

    return false;
  } catch {
    return false;
  }
}
```

Remove the old `hasInjectedBrowserWalletProvider` import if present; the logic is now inlined.

- [ ] **Step 2: Update tests**

Add coverage for the registry path; keep existing injected-provider tests:

```ts
it('returns true on mobile WebView when Wallet Standard wallet is registered', () => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('navigator', {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    wallets: { get: () => [{ name: 'Phantom' }] },
  });
  expect(isSolanaMobileWebView()).toBe(true);
});

it('returns false on regular mobile Safari UA with no wallet presence', () => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('navigator', {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    wallets: { get: () => [] },
  });
  expect(isSolanaMobileWebView()).toBe(false);
});
```

Keep the existing "iPhone + `window.solana.connect`" test — it's the legacy-fallback case and still valid. Also add `afterEach(() => vi.unstubAllGlobals())` at the suite level if not already present (fixes the pre-existing stub-leak nit).

- [ ] **Step 3: Run tests**

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/platform/webNavigation.ts apps/app/src/platform/webNavigation.test.ts
git commit -m "refactor(app): extend mobile-webview detection to Wallet Standard registry"
```

---

## Task 15: Manual E2E validation in Phantom mobile browser

**Files:** none — this is the load-bearing test.

- [ ] **Step 1: Deploy the Cloudflare branch preview**

Push to the feature branch; wait for the Cloudflare Pages preview URL.

- [ ] **Step 2: Fresh Phantom install / clear trust for the preview domain**

On the test device, either:
- Clear Phantom app data, or
- In Phantom settings → Connected Apps → remove the preview domain entry.

This ensures we exercise the first-time-connect path.

- [ ] **Step 3: Run the connect flow**

Open the preview URL in Phantom's in-app browser. Tap "Connect Browser Wallet".

Expected:
- Phantom's approval sheet appears.
- User approves.
- Page navigates to `/(tabs)/positions`.
- No "Connection Failed" banner.

Record pass/fail.

- [ ] **Step 4: Run the sign flow end-to-end on an out-of-range position**

From `/positions`, select a supported out-of-range position, proceed to preview, then to signing. Tap "Sign & Execute".

Expected:
- Phantom's signing sheet appears with the serialized v0 transaction.
- User approves.
- Page navigates to `/execution/:attemptId` and lifecycle advances past `awaiting-signature`.

Record pass/fail.

- [ ] **Step 5: Run the disconnect flow**

From the Wallet tab, tap Disconnect.

Expected:
- App state clears.
- Phantom no longer lists the preview domain under Connected Apps.

Record pass/fail.

- [ ] **Step 6: Regression-check the native path**

Install the native app build (or use the existing staging TestFlight/APK), run the same three flows with MWA. Expected: no change from current behavior.

- [ ] **Step 7: Regression-check desktop Phantom**

Open the preview URL in desktop Chrome with Phantom extension. Run the same three flows. Expected: no change from current behavior.

**Gate:** If any step in 3–7 fails, stop and investigate. Do not proceed to Task 16 (cleanup) with broken flows.

- [ ] **Step 8: Commit the validation record**

Append to `docs/superpowers/notes/2026-04-24-wallet-standard-package-survey.md`:

```md
## E2E Validation (YYYY-MM-DD)

- Phantom mobile in-app browser connect: PASS/FAIL
- Phantom mobile in-app browser sign: PASS/FAIL
- Phantom mobile in-app browser disconnect: PASS/FAIL
- Native MWA regression: PASS/FAIL
- Desktop Phantom extension regression: PASS/FAIL
```

Commit.

---

## Task 16: Delete the dead injected-provider code

**Files:**
- Delete (mostly): `apps/app/src/platform/browserWallet.ts`
- Delete: `apps/app/src/platform/browserWallet.test.ts`
- Modify: any remaining imports

Do this only after Task 15 passes.

- [ ] **Step 1: Find remaining importers**

```bash
rg -n "from.*browserWallet" apps packages 2>&1
```

Expected: zero results after Tasks 10–12. If any remain, they're bugs in earlier tasks — fix them.

- [ ] **Step 2: Delete the files**

```bash
git rm apps/app/src/platform/browserWallet.ts apps/app/src/platform/browserWallet.test.ts
```

If any downstream code still needs `VersionedTransaction.deserialize` (it should not — the hook handles bytes directly), leave a single-purpose helper module `apps/app/src/platform/versionedTransaction.ts` with just that function. Do not leave the rest of the file as stub shims.

- [ ] **Step 3: Run full test + typecheck**

```bash
pnpm --filter @clmm/app test 2>&1 | tail
pnpm --filter @clmm/app typecheck 2>&1 | tail
```

Expected: no new failures.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(app): delete injected-provider browser wallet code after wallet-standard migration"
```

---

## Task 17: Compound-engineering solution document

**Files:**
- Create: `docs/solutions/integration-issues/phantom-mobile-injected-provider-migrated-to-wallet-standard-2026-04-24.md`

- [ ] **Step 1: Write the doc**

Capture:
- **Problem:** DIY injected-provider approach hit three compounding Phantom-mobile quirks (4100-on-first-connect, no `connect` event fired after popup approval, `publicKey` never populated). Each narrow patch (PRs #27, #29 iterations) fixed adjacent symptoms but not the root failure.
- **Root cause:** Phantom mobile in-app browser's injected provider does not conform to the generic `provider.connect()` / `on('connect')` / `publicKey` contract documented for desktop. Attempting to target it directly was reverse-engineering a moving contract.
- **What didn't work:**
  - Preferring `window.phantom.solana` over `window.solana` (PR #29 early iterations)
  - Intercepting 4100 and waiting on `connect` event + `publicKey` polling (PR #29 HEAD — both recovery channels silent on Phantom mobile)
- **Solution:** Migrated the browser wallet path to Wallet Standard via `@solana/react` (or the chosen library). Wallet Standard is the contract that wallets — including Phantom mobile — actually implement consistently.
- **Prevention:**
  - Do not target injected wallet providers directly when a Wallet Standard path exists.
  - When a bug class recurs after 3 narrow patches, stop patching and question the architecture (see `superpowers/systematic-debugging`).
  - The native path was already correct (MWA protocol-kit); the browser path now mirrors that choice of "use the standard contract, not the wallet-specific quirks."

- [ ] **Step 2: Commit**

```bash
git add docs/solutions/integration-issues/phantom-mobile-injected-provider-migrated-to-wallet-standard-2026-04-24.md
git commit -m "docs(solutions): record migration from injected provider to wallet-standard"
```

---

## Task 18: Final repo-wide checks

**Files:** none

- [ ] **Step 1: Full test + typecheck + lint**

```bash
pnpm test 2>&1 | tail -20
pnpm typecheck 2>&1 | tail -20
pnpm lint 2>&1 | tail -20
pnpm boundaries 2>&1 | tail -20
```

Known-baseline TS errors (`payloadVersion`, `srLevels`, async-storage) are acceptable; **new** errors are not.

- [ ] **Step 2: Confirm native path untouched**

```bash
rg -n "connectNativeWallet|signNativeTransaction|mobile-wallet-adapter-protocol-kit" apps packages 2>&1
```

Should show the same references as on `main`.

- [ ] **Step 3: PR description**

When opening the PR:
- Reference PRs #27, #29 as the failed-patch chain.
- Link the solution doc from Task 17.
- Call out that `@solana/web3.js` may be removable as a direct app dependency (only keep if the chosen library has it as a peer); flag for follow-up.
- List the three E2E flows validated in Task 15.

---

## Out of scope (explicit)

- Native MWA path changes. It works; do not touch.
- Server-side changes. The signing payload contract (base64 v0 wire transaction in, base64 signed wire transaction out + `payloadVersion`) is unchanged.
- UX polish for mid-connect states (the "Approve in Phantom and tap Connect again" message from the aborted H1 fix). If Wallet Standard surfaces a known failure mode that benefits from this, add it as a follow-up.
- Removing `@solana/web3.js` entirely. Wallet Standard may internally depend on it; verify in a follow-up.

---

## Rollback plan

If Task 15 fails catastrophically and cannot be diagnosed quickly:
1. `git revert` the Task 10, 11, 12 commits.
2. Restore `apps/app/src/platform/browserWallet.ts` to PR #29 HEAD state (has the 4100 waiter — not ideal, but at least shows an error after 60s rather than hanging forever).
3. Open a follow-up investigation ticket; do not re-attempt without new data from Phantom mobile devtools access (Safari remote inspection or equivalent).

The Wallet Standard provider wrapper (Task 9) and the new hook files can stay in the repo dormant; they're gated by the `<WalletStandardProvider>` wrapper and unused by the reverted connect/sign/disconnect call sites.

---

## Commit hygiene

- Each commit should leave tests + typecheck green.
- Task-sized commits are the default audit trail and make revert safe, but on a hotfix branch feel free to collapse cosmetic/no-op commits — the rollback plan only needs to revert the call-site migrations (Tasks 10–12) to restore the prior behavior. Do not squash anything from Tasks 0, 1, or 17 (they're decision records).
- The ordering *within* a task (failing test → implement → commit) is not negotiable: that's what makes each step independently verifiable.

---

## Amendments log

- **2026-04-24** — Initial plan.
- **2026-04-24 (revised)** — Incorporated GPT / Kimi / GLM review:
  - Added **Task 0 spike** (hard gate) before any broader refactor. Forks to `@phantom/browser-sdk` (Fallback A) or `@solana/wallet-adapter-react` (Fallback B) based on real Phantom mobile behavior.
  - Corrected hook import locations per Kimi's research: `useWallets`/`useConnect`/`useDisconnect` are in `@wallet-standard/react-core`, not `@solana/react`. Tasks 4, 6, 8 updated.
  - Task 13 reverted from blanket `browserWalletAvailable: true` to Wallet-Standard-registry probe with synchronous injected-provider fallback (GLM's catch).
  - Task 14 reverted from UA-only detection back to UA + wallet-presence (either registry or injected provider) — the wallet-presence signal is load-bearing for discriminating wallet WebView from plain mobile Safari (GLM's catch).
  - Commit hygiene loosened for cosmetic commits on the hotfix branch (GPT's preference).
