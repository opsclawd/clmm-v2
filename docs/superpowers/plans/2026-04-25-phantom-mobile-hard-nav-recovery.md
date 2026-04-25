# Phantom Mobile Hard-Navigation Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop browser-wallet hard-navigation reloads from falsely redirecting to `/connect` by introducing a centralized `WalletBootStatus` derivation that gates protected routes while `@solana/connector`'s `autoConnect` settles.

**Architecture:** A pure `deriveWalletBootStatus` function combines `walletSessionStore` hydration, persisted browser-wallet candidate, `useConnector()` `walletStatus`, and a single 1500ms watchdog timer. A `WalletBootProvider` mounted inside `BrowserWalletProvider` owns the derivation and exposes a read-only `useWalletBootStatus()` hook. A `<RequireWallet>` wrapper component is the only protected-route consumer; it shows a `BootScreen` during boot, redirects to `/connect?returnTo=…` when truly disconnected, and renders children when connected. `BrowserWalletSessionSync` is updated so it no longer eagerly disconnects during the boot window.

**Tech Stack:**
- React 18 + Expo Router 4 (file-based routing) on Expo SDK 52
- Zustand vanilla store with `persist` middleware backed by `AsyncStorage`
- `@solana/connector` v0.2.4 (`useConnector`, `WalletStatus` discriminated union, `autoConnect: true`)
- Vitest 1.6 + jsdom + `@testing-library/react`

**Spec:** [`docs/superpowers/specs/2026-04-25-phantom-mobile-hard-nav-recovery-design.md`](../specs/2026-04-25-phantom-mobile-hard-nav-recovery-design.md)
**Issue:** [opsclawd/clmm-v2#38](https://github.com/opsclawd/clmm-v2/issues/38)

---

## File Structure

**New files:**

| Path | Responsibility |
| --- | --- |
| `apps/app/src/state/deriveWalletBootStatus.ts` | Pure derivation function + `WalletBootStatus` type |
| `apps/app/src/state/deriveWalletBootStatus.test.ts` | Unit tests for every branch of the precedence ladder |
| `apps/app/src/wallet-boot/parseReturnTo.ts` | `returnTo` query-param validation + decode utility |
| `apps/app/src/wallet-boot/parseReturnTo.test.ts` | Unit tests for `parseReturnTo` |
| `apps/app/src/wallet-boot/buildReturnToPath.ts` | Build `returnTo` value from current pathname + search |
| `apps/app/src/wallet-boot/buildReturnToPath.test.ts` | Unit tests for `buildReturnToPath` |
| `apps/app/src/wallet-boot/BootScreen.tsx` | Centered spinner + neutral copy keyed off boot status |
| `apps/app/src/wallet-boot/walletBootContext.ts` | React context + `useWalletBootStatus` hook |
| `apps/app/src/wallet-boot/WalletBootProvider.web.tsx` | Web provider — reads `useConnector()`, owns watchdog, publishes status |
| `apps/app/src/wallet-boot/WalletBootProvider.native.tsx` | Native shell — passes constant connector inputs into derive |
| `apps/app/src/wallet-boot/WalletBootProvider.tsx` | Default fallback re-export of native shell |
| `apps/app/src/wallet-boot/RequireWallet.tsx` | Protected-route wrapper component |
| `apps/app/src/wallet-boot/RequireWallet.test.tsx` | Integration tests covering boot, redirect, and connected branches |
| `apps/app/src/wallet-boot/WalletBootProvider.web.test.tsx` | Integration tests covering watchdog + connector transitions |

**Modified files:**

| Path | Change |
| --- | --- |
| `apps/app/src/state/walletSessionStore.ts` | Add `lastConnectedAt` field; stop blanking browser identity in `partialize`; set/clear `lastConnectedAt` in `markConnected`/`disconnect` |
| `apps/app/src/state/walletSessionStore.test.ts` | Replace "does not persist browser" test with "does persist browser"; add `lastConnectedAt` tests |
| `apps/app/src/platform/browserWallet/BrowserWalletProvider.web.tsx` | Mount `<WalletBootProvider>`; remove eager-disconnect branch from `BrowserWalletSessionSync` |
| `apps/app/src/platform/browserWallet/BrowserWalletProvider.native.tsx` | Mount native `<WalletBootProvider>` shell so `useWalletBootStatus()` works on native |
| `apps/app/app/connect.tsx` | Read + parse `returnTo` query param; route post-connect to it instead of hard-coded `/(tabs)/positions` |
| `apps/app/app/position/[id].tsx` | Wrap body in `<RequireWallet>`; remove inline hydration/redirect logic |
| `apps/app/app/preview/[triggerId].tsx` | Wrap body in `<RequireWallet>`; remove inline hydration/redirect logic |
| `apps/app/app/signing/[attemptId].tsx` | Wrap body in `<RequireWallet>`; remove inline hydration/redirect logic |
| `apps/app/app/execution/[attemptId].tsx` | Wrap body in `<RequireWallet>` |

---

## Conventions used by this plan

- All commands run from the **repo root** unless noted.
- Tests run with `pnpm --filter @clmm/app test -- <file>` to scope to the app package.
- Frequent commits — each task ends with a single commit. Use the message shown in Step "Commit"; do not collapse tasks.
- TDD — every task writes the failing test first, runs it to confirm failure, then implements, then runs to confirm pass.

---

## Task 1: Persist browser-wallet identity and add `lastConnectedAt`

**Why:** Root-cause fix for the bug. Today `partialize` blanks `walletAddress` and `connectionKind` when `connectionKind === 'browser'`, so every reload destroys the session. We also add `lastConnectedAt` (telemetry-only field) per the spec.

**Files:**
- Modify: `apps/app/src/state/walletSessionStore.ts`
- Modify: `apps/app/src/state/walletSessionStore.test.ts`

- [ ] **Step 1: Update existing test that asserts browser sessions are NOT persisted**

Replace the test at `apps/app/src/state/walletSessionStore.test.ts:126-144` (the `'does not persist browser wallet sessions across rehydration'` test) with the inverse assertion plus `lastConnectedAt` coverage.

Open the file and replace that test block with:

```ts
  it('persists browser wallet sessions across rehydration', async () => {
    const store1 = createWalletSessionStore();

    store1.getState().setPlatformCapabilities(caps);
    store1.getState().beginConnection();
    store1.getState().markConnected({
      walletAddress: 'DemoWallet1111111111111111111111111111111111',
      connectionKind: 'browser',
    });

    await Promise.resolve();

    const store2 = createWalletSessionStore();
    await store2.persist.rehydrate();

    expect(store2.getState().walletAddress).toBe('DemoWallet1111111111111111111111111111111111');
    expect(store2.getState().connectionKind).toBe('browser');
    expect(store2.getState().platformCapabilities).toEqual(caps);
  });

  it('records lastConnectedAt when markConnected is called', () => {
    const store = createWalletSessionStore();
    const before = Date.now();

    store.getState().markConnected({
      walletAddress: 'DemoWallet1111111111111111111111111111111111',
      connectionKind: 'browser',
    });

    const after = Date.now();
    const ts = store.getState().lastConnectedAt;
    expect(ts).not.toBeNull();
    expect(ts!).toBeGreaterThanOrEqual(before);
    expect(ts!).toBeLessThanOrEqual(after);
  });

  it('persists lastConnectedAt across rehydration', async () => {
    const store1 = createWalletSessionStore();
    store1.getState().markConnected({
      walletAddress: 'DemoWallet1111111111111111111111111111111111',
      connectionKind: 'browser',
    });
    const ts = store1.getState().lastConnectedAt;
    await Promise.resolve();

    const store2 = createWalletSessionStore();
    await store2.persist.rehydrate();
    expect(store2.getState().lastConnectedAt).toBe(ts);
  });

  it('clears lastConnectedAt on disconnect', () => {
    const store = createWalletSessionStore();
    store.getState().markConnected({
      walletAddress: 'DemoWallet1111111111111111111111111111111111',
      connectionKind: 'browser',
    });
    expect(store.getState().lastConnectedAt).not.toBeNull();
    store.getState().disconnect();
    expect(store.getState().lastConnectedAt).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter @clmm/app test -- src/state/walletSessionStore.test.ts`

Expected: 4 failures
- `persists browser wallet sessions across rehydration` → fails because `walletAddress` rehydrates as `null`
- `records lastConnectedAt when markConnected is called` → fails because `lastConnectedAt` is undefined
- `persists lastConnectedAt across rehydration` → fails for same reason
- `clears lastConnectedAt on disconnect` → fails for same reason

- [ ] **Step 3: Update `walletSessionStore.ts`**

Open `apps/app/src/state/walletSessionStore.ts` and apply three changes.

(a) Extend `WalletSessionState` (after `hasHydrated`):

```ts
export type WalletSessionState = {
  walletAddress: string | null;
  connectionKind: WalletConnectionKind | null;
  connectionOutcome: ConnectionOutcome | null;
  platformCapabilities: PlatformCapabilityState | null;
  isConnecting: boolean;
  hasHydrated: boolean;
  lastConnectedAt: number | null;
  setPlatformCapabilities: (capabilities: PlatformCapabilityState) => void;
  beginConnection: () => void;
  markConnected: (params: {
    walletAddress: string;
    connectionKind: WalletConnectionKind;
  }) => void;
  markOutcome: (outcome: NonSuccessConnectionOutcome) => void;
  disconnect: () => void;
  clearOutcome: () => void;
};
```

(b) In the store body, initialize `lastConnectedAt: null` and update `markConnected` and `disconnect`:

```ts
walletAddress: null,
connectionKind: null,
connectionOutcome: null,
platformCapabilities: null,
isConnecting: false,
hasHydrated: false,
lastConnectedAt: null,
setPlatformCapabilities: (platformCapabilities) => set({ platformCapabilities }),
beginConnection: () =>
  set({
    isConnecting: true,
    connectionOutcome: null,
    walletAddress: null,
    connectionKind: null,
  }),
markConnected: ({ walletAddress, connectionKind }) =>
  set({
    walletAddress,
    connectionKind,
    connectionOutcome: { kind: 'connected' },
    isConnecting: false,
    lastConnectedAt: Date.now(),
  }),
markOutcome: (connectionOutcome) =>
  set({
    connectionOutcome,
    isConnecting: false,
    walletAddress: null,
    connectionKind: null,
  }),
disconnect: () => {
  set({
    walletAddress: null,
    connectionKind: null,
    connectionOutcome: null,
    isConnecting: false,
    lastConnectedAt: null,
  });
  store.persist.clearStorage();
},
clearOutcome: () => set({ connectionOutcome: null }),
```

(c) Replace the `partialize` block (currently strips browser identity) with one that persists both kinds plus `lastConnectedAt`:

```ts
partialize: (state) => ({
  walletAddress: state.walletAddress,
  connectionKind: state.connectionKind,
  platformCapabilities: state.platformCapabilities,
  lastConnectedAt: state.lastConnectedAt,
}),
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter @clmm/app test -- src/state/walletSessionStore.test.ts`

Expected: all tests pass (the existing `'persists native wallet sessions across rehydration'` test continues to pass; the renamed `'persists browser wallet sessions across rehydration'` test passes; `lastConnectedAt` tests pass).

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/state/walletSessionStore.ts apps/app/src/state/walletSessionStore.test.ts
git commit -m "fix(wallet): persist browser-wallet identity and add lastConnectedAt

walletSessionStore previously blanked browser-wallet identity in
partialize, destroying the session on every hard navigation. Persist
walletAddress and connectionKind for browser sessions on the same
terms as native, and record lastConnectedAt as telemetry/debug
metadata. lastConnectedAt is not consumed by boot derivation.

Refs #38"
```

---

## Task 2: Pure `deriveWalletBootStatus` function

**Why:** This is the central derivation. Spec'd as a pure function so it can be unit-tested exhaustively in isolation, with no React or connector mocks.

**Files:**
- Create: `apps/app/src/state/deriveWalletBootStatus.ts`
- Create: `apps/app/src/state/deriveWalletBootStatus.test.ts`

**Background — `WalletStatus` shape from `@solana/connector` v0.2.4:**

```ts
type WalletStatus =
  | { status: 'disconnected' }
  | { status: 'connecting'; connectorId: WalletConnectorId }
  | { status: 'connected'; session: WalletSession }
  | { status: 'error'; error: Error; connectorId?: WalletConnectorId; recoverable: boolean };
```

`INITIAL_WALLET_STATUS` is `{ status: 'disconnected' }`. The derive function therefore cannot treat `'disconnected'` as proof of "autoConnect tried and failed" — that signal must come from the caller via `hasSeenConnectorInflight`, set true once the connector has ever been observed in `'connecting'` or `'connected'`.

- [ ] **Step 1: Write the failing test file**

Create `apps/app/src/state/deriveWalletBootStatus.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  deriveWalletBootStatus,
  type DeriveWalletBootStatusInput,
  type WalletBootStatus,
} from './deriveWalletBootStatus';

const ADDR = 'DemoWallet1111111111111111111111111111111111';

function input(partial: Partial<DeriveWalletBootStatusInput>): DeriveWalletBootStatusInput {
  return {
    hasHydrated: true,
    connectionKind: null,
    walletAddress: null,
    connectorStatus: { status: 'disconnected' },
    connectorAccount: null,
    hasSeenConnectorInflight: false,
    restoreTimedOut: false,
    ...partial,
  };
}

describe('deriveWalletBootStatus', () => {
  it('returns hydrating-storage when storage has not hydrated, regardless of other inputs', () => {
    const out: WalletBootStatus = deriveWalletBootStatus(
      input({
        hasHydrated: false,
        connectionKind: 'browser',
        walletAddress: ADDR,
        connectorStatus: { status: 'connected', session: {} as never },
        connectorAccount: ADDR,
        hasSeenConnectorInflight: true,
        restoreTimedOut: true,
      }),
    );
    expect(out).toBe('hydrating-storage');
  });

  it('returns connected immediately for a persisted native session', () => {
    expect(
      deriveWalletBootStatus(
        input({ connectionKind: 'native', walletAddress: ADDR }),
      ),
    ).toBe('connected');
  });

  it('returns disconnected for native kind with null address', () => {
    expect(
      deriveWalletBootStatus(
        input({ connectionKind: 'native', walletAddress: null }),
      ),
    ).toBe('disconnected');
  });

  it('returns checking-browser-wallet for a browser candidate while connector is initial-disconnected', () => {
    expect(
      deriveWalletBootStatus(
        input({
          connectionKind: 'browser',
          walletAddress: ADDR,
          connectorStatus: { status: 'disconnected' },
          hasSeenConnectorInflight: false,
          restoreTimedOut: false,
        }),
      ),
    ).toBe('checking-browser-wallet');
  });

  it('returns checking-browser-wallet for a browser candidate while connector is connecting', () => {
    expect(
      deriveWalletBootStatus(
        input({
          connectionKind: 'browser',
          walletAddress: ADDR,
          connectorStatus: { status: 'connecting', connectorId: 'phantom' as never },
          hasSeenConnectorInflight: true,
          restoreTimedOut: false,
        }),
      ),
    ).toBe('checking-browser-wallet');
  });

  it('returns connected for browser candidate when connector reports connected with matching account', () => {
    expect(
      deriveWalletBootStatus(
        input({
          connectionKind: 'browser',
          walletAddress: ADDR,
          connectorStatus: { status: 'connected', session: {} as never },
          connectorAccount: ADDR,
          hasSeenConnectorInflight: true,
        }),
      ),
    ).toBe('connected');
  });

  it('keeps checking-browser-wallet when connector says connected but account is null (defensive)', () => {
    expect(
      deriveWalletBootStatus(
        input({
          connectionKind: 'browser',
          walletAddress: ADDR,
          connectorStatus: { status: 'connected', session: {} as never },
          connectorAccount: null,
          hasSeenConnectorInflight: true,
        }),
      ),
    ).toBe('checking-browser-wallet');
  });

  it('returns disconnected when connector reaches error state', () => {
    expect(
      deriveWalletBootStatus(
        input({
          connectionKind: 'browser',
          walletAddress: ADDR,
          connectorStatus: { status: 'error', error: new Error('x'), recoverable: false },
          hasSeenConnectorInflight: true,
        }),
      ),
    ).toBe('disconnected');
  });

  it('returns disconnected when connector returns to disconnected after being inflight', () => {
    expect(
      deriveWalletBootStatus(
        input({
          connectionKind: 'browser',
          walletAddress: ADDR,
          connectorStatus: { status: 'disconnected' },
          hasSeenConnectorInflight: true,
        }),
      ),
    ).toBe('disconnected');
  });

  it('returns disconnected when watchdog fires regardless of connector state', () => {
    expect(
      deriveWalletBootStatus(
        input({
          connectionKind: 'browser',
          walletAddress: ADDR,
          connectorStatus: { status: 'connecting', connectorId: 'phantom' as never },
          hasSeenConnectorInflight: true,
          restoreTimedOut: true,
        }),
      ),
    ).toBe('disconnected');
  });

  it('returns disconnected when there is no restore candidate and no native session', () => {
    expect(
      deriveWalletBootStatus(
        input({ connectionKind: null, walletAddress: null }),
      ),
    ).toBe('disconnected');
  });

  it('returns disconnected when browser kind has no walletAddress (no candidate)', () => {
    expect(
      deriveWalletBootStatus(
        input({ connectionKind: 'browser', walletAddress: null }),
      ),
    ).toBe('disconnected');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter @clmm/app test -- src/state/deriveWalletBootStatus.test.ts`

Expected: import resolution failure (module does not exist).

- [ ] **Step 3: Implement `deriveWalletBootStatus.ts`**

Create `apps/app/src/state/deriveWalletBootStatus.ts`:

```ts
import type { WalletStatus } from '@solana/connector';
import type { WalletConnectionKind } from './walletSessionStore';

export type WalletBootStatus =
  | 'hydrating-storage'
  | 'checking-browser-wallet'
  | 'connected'
  | 'disconnected';

export type DeriveWalletBootStatusInput = {
  hasHydrated: boolean;
  connectionKind: WalletConnectionKind | null;
  walletAddress: string | null;
  connectorStatus: WalletStatus;
  connectorAccount: string | null;
  hasSeenConnectorInflight: boolean;
  restoreTimedOut: boolean;
};

export function deriveWalletBootStatus(input: DeriveWalletBootStatusInput): WalletBootStatus {
  if (!input.hasHydrated) return 'hydrating-storage';

  if (input.connectionKind === 'native' && input.walletAddress != null) {
    return 'connected';
  }

  const hasBrowserRestoreCandidate =
    input.connectionKind === 'browser' && input.walletAddress != null;

  if (hasBrowserRestoreCandidate) {
    if (
      input.connectorStatus.status === 'connected' &&
      input.connectorAccount != null
    ) {
      return 'connected';
    }
    if (input.connectorStatus.status === 'error') {
      return 'disconnected';
    }
    if (input.connectorStatus.status === 'disconnected' && input.hasSeenConnectorInflight) {
      return 'disconnected';
    }
    if (input.restoreTimedOut) return 'disconnected';
    return 'checking-browser-wallet';
  }

  return 'disconnected';
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter @clmm/app test -- src/state/deriveWalletBootStatus.test.ts`

Expected: 12 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/state/deriveWalletBootStatus.ts apps/app/src/state/deriveWalletBootStatus.test.ts
git commit -m "feat(wallet-boot): add pure deriveWalletBootStatus function

Computes WalletBootStatus from storage hydration, persisted browser
restore candidate, @solana/connector walletStatus, observed-inflight
flag, and a watchdog signal. Pure function with full branch coverage.

Refs #38"
```

---

## Task 3: `parseReturnTo` validation utility

**Why:** Connect screen needs a hardened decoder for the `returnTo` query param so a hostile or malformed value cannot redirect off-app or loop back to `/connect`.

**Files:**
- Create: `apps/app/src/wallet-boot/parseReturnTo.ts`
- Create: `apps/app/src/wallet-boot/parseReturnTo.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `apps/app/src/wallet-boot/parseReturnTo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseReturnTo, RETURN_TO_FALLBACK } from './parseReturnTo';

describe('parseReturnTo', () => {
  it('returns fallback when input is undefined', () => {
    expect(parseReturnTo(undefined)).toBe(RETURN_TO_FALLBACK);
  });

  it('returns fallback when input is an array (expo-router shape for repeated keys)', () => {
    expect(parseReturnTo(['/positions', '/alerts'])).toBe(RETURN_TO_FALLBACK);
  });

  it('returns fallback for empty string', () => {
    expect(parseReturnTo('')).toBe(RETURN_TO_FALLBACK);
  });

  it('returns fallback for input above 512 chars', () => {
    const long = '/' + 'a'.repeat(600);
    expect(parseReturnTo(long)).toBe(RETURN_TO_FALLBACK);
  });

  it('returns fallback when input cannot be decoded', () => {
    expect(parseReturnTo('%E0%A4%A')).toBe(RETURN_TO_FALLBACK);
  });

  it('returns fallback for an absolute URL', () => {
    expect(parseReturnTo(encodeURIComponent('https://evil.com/x'))).toBe(RETURN_TO_FALLBACK);
  });

  it('returns fallback for a protocol-relative URL', () => {
    expect(parseReturnTo(encodeURIComponent('//evil.com/x'))).toBe(RETURN_TO_FALLBACK);
  });

  it('returns fallback for /connect (loop prevention)', () => {
    expect(parseReturnTo(encodeURIComponent('/connect'))).toBe(RETURN_TO_FALLBACK);
  });

  it('returns fallback for /connect with query string', () => {
    expect(parseReturnTo(encodeURIComponent('/connect?returnTo=/x'))).toBe(RETURN_TO_FALLBACK);
  });

  it('decodes and returns a valid relative path', () => {
    expect(parseReturnTo(encodeURIComponent('/positions/abc'))).toBe('/positions/abc');
  });

  it('decodes and returns a valid path with query string', () => {
    expect(parseReturnTo(encodeURIComponent('/preview/abc?triggerId=xyz')))
      .toBe('/preview/abc?triggerId=xyz');
  });

  it('returns fallback for a path that does not start with /', () => {
    expect(parseReturnTo(encodeURIComponent('positions/abc'))).toBe(RETURN_TO_FALLBACK);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter @clmm/app test -- src/wallet-boot/parseReturnTo.test.ts`

Expected: import resolution failure.

- [ ] **Step 3: Implement `parseReturnTo.ts`**

Create `apps/app/src/wallet-boot/parseReturnTo.ts`:

```ts
export const RETURN_TO_FALLBACK = '/(tabs)/positions';
const MAX_LENGTH = 512;

export function parseReturnTo(raw: string | string[] | undefined): string {
  if (typeof raw !== 'string') return RETURN_TO_FALLBACK;
  if (raw.length === 0 || raw.length > MAX_LENGTH) return RETURN_TO_FALLBACK;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return RETURN_TO_FALLBACK;
  }

  if (!decoded.startsWith('/')) return RETURN_TO_FALLBACK;
  if (decoded.startsWith('//')) return RETURN_TO_FALLBACK;
  if (decoded === '/connect' || decoded.startsWith('/connect?') || decoded.startsWith('/connect/')) {
    return RETURN_TO_FALLBACK;
  }

  return decoded;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter @clmm/app test -- src/wallet-boot/parseReturnTo.test.ts`

Expected: 12 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/wallet-boot/parseReturnTo.ts apps/app/src/wallet-boot/parseReturnTo.test.ts
git commit -m "feat(wallet-boot): add parseReturnTo validation utility

Decodes the returnTo query param exactly once and rejects absolute,
protocol-relative, oversize, undecodable, or /connect-prefixed values.
Falls back to /(tabs)/positions on any rejection.

Refs #38"
```

---

## Task 4: `buildReturnToPath` helper

**Why:** `<RequireWallet>` needs to construct the value to encode into `returnTo` from the current route. The helper must exclude any pre-existing `returnTo` query param to prevent recursion.

**Files:**
- Create: `apps/app/src/wallet-boot/buildReturnToPath.ts`
- Create: `apps/app/src/wallet-boot/buildReturnToPath.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `apps/app/src/wallet-boot/buildReturnToPath.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildReturnToPath } from './buildReturnToPath';

describe('buildReturnToPath', () => {
  it('returns plain pathname when there is no search', () => {
    expect(buildReturnToPath('/positions/abc', {})).toBe('/positions/abc');
  });

  it('joins pathname and querystring', () => {
    expect(buildReturnToPath('/preview/abc', { triggerId: 'xyz' }))
      .toBe('/preview/abc?triggerId=xyz');
  });

  it('joins multiple search params in declaration order', () => {
    expect(buildReturnToPath('/signing/abc', { previewId: 'p', triggerId: 't' }))
      .toBe('/signing/abc?previewId=p&triggerId=t');
  });

  it('strips an existing returnTo param to prevent recursion', () => {
    expect(buildReturnToPath('/preview/abc', { triggerId: 'xyz', returnTo: '/whatever' }))
      .toBe('/preview/abc?triggerId=xyz');
  });

  it('skips array-shaped params (treats only string params)', () => {
    expect(buildReturnToPath('/x', { tag: ['a', 'b'], q: 'k' }))
      .toBe('/x?q=k');
  });

  it('skips undefined values', () => {
    expect(buildReturnToPath('/x', { q: 'k', empty: undefined }))
      .toBe('/x?q=k');
  });

  it('returns plain pathname when only param is the stripped returnTo', () => {
    expect(buildReturnToPath('/x', { returnTo: '/y' })).toBe('/x');
  });

  it('URL-encodes search values', () => {
    expect(buildReturnToPath('/x', { q: 'a b/c' })).toBe('/x?q=a%20b%2Fc');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter @clmm/app test -- src/wallet-boot/buildReturnToPath.test.ts`

Expected: import resolution failure.

- [ ] **Step 3: Implement `buildReturnToPath.ts`**

Create `apps/app/src/wallet-boot/buildReturnToPath.ts`:

```ts
export type SearchParamRecord = Record<string, string | string[] | undefined>;

export function buildReturnToPath(pathname: string, search: SearchParamRecord): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(search)) {
    if (key === 'returnTo') continue;
    if (typeof value !== 'string') continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }
  return parts.length === 0 ? pathname : `${pathname}?${parts.join('&')}`;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter @clmm/app test -- src/wallet-boot/buildReturnToPath.test.ts`

Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/wallet-boot/buildReturnToPath.ts apps/app/src/wallet-boot/buildReturnToPath.test.ts
git commit -m "feat(wallet-boot): add buildReturnToPath helper

Joins current pathname with the current search params (excluding any
pre-existing returnTo to prevent recursion) so RequireWallet can hand
a clean value to /connect?returnTo=...

Refs #38"
```

---

## Task 5: `BootScreen` component

**Why:** Centered spinner + neutral copy that `<RequireWallet>` renders during `hydrating-storage` and `checking-browser-wallet`. Visually consistent with the existing connect-screen loading state.

**Files:**
- Create: `apps/app/src/wallet-boot/BootScreen.tsx`

- [ ] **Step 1: Implement `BootScreen.tsx`**

Create `apps/app/src/wallet-boot/BootScreen.tsx`:

```tsx
import { ActivityIndicator, Text, View } from 'react-native';
import type { WalletBootStatus } from '../state/deriveWalletBootStatus';

type BootScreenProps = {
  status: Extract<WalletBootStatus, 'hydrating-storage' | 'checking-browser-wallet'>;
};

const COPY: Record<BootScreenProps['status'], string> = {
  'hydrating-storage': 'Loading…',
  'checking-browser-wallet': 'Restoring wallet session…',
};

export function BootScreen({ status }: BootScreenProps) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#0a0a0a',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
      }}
      accessibilityRole="alert"
      accessibilityLabel={COPY[status]}
    >
      <ActivityIndicator size="small" color="#a1a1aa" />
      <Text style={{ color: '#a1a1aa', fontSize: 14 }}>{COPY[status]}</Text>
    </View>
  );
}
```

- [ ] **Step 2: Verify compilation by running typecheck**

Run: `pnpm --filter @clmm/app typecheck`

Expected: typecheck passes (BootScreen has no test in this task; integration tests in Task 9 exercise it).

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/wallet-boot/BootScreen.tsx
git commit -m "feat(wallet-boot): add BootScreen component

Centered ActivityIndicator + neutral copy keyed off boot status.
Used by RequireWallet during hydrating-storage and
checking-browser-wallet phases. No new design assets.

Refs #38"
```

---

## Task 6: Boot status context + `useWalletBootStatus` hook

**Why:** A single context surface so route-level code consumes only a read-only hook and the provider implementations (web vs native) share the same consumer API.

**Files:**
- Create: `apps/app/src/wallet-boot/walletBootContext.ts`

- [ ] **Step 1: Implement `walletBootContext.ts`**

Create `apps/app/src/wallet-boot/walletBootContext.ts`:

```ts
import { createContext, useContext } from 'react';
import type { WalletBootStatus } from '../state/deriveWalletBootStatus';

export const WalletBootContext = createContext<WalletBootStatus>('hydrating-storage');

export function useWalletBootStatus(): WalletBootStatus {
  return useContext(WalletBootContext);
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @clmm/app typecheck`

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/wallet-boot/walletBootContext.ts
git commit -m "feat(wallet-boot): add walletBootContext + useWalletBootStatus

Single read-only React context shared by web and native provider
implementations. Default value is hydrating-storage so consumers
mounted outside a provider see the safe boot value.

Refs #38"
```

---

## Task 7: `WalletBootProvider` (web) — owns connector subscription + watchdog

**Why:** The web provider is the heart of the change. It reads `useConnector()`, tracks `hasSeenConnectorInflight`, owns the single 1500ms watchdog, calls `deriveWalletBootStatus`, and publishes the result through `WalletBootContext`.

**Files:**
- Create: `apps/app/src/wallet-boot/WalletBootProvider.web.tsx`
- Create: `apps/app/src/wallet-boot/WalletBootProvider.web.test.tsx`

- [ ] **Step 1: Write the failing integration test**

Create `apps/app/src/wallet-boot/WalletBootProvider.web.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { WalletStatus } from '@solana/connector';

vi.mock('@react-native-async-storage/async-storage', () => {
  const mem = new Map<string, string>();
  return {
    default: {
      setItem: vi.fn((k: string, v: string) => { mem.set(k, v); return Promise.resolve(); }),
      getItem: vi.fn((k: string) => Promise.resolve(mem.get(k) ?? null)),
      removeItem: vi.fn((k: string) => { mem.delete(k); return Promise.resolve(); }),
      clear: vi.fn(() => { mem.clear(); return Promise.resolve(); }),
    },
  };
});

let connectorState: { walletStatus: WalletStatus; account: string | null } = {
  walletStatus: { status: 'disconnected' },
  account: null,
};
const connectorListeners = new Set<() => void>();
function setConnector(next: { walletStatus: WalletStatus; account: string | null }) {
  connectorState = next;
  connectorListeners.forEach((l) => l());
}

vi.mock('@solana/connector', () => {
  const { useSyncExternalStore } = require('react');
  return {
    useConnector: () =>
      useSyncExternalStore(
        (l: () => void) => { connectorListeners.add(l); return () => connectorListeners.delete(l); },
        () => connectorState,
        () => connectorState,
      ),
  };
});

import { walletSessionStore } from '../state/walletSessionStore';
import { WalletBootProvider } from './WalletBootProvider.web';
import { useWalletBootStatus } from './walletBootContext';

function Probe() {
  const status = useWalletBootStatus();
  return <span data-testid="status">{status}</span>;
}

const ADDR = 'DemoWallet1111111111111111111111111111111111';

beforeEach(() => {
  vi.useFakeTimers();
  setConnector({ walletStatus: { status: 'disconnected' }, account: null });
  walletSessionStore.setState({
    walletAddress: null,
    connectionKind: null,
    hasHydrated: true,
    lastConnectedAt: null,
    isConnecting: false,
    connectionOutcome: null,
    platformCapabilities: null,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('WalletBootProvider (web)', () => {
  it('starts in checking-browser-wallet for a persisted browser candidate', () => {
    walletSessionStore.setState({ walletAddress: ADDR, connectionKind: 'browser' });
    render(<WalletBootProvider><Probe /></WalletBootProvider>);
    expect(screen.getByTestId('status').textContent).toBe('checking-browser-wallet');
  });

  it('resolves to connected when connector reaches connected with matching account', () => {
    walletSessionStore.setState({ walletAddress: ADDR, connectionKind: 'browser' });
    render(<WalletBootProvider><Probe /></WalletBootProvider>);
    act(() => {
      setConnector({ walletStatus: { status: 'connecting', connectorId: 'phantom' as never }, account: null });
    });
    expect(screen.getByTestId('status').textContent).toBe('checking-browser-wallet');
    act(() => {
      setConnector({ walletStatus: { status: 'connected', session: {} as never }, account: ADDR });
    });
    expect(screen.getByTestId('status').textContent).toBe('connected');
  });

  it('resolves to disconnected when connector returns to disconnected after being inflight', () => {
    walletSessionStore.setState({ walletAddress: ADDR, connectionKind: 'browser' });
    render(<WalletBootProvider><Probe /></WalletBootProvider>);
    act(() => {
      setConnector({ walletStatus: { status: 'connecting', connectorId: 'phantom' as never }, account: null });
    });
    act(() => {
      setConnector({ walletStatus: { status: 'disconnected' }, account: null });
    });
    expect(screen.getByTestId('status').textContent).toBe('disconnected');
  });

  it('resolves to disconnected after the 1500ms watchdog when the connector never moves', () => {
    walletSessionStore.setState({ walletAddress: ADDR, connectionKind: 'browser' });
    render(<WalletBootProvider><Probe /></WalletBootProvider>);
    expect(screen.getByTestId('status').textContent).toBe('checking-browser-wallet');
    act(() => { vi.advanceTimersByTime(1500); });
    expect(screen.getByTestId('status').textContent).toBe('disconnected');
  });

  it('returns connected for a persisted native session with no connector activity', () => {
    walletSessionStore.setState({ walletAddress: ADDR, connectionKind: 'native' });
    render(<WalletBootProvider><Probe /></WalletBootProvider>);
    expect(screen.getByTestId('status').textContent).toBe('connected');
  });

  it('returns disconnected when there is no candidate', () => {
    render(<WalletBootProvider><Probe /></WalletBootProvider>);
    expect(screen.getByTestId('status').textContent).toBe('disconnected');
  });

  it('returns hydrating-storage while the store has not hydrated', () => {
    walletSessionStore.setState({ hasHydrated: false, walletAddress: ADDR, connectionKind: 'browser' });
    render(<WalletBootProvider><Probe /></WalletBootProvider>);
    expect(screen.getByTestId('status').textContent).toBe('hydrating-storage');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter @clmm/app test -- src/wallet-boot/WalletBootProvider.web.test.tsx`

Expected: import resolution failure (`WalletBootProvider.web` does not exist yet).

- [ ] **Step 3: Implement `WalletBootProvider.web.tsx`**

Create `apps/app/src/wallet-boot/WalletBootProvider.web.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { useConnector } from '@solana/connector';
import { walletSessionStore } from '../state/walletSessionStore';
import { deriveWalletBootStatus } from '../state/deriveWalletBootStatus';
import { WalletBootContext } from './walletBootContext';

const WATCHDOG_MS = 1500;

export function WalletBootProvider({ children }: { children: ReactNode }) {
  const { walletStatus, account } = useConnector();
  const hasHydrated = useStore(walletSessionStore, (s) => s.hasHydrated);
  const connectionKind = useStore(walletSessionStore, (s) => s.connectionKind);
  const walletAddress = useStore(walletSessionStore, (s) => s.walletAddress);

  const hasBrowserRestoreCandidate =
    connectionKind === 'browser' && walletAddress != null;

  const hasSeenInflightRef = useRef(false);
  if (walletStatus.status === 'connecting' || walletStatus.status === 'connected') {
    hasSeenInflightRef.current = true;
  }

  const [restoreTimedOut, setRestoreTimedOut] = useState(false);

  useEffect(() => {
    if (!hasHydrated || !hasBrowserRestoreCandidate) {
      setRestoreTimedOut(false);
      return;
    }
    const t = setTimeout(() => setRestoreTimedOut(true), WATCHDOG_MS);
    return () => clearTimeout(t);
  }, [hasHydrated, hasBrowserRestoreCandidate]);

  const status = useMemo(
    () =>
      deriveWalletBootStatus({
        hasHydrated,
        connectionKind,
        walletAddress,
        connectorStatus: walletStatus,
        connectorAccount: account,
        hasSeenConnectorInflight: hasSeenInflightRef.current,
        restoreTimedOut,
      }),
    [hasHydrated, connectionKind, walletAddress, walletStatus, account, restoreTimedOut],
  );

  return (
    <WalletBootContext.Provider value={status}>
      {children}
    </WalletBootContext.Provider>
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter @clmm/app test -- src/wallet-boot/WalletBootProvider.web.test.tsx`

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/wallet-boot/WalletBootProvider.web.tsx apps/app/src/wallet-boot/WalletBootProvider.web.test.tsx
git commit -m "feat(wallet-boot): add web WalletBootProvider with watchdog

Subscribes to @solana/connector walletStatus and account, tracks
whether the connector has ever been observed inflight, owns the
single 1500ms autoConnect watchdog, and publishes the derived
WalletBootStatus through context.

Refs #38"
```

---

## Task 8: `WalletBootProvider` (native + default) shells

**Why:** `useConnector()` from `@solana/connector` is web-only. The native bundle still needs `useWalletBootStatus()` to return a sensible value so route code is platform-uniform. The native shell feeds constant inputs into `deriveWalletBootStatus` that resolve to `connected` for persisted native sessions and `disconnected` otherwise. The default `.tsx` re-exports the native shell to give SSR/test environments a safe default.

**Files:**
- Create: `apps/app/src/wallet-boot/WalletBootProvider.native.tsx`
- Create: `apps/app/src/wallet-boot/WalletBootProvider.tsx`

- [ ] **Step 1: Implement `WalletBootProvider.native.tsx`**

Create `apps/app/src/wallet-boot/WalletBootProvider.native.tsx`:

```tsx
import { useMemo, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { walletSessionStore } from '../state/walletSessionStore';
import { deriveWalletBootStatus } from '../state/deriveWalletBootStatus';
import { WalletBootContext } from './walletBootContext';

export function WalletBootProvider({ children }: { children: ReactNode }) {
  const hasHydrated = useStore(walletSessionStore, (s) => s.hasHydrated);
  const connectionKind = useStore(walletSessionStore, (s) => s.connectionKind);
  const walletAddress = useStore(walletSessionStore, (s) => s.walletAddress);

  const status = useMemo(
    () =>
      deriveWalletBootStatus({
        hasHydrated,
        connectionKind,
        walletAddress,
        // Native bundle has no @solana/connector. Feed the derive function
        // values that make it resolve via the native or default branches:
        connectorStatus: { status: 'disconnected' },
        connectorAccount: null,
        hasSeenConnectorInflight: true,
        restoreTimedOut: true,
      }),
    [hasHydrated, connectionKind, walletAddress],
  );

  return (
    <WalletBootContext.Provider value={status}>
      {children}
    </WalletBootContext.Provider>
  );
}
```

- [ ] **Step 2: Implement default `WalletBootProvider.tsx`**

Create `apps/app/src/wallet-boot/WalletBootProvider.tsx` (re-export the native shell as the safe default):

```tsx
export { WalletBootProvider } from './WalletBootProvider.native';
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter @clmm/app typecheck`

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/wallet-boot/WalletBootProvider.native.tsx apps/app/src/wallet-boot/WalletBootProvider.tsx
git commit -m "feat(wallet-boot): add native + default WalletBootProvider shells

Native bundle has no @solana/connector. The shell feeds constant
inputs into deriveWalletBootStatus so persisted native sessions
resolve to connected and other states resolve to disconnected.
The default .tsx re-exports the native shell for SSR/test envs.

Refs #38"
```

---

## Task 9: `<RequireWallet>` wrapper

**Why:** Single protected-route entry point. Reads `useWalletBootStatus()`; renders `<BootScreen>` during boot, fires `navigateRoute(...)` to `/connect?returnTo=…` when disconnected, and renders children when connected. Routes never branch on hydration / connector state directly.

**Files:**
- Create: `apps/app/src/wallet-boot/RequireWallet.tsx`
- Create: `apps/app/src/wallet-boot/RequireWallet.test.tsx`

- [ ] **Step 1: Write the failing integration test**

Create `apps/app/src/wallet-boot/RequireWallet.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type { WalletBootStatus } from '../state/deriveWalletBootStatus';
import { WalletBootContext } from './walletBootContext';

const navigateMock = vi.fn();
vi.mock('../platform/webNavigation', () => ({
  navigateRoute: (...args: unknown[]) => navigateMock(...args),
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => mockPathname,
  useGlobalSearchParams: () => mockSearch,
}));

let mockPathname = '/positions/abc';
let mockSearch: Record<string, string | string[] | undefined> = {};

import { RequireWallet } from './RequireWallet';

function Harness({ initial }: { initial: WalletBootStatus }) {
  const [status, setStatus] = useState<WalletBootStatus>(initial);
  return (
    <WalletBootContext.Provider value={status}>
      <RequireWallet>
        <span data-testid="children">child content</span>
      </RequireWallet>
      <button data-testid="set-connected" onClick={() => setStatus('connected')}>c</button>
      <button data-testid="set-disconnected" onClick={() => setStatus('disconnected')}>d</button>
    </WalletBootContext.Provider>
  );
}

beforeEach(() => {
  navigateMock.mockReset();
  mockPathname = '/positions/abc';
  mockSearch = {};
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('RequireWallet', () => {
  it('renders BootScreen when status is hydrating-storage', () => {
    render(<Harness initial="hydrating-storage" />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(screen.queryByTestId('children')).toBeNull();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('renders BootScreen when status is checking-browser-wallet', () => {
    render(<Harness initial="checking-browser-wallet" />);
    expect(screen.getByText('Restoring wallet session…')).toBeTruthy();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('renders children when status is connected', () => {
    render(<Harness initial="connected" />);
    expect(screen.getByTestId('children')).toBeTruthy();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('navigates to /connect with encoded returnTo when status is disconnected', () => {
    mockPathname = '/preview/abc';
    mockSearch = { triggerId: 'xyz' };
    render(<Harness initial="disconnected" />);
    expect(navigateMock).toHaveBeenCalledTimes(1);
    const call = navigateMock.mock.calls[0]![0] as { path: string; method: string };
    expect(call.method).toBe('push');
    expect(call.path).toBe('/connect?returnTo=' + encodeURIComponent('/preview/abc?triggerId=xyz'));
    expect(screen.queryByTestId('children')).toBeNull();
  });

  it('does not call navigate again if status flips back to connected', () => {
    render(<Harness initial="disconnected" />);
    expect(navigateMock).toHaveBeenCalledTimes(1);
    act(() => { screen.getByTestId('set-connected').click(); });
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('children')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter @clmm/app test -- src/wallet-boot/RequireWallet.test.tsx`

Expected: import resolution failure (`RequireWallet` does not exist yet).

- [ ] **Step 3: Implement `RequireWallet.tsx`**

Create `apps/app/src/wallet-boot/RequireWallet.tsx`:

```tsx
import { useEffect, type ReactNode } from 'react';
import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { navigateRoute } from '../platform/webNavigation';
import { BootScreen } from './BootScreen';
import { buildReturnToPath, type SearchParamRecord } from './buildReturnToPath';
import { useWalletBootStatus } from './walletBootContext';

export function RequireWallet({ children }: { children: ReactNode }) {
  const status = useWalletBootStatus();
  const router = useRouter();
  const pathname = usePathname();
  const search = useGlobalSearchParams() as SearchParamRecord;

  // pathname/search snapshotted at the moment we observe disconnected;
  // we deliberately do not re-fire on subsequent param or router changes.
  useEffect(() => {
    if (status !== 'disconnected') return;
    const fullPath = buildReturnToPath(pathname, search);
    const target = `/connect?returnTo=${encodeURIComponent(fullPath)}`;
    navigateRoute({ router, path: target, method: 'push' });
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'hydrating-storage' || status === 'checking-browser-wallet') {
    return <BootScreen status={status} />;
  }

  if (status === 'disconnected') {
    return null;
  }

  return <>{children}</>;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter @clmm/app test -- src/wallet-boot/RequireWallet.test.tsx`

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/wallet-boot/RequireWallet.tsx apps/app/src/wallet-boot/RequireWallet.test.tsx
git commit -m "feat(wallet-boot): add RequireWallet wrapper component

Single protected-route consumer of useWalletBootStatus(). Renders
BootScreen during boot, fires navigateRoute to /connect with an
encoded returnTo when disconnected, and renders children when
connected. Eliminates per-route hydration/redirect logic.

Refs #38"
```

---

## Task 10: Mount `<WalletBootProvider>` and stop eager-disconnect in `BrowserWalletProvider.web.tsx`

**Why:** Wires the new provider into the web bundle. Also fixes the `BrowserWalletSessionSync` regression: it currently calls `disconnect()` whenever connector reports `!isConnected`, which would wipe the persisted browser candidate during the boot window and defeat the watchdog.

**Files:**
- Modify: `apps/app/src/platform/browserWallet/BrowserWalletProvider.web.tsx`

- [ ] **Step 1: Update `BrowserWalletProvider.web.tsx`**

Replace the contents of `apps/app/src/platform/browserWallet/BrowserWalletProvider.web.tsx` with:

```tsx
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { AppProvider, getDefaultConfig, getDefaultMobileConfig, useConnector } from '@solana/connector';
import { walletSessionStore } from '../../state/walletSessionStore';
import { WalletBootProvider } from '../../wallet-boot/WalletBootProvider.web';

const connectorConfig = getDefaultConfig({
  appName: 'CLMM V2',
  appUrl: 'https://clmm.v2.app',
  autoConnect: true,
  enableMobile: true,
  network: 'mainnet',
});

const mobileConfig = getDefaultMobileConfig({
  appName: 'CLMM V2',
  appUrl: 'https://clmm.v2.app',
  network: 'mainnet',
});

function BrowserWalletSessionSync() {
  const { isConnected, account } = useConnector();

  useEffect(() => {
    if (isConnected && account) {
      const store = walletSessionStore.getState();
      if (store.walletAddress === account && store.connectionKind === 'browser') return;
      store.markConnected({ walletAddress: account, connectionKind: 'browser' });
    }
    // Intentionally no else-disconnect. The boot controller owns the
    // checking-browser-wallet -> disconnected transition; explicit user
    // disconnects go through the wallet/settings UI.
  }, [isConnected, account]);

  return null;
}

export function BrowserWalletProvider({ children }: { children: ReactNode }) {
  return (
    <AppProvider connectorConfig={connectorConfig} mobile={mobileConfig}>
      <BrowserWalletSessionSync />
      <WalletBootProvider>{children}</WalletBootProvider>
    </AppProvider>
  );
}
```

- [ ] **Step 2: Verify no other test regresses**

Run: `pnpm --filter @clmm/app test`

Expected: full app suite passes (including existing `useBrowserWalletConnect.test.ts`, `useBrowserWalletDisconnect.test.ts`, `useBrowserWalletSign.test.ts`, `walletConnection.test.ts`, `webNavigation.test.ts`, `walletDeepLinks.test.ts`).

If any test fails because it relied on the old eager-disconnect behavior, fix the test to assert the new contract: `BrowserWalletSessionSync` only calls `markConnected` on positive connector state and never calls `disconnect`.

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/platform/browserWallet/BrowserWalletProvider.web.tsx
git commit -m "fix(browser-wallet): mount WalletBootProvider, stop eager-disconnect

Wire WalletBootProvider into the web bundle so protected routes have
a derived boot status to consume. Remove the eager-disconnect branch
in BrowserWalletSessionSync that wiped the persisted browser
candidate during the boot window and defeated the watchdog.

Refs #38"
```

---

## Task 11: Mount native `<WalletBootProvider>` shell in `BrowserWalletProvider.native.tsx`

**Why:** Without this, the native bundle has no `WalletBootContext.Provider` and `useWalletBootStatus()` returns the default `'hydrating-storage'` forever — protected routes would show a permanent boot screen.

**Files:**
- Modify: `apps/app/src/platform/browserWallet/BrowserWalletProvider.native.tsx`

- [ ] **Step 1: Update `BrowserWalletProvider.native.tsx`**

Replace the contents of `apps/app/src/platform/browserWallet/BrowserWalletProvider.native.tsx` with:

```tsx
import type { ReactNode } from 'react';
import { WalletBootProvider } from '../../wallet-boot/WalletBootProvider.native';

export function BrowserWalletProvider({ children }: { children: ReactNode }) {
  return <WalletBootProvider>{children}</WalletBootProvider>;
}
```

- [ ] **Step 2: Verify typecheck and tests pass**

Run: `pnpm --filter @clmm/app typecheck && pnpm --filter @clmm/app test`

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/platform/browserWallet/BrowserWalletProvider.native.tsx
git commit -m "feat(browser-wallet): mount native WalletBootProvider shell

Native bundle now provides WalletBootContext via the native shell so
useWalletBootStatus() returns a meaningful value (connected for
persisted native sessions, disconnected otherwise) instead of the
default hydrating-storage.

Refs #38"
```

---

## Task 12: Wire `returnTo` into `connect.tsx`

**Why:** After successful connect, route the user to the path they originally tried to reach instead of always landing on `/(tabs)/positions`.

**Files:**
- Modify: `apps/app/app/connect.tsx`

- [ ] **Step 1: Add the `returnTo` import + parsed value at the top of the component**

Open `apps/app/app/connect.tsx` and apply two changes.

(a) Add this import alongside the existing imports:

```ts
import { parseReturnTo } from '../src/wallet-boot/parseReturnTo';
```

(b) Inside `ConnectRoute()` immediately after `const router = useRouter();` (line 62), add:

```ts
const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
const returnTo = useMemo(() => parseReturnTo(params.returnTo), [params.returnTo]);
```

`useLocalSearchParams` is already exported from `expo-router`; add it to the existing `expo-router` import:

```ts
import { useRouter, useLocalSearchParams } from 'expo-router';
```

`useMemo` is already imported.

- [ ] **Step 2: Replace each post-connect navigation call**

In `handleSelectBrowserWallet` (≈ line 140), `handleConnectDefaultBrowser` (≈ line 155), and `handleConnectNative` (≈ line 170), change:

```ts
navigateRoute({ router, path: '/(tabs)/positions', method: 'replace' });
```

to:

```ts
navigateRoute({ router, path: returnTo, method: 'replace' });
```

Three occurrences total. Leave all other navigation calls (the "Go Back" button, etc.) untouched.

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter @clmm/app typecheck`

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/app/app/connect.tsx
git commit -m "feat(connect): honor returnTo query param after successful connect

connect.tsx now parses the returnTo query param via the validated
parseReturnTo utility and routes the user there after a successful
native or browser connect, instead of always landing on
/(tabs)/positions.

Refs #38"
```

---

## Task 13: Wrap `position/[id].tsx` in `<RequireWallet>`

**Why:** Replaces the inline `hasHydrated && !walletAddress` check with the centralized boot logic. After this change the route file contains only data-fetching logic; the wallet-presence contract is enforced by the wrapper.

**Files:**
- Modify: `apps/app/app/position/[id].tsx`

- [ ] **Step 1: Update `position/[id].tsx`**

Replace the contents of `apps/app/app/position/[id].tsx` with:

```tsx
import { useLocalSearchParams } from 'expo-router';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { PositionDetailScreen } from '@clmm/ui';
import { Text, View } from 'react-native';
import { useStore } from 'zustand';
import { fetchPositionDetail } from '../../src/api/positions';
import { navigateRoute } from '../../src/platform/webNavigation';
import { walletSessionStore } from '../../src/state/walletSessionStore';
import { RequireWallet } from '../../src/wallet-boot/RequireWallet';

export default function PositionDetailRoute() {
  return (
    <RequireWallet>
      <PositionDetailRouteBody />
    </RequireWallet>
  );
}

function PositionDetailRouteBody() {
  const { id, triggerId } = useLocalSearchParams<{
    id?: string | string[];
    triggerId?: string | string[];
  }>();
  const router = useRouter();
  const walletAddress = useStore(walletSessionStore, (state) => state.walletAddress);
  const positionId = typeof id === 'string' ? id : undefined;
  const alertTriggerId = typeof triggerId === 'string' && triggerId.length > 0 ? triggerId : undefined;
  const hasValidPositionId = positionId != null && positionId.length > 0;

  const positionQuery = useQuery({
    queryKey: ['position-detail', walletAddress, positionId],
    queryFn: () => fetchPositionDetail(walletAddress!, positionId!),
    enabled: walletAddress != null && hasValidPositionId,
  });

  if (!hasValidPositionId) {
    return (
      <View style={{ flex: 1, padding: 16, justifyContent: 'center' }}>
        <Text>Position not found.</Text>
      </View>
    );
  }

  if (positionQuery.isError) {
    return (
      <View style={{ flex: 1, padding: 16, justifyContent: 'center' }}>
        <Text>Could not load position detail for this wallet.</Text>
      </View>
    );
  }

  const position = positionQuery.data;

  return (
    <PositionDetailScreen
      {...(position ? { position } : {})}
      onViewPreview={(resolvedTriggerId: string) =>
        navigateRoute({
          router,
          path: `/preview/${alertTriggerId ?? resolvedTriggerId}`,
          method: 'push',
        })
      }
    />
  );
}
```

Note: `walletAddress!` non-null assertion is safe because `<RequireWallet>` only renders children when `status === 'connected'`, which requires a non-null `walletAddress` per the derive ladder.

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @clmm/app typecheck`

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/position/[id].tsx
git commit -m "refactor(routes): wrap position/[id] in RequireWallet

Removes inline hydration + redirect logic in favor of the centralized
RequireWallet wrapper, which honors the WalletBootStatus state machine
and preserves returnTo on redirect.

Refs #38"
```

---

## Task 14: Wrap `preview/[triggerId].tsx` in `<RequireWallet>`

**Files:**
- Modify: `apps/app/app/preview/[triggerId].tsx`

- [ ] **Step 1: Update `preview/[triggerId].tsx`**

Replace the contents of `apps/app/app/preview/[triggerId].tsx` with:

```tsx
import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { ExecutionPreviewScreen } from '@clmm/ui';
import { useStore } from 'zustand';
import { createPreview, refreshPreview } from '../../src/api/previews';
import { navigateRoute } from '../../src/platform/webNavigation';
import { walletSessionStore } from '../../src/state/walletSessionStore';
import { RequireWallet } from '../../src/wallet-boot/RequireWallet';

function readTriggerId(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export default function PreviewRoute() {
  return (
    <RequireWallet>
      <PreviewRouteBody />
    </RequireWallet>
  );
}

function PreviewRouteBody() {
  const router = useRouter();
  const params = useLocalSearchParams<{ triggerId?: string | string[] }>();
  const triggerId = readTriggerId(params.triggerId);
  const walletAddress = useStore(walletSessionStore, (state) => state.walletAddress);

  const createMutation = useMutation({
    mutationFn: createPreview,
    retry: 0,
  });

  const refreshMutation = useMutation({
    mutationFn: refreshPreview,
    retry: 0,
  });

  useEffect(() => {
    if (triggerId == null) {
      return;
    }
    createMutation.mutate(triggerId);
    // Intentionally depend only on triggerId to avoid mutation-object re-render loops.
  }, [triggerId]);

  const preview = refreshMutation.data ?? createMutation.data;

  return (
    <ExecutionPreviewScreen
      {...(preview != null ? { preview } : {})}
      previewLoading={createMutation.isPending || refreshMutation.isPending}
      previewError={
        createMutation.error instanceof Error
          ? createMutation.error.message
          : refreshMutation.error instanceof Error
            ? refreshMutation.error.message
            : null
      }
      {...(preview != null && walletAddress != null
        ? {
            onApprove: () => {
              const signingParams: {
                attemptId: string;
                previewId: string;
                triggerId?: string;
                episodeId?: string;
              } = {
                attemptId: 'pending',
                previewId: preview.previewId,
              };
              if (triggerId != null) {
                signingParams.triggerId = triggerId;
              }
              if (preview.episodeId != null) {
                signingParams.episodeId = preview.episodeId;
              }

              navigateRoute({
                router,
                path: `/signing/${signingParams.attemptId}?previewId=${encodeURIComponent(
                  signingParams.previewId,
                )}${
                  signingParams.triggerId != null
                    ? `&triggerId=${encodeURIComponent(signingParams.triggerId)}`
                    : ''
                }${
                  signingParams.episodeId != null
                    ? `&episodeId=${encodeURIComponent(signingParams.episodeId)}`
                    : ''
                }`,
                method: 'push',
              });
            },
          }
        : {})}
      {...(triggerId != null
        ? {
            onRefresh: () => {
              refreshMutation.mutate(triggerId);
            },
          }
        : {})}
    />
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @clmm/app typecheck`

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/preview/[triggerId].tsx
git commit -m "refactor(routes): wrap preview/[triggerId] in RequireWallet

Removes inline hydration + redirect logic; the centralized
RequireWallet wrapper now enforces wallet presence and preserves
returnTo on redirect.

Refs #38"
```

---

## Task 15: Wrap `signing/[attemptId].tsx` in `<RequireWallet>`

**Files:**
- Modify: `apps/app/app/signing/[attemptId].tsx`

- [ ] **Step 1: Update `signing/[attemptId].tsx`**

This route is large; do not rewrite the body. Make exactly two changes.

(a) Add the import at the top, alongside the existing imports:

```ts
import { RequireWallet } from '../../src/wallet-boot/RequireWallet';
```

(b) Rename the existing `export default function SigningRoute()` to `function SigningRouteBody()` (drop the `export default`). Then add a new default export below all existing code:

```tsx
export default function SigningRoute() {
  return (
    <RequireWallet>
      <SigningRouteBody />
    </RequireWallet>
  );
}
```

(c) Inside `SigningRouteBody`, **delete** the `useEffect` that performed the inline redirect (lines 82-86 in the current file — the block that calls `navigateRoute({ router, path: '/connect', method: 'push' })` when `attemptId == null && walletAddress == null && hasHydrated`). Also delete the `hasHydrated` selector (line 75) and the unused `useEffect` import if no other effect remains. (At least one other `useEffect` remains in this file — the pending-approval effect — so the import stays.)

(d) Delete the bail-out `if (attemptId == null && walletAddress == null) { return null; }` near the bottom (≈ line 247). This was a defensive guard for the redirect-in-progress state; `<RequireWallet>` now guarantees `walletAddress != null` whenever the body renders, so the only remaining valid case is `attemptId == null && walletAddress != null` — let `SigningStatusScreen` render its existing pending-approval / error states for that case.

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @clmm/app typecheck`

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/signing/[attemptId].tsx
git commit -m "refactor(routes): wrap signing/[attemptId] in RequireWallet

Removes inline hydration + redirect effect and the now-redundant
bail-out guard. RequireWallet enforces wallet presence and preserves
returnTo, including for direct-open of /signing/<attemptId> after a
hard navigation reload.

Refs #38"
```

---

## Task 16: Wrap `execution/[attemptId].tsx` in `<RequireWallet>`

**Why:** Listed as a wrapped route in the spec for consistency, even though the route currently does not read `walletAddress` directly. Wrapping ensures direct-open of execution-result links after a hard nav goes through the same boot ladder as the other protected routes.

**Files:**
- Modify: `apps/app/app/execution/[attemptId].tsx`

- [ ] **Step 1: Update `execution/[attemptId].tsx`**

Replace the contents of `apps/app/app/execution/[attemptId].tsx` with:

```tsx
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ExecutionResultScreen } from '@clmm/ui';
import { fetchExecution } from '../../src/api/executions';
import { navigateRoute } from '../../src/platform/webNavigation';
import { RequireWallet } from '../../src/wallet-boot/RequireWallet';

function readAttemptId(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export default function ExecutionRoute() {
  return (
    <RequireWallet>
      <ExecutionRouteBody />
    </RequireWallet>
  );
}

function ExecutionRouteBody() {
  const router = useRouter();
  const params = useLocalSearchParams<{ attemptId?: string | string[] }>();
  const attemptId = readAttemptId(params.attemptId);

  const executionQuery = useQuery({
    queryKey: ['execution-attempt', attemptId],
    queryFn: () => fetchExecution(attemptId!),
    enabled: attemptId != null,
  });

  return (
    <ExecutionResultScreen
      {...(executionQuery.data != null
        ? {
            lifecycleState: executionQuery.data.lifecycleState,
            breachDirection: executionQuery.data.breachDirection,
            retryEligible: executionQuery.data.retryEligible,
            ...(executionQuery.data.transactionReferences[0]?.signature != null
              ? { transactionSignature: executionQuery.data.transactionReferences[0].signature }
              : {}),
          }
        : {})}
      resultLoading={executionQuery.isLoading}
      resultError={executionQuery.error instanceof Error ? executionQuery.error.message : null}
      onViewHistory={() => {
        navigateRoute({
          router,
          path: '/(tabs)/history',
          method: 'push',
        });
      }}
    />
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @clmm/app typecheck`

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/execution/[attemptId].tsx
git commit -m "refactor(routes): wrap execution/[attemptId] in RequireWallet

Brings the execution result route under the same protected-route
contract as position, preview, and signing.

Refs #38"
```

---

## Task 17: Full repo verification

**Why:** Per `AGENTS.md`, run the full verification gate before declaring work complete. This change touches `apps/app` shared state.

**Files:** none (commands only)

- [ ] **Step 1: Run typecheck across the repo**

Run: `pnpm typecheck`

Expected: pass.

- [ ] **Step 2: Run lint across the repo**

Run: `pnpm lint`

Expected: pass. If `RequireWallet.tsx` produces an `react-hooks/exhaustive-deps` warning despite the inline disable, narrow the disable to that line only.

- [ ] **Step 3: Run boundaries**

Run: `pnpm boundaries`

Expected: pass. (The new files live in `apps/app/src/state/` and `apps/app/src/wallet-boot/`, which are app-internal. Imports cross only `app → app` and `app → @solana/connector` — both already established.)

- [ ] **Step 4: Run the full test suite**

Run: `pnpm test`

Expected: all tests pass, including the new ones added in Tasks 1, 2, 3, 4, 7, 9.

- [ ] **Step 5: Run a final build**

Run: `pnpm build`

Expected: pass.

- [ ] **Step 6: Commit any incidental fixes from steps 1-5**

If lint/typecheck/build forced an incidental fix, stage and commit it now:

```bash
git add -p
git commit -m "chore(wallet-boot): incidental fixes from full verification

Refs #38"
```

If nothing changed, skip this commit.

---

## Task 18: Manual device verification (PR description)

**Why:** Issue #38's acceptance criteria require on-device verification in Phantom mobile and desktop Chrome with Phantom extension. These cannot be automated in this repo; document them in the PR description as a checklist that must be ticked before merge.

**Files:** none in this branch — content goes into the PR description when the PR is opened.

- [ ] **Step 1: Capture the verification checklist**

When opening the PR for this branch, paste this checklist into the PR description under "Manual verification":

```
### Manual verification

#### Phantom mobile browser (iOS or Android)
- [ ] Connect from /connect; hard-nav to /positions; reload — stays on /positions
- [ ] Direct-open /position/<id> with prior session — boot screen flashes, lands on position
- [ ] Direct-open /preview/<triggerId> with prior session — boot screen, lands on preview
- [ ] Direct-open /signing/<attemptId> with prior session — boot screen, lands on signing
- [ ] Direct-open /preview/<triggerId> while truly disconnected — redirects to /connect?returnTo=...; reconnect returns to original /preview path

#### Desktop Chrome with Phantom extension
- [ ] Soft-nav still works (no hard reload between Expo Router routes)
- [ ] Refresh on a protected route restores via boot screen, no false redirect
- [ ] Truly disconnected user lands on /connect when opening a protected route directly
```

- [ ] **Step 2: No commit**

This task produces no code change — the artifact lives in the PR description.

---

## Self-Review Checklist

(Run by the engineer after completing all tasks before PR open.)

- [ ] All boxes above are ticked.
- [ ] `pnpm typecheck && pnpm lint && pnpm boundaries && pnpm test && pnpm build` all green.
- [ ] No `walletBootStatus` field added to `walletSessionStore` — boot status is only ever derived.
- [ ] `BrowserWalletSessionSync` no longer contains an `else if (... store.disconnect())` branch.
- [ ] `partialize` no longer has a `connectionKind === 'browser'` branch.
- [ ] No protected route file imports `hasHydrated` from `walletSessionStore`.
- [ ] No protected route file calls `navigateRoute({ ..., path: '/connect', ... })` from inside its body — only `<RequireWallet>` does.
- [ ] `connect.tsx` uses `returnTo` (not `'/(tabs)/positions'`) in all three `handleConnect*` post-connect navigations.
- [ ] Manual verification checklist (Task 18) is in the PR description.
