# Positions Tab Supported Positions Fetch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the connected Positions tab actually load supported Orca CLMM positions for the connected wallet from the BFF, so connected wallets with active positions do not incorrectly see the empty-state copy.

**Architecture:** Add a small app-local BFF client for supported positions, then wire the positions route to TanStack Query using the connected wallet address as the query key. Keep `packages/ui` presentational by extending `PositionsListScreen` with explicit loading and error props instead of moving fetch logic into UI.

**Tech Stack:** TypeScript strict, TanStack Query v5, Expo Router, React Native/Expo web, NestJS BFF positions controller, Vitest.

---

## Investigation Summary

- `apps/app/app/(tabs)/positions.tsx` never fetches positions and never passes a `positions` prop. It only passes `walletAddress`, `platformCapabilities`, and `onConnectWallet`.
- `packages/ui/src/screens/PositionsListScreen.tsx` treats `positions ?? []` as the connected state input, so a connected wallet with no fetched data is indistinguishable from a connected wallet with truly zero supported positions.
- The BFF path already exists in `packages/adapters/src/inbound/http/PositionController.ts` as `GET /positions/:walletId`, so the missing piece is app-side query wiring, not Orca adapter implementation.
- There is no existing app-local fetch client or query helper for positions, alerts, or history in `apps/app/src`, so this work needs a small fetch layer.

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `apps/app/src/api/http.ts` | Shared minimal JSON fetch helper for BFF calls with base URL resolution and consistent error handling |
| Create | `apps/app/src/api/positions.ts` | `fetchSupportedPositions(walletAddress)` client for `GET /positions/:walletId` |
| Create | `apps/app/src/api/positions.test.ts` | TDD for URL construction, response parsing, and controlled fetch errors |
| Modify | `apps/app/app/(tabs)/positions.tsx` | Wire TanStack Query to wallet address, pass loading/error/data props into `PositionsListScreen` |
| Modify | `packages/ui/src/screens/PositionsListScreen.tsx` | Distinguish disconnected, loading, error, connected-empty, and connected-with-positions states |
| Create | `packages/ui/src/screens/PositionsListScreen.test.tsx` | Lightweight file-level regression tests for new screen state branching via source assertions |
| Optional Modify | `apps/app/package.json` | Add any missing test/runtime dependency only if the fetch helper tests need it |

---

## Task 1: App BFF Client For Supported Positions

**Files:**
- Create: `apps/app/src/api/http.ts`
- Create: `apps/app/src/api/positions.ts`
- Create: `apps/app/src/api/positions.test.ts`

### Step 1.1: Write the failing fetchSupportedPositions tests

- [ ] Create `apps/app/src/api/positions.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PositionSummaryDto } from '@clmm/application/public';
import { fetchSupportedPositions } from './positions.js';

const ORIGINAL_FETCH = globalThis.fetch;

describe('fetchSupportedPositions', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it('requests supported positions from the BFF using the wallet id path', async () => {
    const positions: PositionSummaryDto[] = [
      {
        positionId: 'Position1111111111111111111111111111111111',
        poolId: 'Pool111111111111111111111111111111111111111',
        rangeState: 'in-range',
        hasActionableTrigger: false,
        monitoringStatus: 'active',
      },
    ];

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ positions }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(
      fetchSupportedPositions('DemoWallet1111111111111111111111111111111111'),
    ).resolves.toEqual(positions);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/positions/DemoWallet1111111111111111111111111111111111',
      { method: 'GET' },
    );
  });

  it('throws a controlled error when the BFF request fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'service unavailable',
    }) as typeof fetch;

    await expect(
      fetchSupportedPositions('DemoWallet1111111111111111111111111111111111'),
    ).rejects.toThrow('Could not load supported positions for this wallet');
  });

  it('throws a controlled error when the BFF payload is malformed', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ nope: [] }),
    }) as typeof fetch;

    await expect(
      fetchSupportedPositions('DemoWallet1111111111111111111111111111111111'),
    ).rejects.toThrow('Could not load supported positions for this wallet');
  });
});
```

- [ ] Run the test to verify it fails:

Run: `pnpm vitest run --config vitest.config.ts src/api/positions.test.ts`
Expected: FAIL with module not found for `./positions.js`

### Step 1.2: Implement minimal BFF fetch helpers

- [ ] Create `apps/app/src/api/http.ts`:

```ts
export function getBffBaseUrl(): string {
  return 'http://localhost:3001';
}

export async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(`${getBffBaseUrl()}${path}`, { method: 'GET' });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}
```

- [ ] Create `apps/app/src/api/positions.ts`:

```ts
import type { PositionSummaryDto } from '@clmm/application/public';
import { fetchJson } from './http.js';

type PositionsResponse = {
  positions: PositionSummaryDto[];
};

function isPositionSummaryDtoArray(value: unknown): value is PositionSummaryDto[] {
  return Array.isArray(value);
}

export async function fetchSupportedPositions(walletAddress: string): Promise<PositionSummaryDto[]> {
  try {
    const payload = await fetchJson(`/positions/${walletAddress}`) as Partial<PositionsResponse>;

    if (!isPositionSummaryDtoArray(payload.positions)) {
      throw new Error('Malformed positions response');
    }

    return payload.positions;
  } catch {
    throw new Error('Could not load supported positions for this wallet');
  }
}
```

- [ ] Run the tests to verify they pass:

Run: `pnpm vitest run --config vitest.config.ts src/api/positions.test.ts`
Expected: PASS (3 tests)

### Step 1.3: Commit

- [ ] Commit:

```bash
git add apps/app/src/api/http.ts apps/app/src/api/positions.ts apps/app/src/api/positions.test.ts
git commit -m "feat(app): add supported positions BFF client

Adds app-side positions fetch helper for the connected wallet and covers URL, error, and payload handling."
```

---

## Task 2: Wire Positions Route To TanStack Query

**Files:**
- Modify: `apps/app/app/(tabs)/positions.tsx`

### Step 2.1: Write the failing route regression test

- [ ] Append to `apps/app/src/appShellDependencies.test.ts`:

```ts
  it('wires the positions route to the supported positions BFF client', () => {
    const routeSource = readText('../app/(tabs)/positions.tsx');

    expect(routeSource).toContain('useQuery');
    expect(routeSource).toContain('fetchSupportedPositions');
    expect(routeSource).toContain("queryKey: ['supported-positions', walletAddress]");
    expect(routeSource).toContain('enabled: walletAddress != null && walletAddress.length > 0');
    expect(routeSource).toContain('positions={positionsQuery.data}');
  });
```

- [ ] Run the test to verify it fails:

Run: `pnpm vitest run --config vitest.config.ts src/appShellDependencies.test.ts`
Expected: FAIL because `positions.tsx` does not yet contain query wiring

### Step 2.2: Implement route query wiring

- [ ] Replace `apps/app/app/(tabs)/positions.tsx` with:

```tsx
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { PositionsListScreen } from '@clmm/ui';
import { useStore } from 'zustand';
import { fetchSupportedPositions } from '../../src/api/positions.js';
import { walletSessionStore } from '../../src/state/walletSessionStore.js';

export default function PositionsRoute() {
  const router = useRouter();
  const walletAddress = useStore(walletSessionStore, (state) => state.walletAddress);
  const platformCapabilities = useStore(walletSessionStore, (state) => state.platformCapabilities);

  const positionsQuery = useQuery({
    queryKey: ['supported-positions', walletAddress],
    queryFn: () => fetchSupportedPositions(walletAddress!),
    enabled: walletAddress != null && walletAddress.length > 0,
  });

  return (
    <PositionsListScreen
      walletAddress={walletAddress}
      positions={positionsQuery.data}
      positionsLoading={positionsQuery.isLoading}
      positionsError={positionsQuery.isError ? 'Could not load supported positions for this wallet.' : null}
      platformCapabilities={platformCapabilities}
      onConnectWallet={() => router.push('/connect')}
    />
  );
}
```

- [ ] Run the regression test to verify it passes:

Run: `pnpm vitest run --config vitest.config.ts src/appShellDependencies.test.ts`
Expected: PASS

### Step 2.3: Commit

- [ ] Commit:

```bash
git add apps/app/app/(tabs)/positions.tsx apps/app/src/appShellDependencies.test.ts
git commit -m "feat(app): load supported positions in positions tab

Wires the connected positions tab to TanStack Query and the BFF positions endpoint keyed by wallet address."
```

---

## Task 3: Add Loading And Error States To PositionsListScreen

**Files:**
- Modify: `packages/ui/src/screens/PositionsListScreen.tsx`
- Create: `packages/ui/src/screens/PositionsListScreen.test.tsx`

### Step 3.1: Write the failing state-branch tests

- [ ] Create `packages/ui/src/screens/PositionsListScreen.test.tsx`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readScreenSource(): string {
  return readFileSync(new URL('./PositionsListScreen.tsx', import.meta.url), 'utf8');
}

describe('PositionsListScreen source guards', () => {
  it('renders a loading state for connected wallets while positions are fetching', () => {
    const source = readScreenSource();

    expect(source).toContain('positionsLoading');
    expect(source).toContain('Loading supported Orca positions');
  });

  it('renders an error state for connected wallets when the fetch fails', () => {
    const source = readScreenSource();

    expect(source).toContain('positionsError');
    expect(source).toContain('Could not load supported positions');
  });
});
```

- [ ] Run the test to verify it fails:

Run: `pnpm vitest run packages/ui/src/screens/PositionsListScreen.test.tsx`
Expected: FAIL because the screen does not yet contain loading/error state handling

### Step 3.2: Implement minimal screen states

- [ ] Update `packages/ui/src/screens/PositionsListScreen.tsx` props and state branching:

```tsx
type Props = {
  walletAddress?: string | null;
  positions?: PositionSummaryDto[];
  positionsLoading?: boolean;
  positionsError?: string | null;
  onSelectPosition?: (positionId: string) => void;
  onConnectWallet?: () => void;
  platformCapabilities?: PlatformCapabilities | null;
};
```

- [ ] Add connected loading state just before the existing `ConnectedPositionsList` render:

```tsx
      {!isConnected ? (
        <ConnectWalletEntry {...(onConnectWallet != null ? { onConnectWallet } : {})} />
      ) : positionsLoading ? (
        <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 }}>
          <Text style={{
            color: colors.text,
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            textAlign: 'center',
          }}>
            Loading supported Orca positions
          </Text>
          <Text style={{
            color: colors.textSecondary,
            fontSize: typography.fontSize.base,
            textAlign: 'center',
            marginTop: 8,
          }}>
            Checking this wallet for supported concentrated liquidity positions.
          </Text>
        </View>
      ) : positionsError ? (
        <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 }}>
          <Text style={{
            color: colors.text,
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            textAlign: 'center',
          }}>
            Could not load supported positions
          </Text>
          <Text style={{
            color: colors.textSecondary,
            fontSize: typography.fontSize.base,
            textAlign: 'center',
            marginTop: 8,
            lineHeight: typography.fontSize.base * typography.lineHeight.normal,
          }}>
            {positionsError}
          </Text>
        </View>
      ) : (
        <ConnectedPositionsList
          positions={positions ?? []}
          {...(onSelectPosition != null ? { onSelectPosition } : {})}
        />
      )}
```

- [ ] Run the UI regression test to verify it passes:

Run: `pnpm vitest run packages/ui/src/screens/PositionsListScreen.test.tsx`
Expected: PASS (2 tests)

### Step 3.3: Commit

- [ ] Commit:

```bash
git add packages/ui/src/screens/PositionsListScreen.tsx packages/ui/src/screens/PositionsListScreen.test.tsx
git commit -m "feat(ui): add loading and error states to positions screen

Distinguishes connected loading and fetch failure from the true connected-empty positions state."
```

---

## Task 4: End-To-End Verification For Connected Positions Flow

**Files:**
- Modify: none expected unless verification finds a gap

### Step 4.1: Run app tests

- [ ] Run:

Run: `pnpm --filter @clmm/app test`
Expected: PASS

### Step 4.2: Run app typecheck

- [ ] Run:

Run: `pnpm --filter @clmm/app typecheck`
Expected: PASS

### Step 4.3: Run UI tests touched by the change

- [ ] Run:

Run: `pnpm vitest run packages/ui/src/screens/PositionsListScreen.test.tsx`
Expected: PASS

### Step 4.4: Run Expo web export

- [ ] Run:

Run: `pnpm --filter @clmm/app build`
Expected: PASS with no regression to the prior Ledger or Orca web-bundle failures

### Step 4.5: Manual verification

- [ ] Start app and API separately:

Run: `pnpm dev:api`
Expected: BFF listens on port `3001`

- [ ] In another terminal start the app:

Run: `pnpm --filter @clmm/app dev:web`
Expected: Browser app loads

- [ ] Connect the wallet that owns the Orca SOL/USDC CLMM position
Expected: Positions tab shows at least one position card instead of the connected-empty message

- [ ] Disconnect network or stop the API temporarily
Expected: Positions tab shows the new connected-error state instead of the false empty state

### Step 4.6: Commit

- [ ] Commit:

```bash
git add apps/app/app/(tabs)/positions.tsx apps/app/src/api/http.ts apps/app/src/api/positions.ts apps/app/src/api/positions.test.ts apps/app/src/appShellDependencies.test.ts packages/ui/src/screens/PositionsListScreen.tsx packages/ui/src/screens/PositionsListScreen.test.tsx
git commit -m "fix(app): load supported Orca positions for connected wallets

Fetches positions from the BFF for the connected wallet and separates loading and error states from the true empty state."
```

---

## Spec Coverage Matrix

| Requirement | Task |
|---|---|
| Connected wallet should not default to the empty state without a real positions lookup | Task 2 |
| Existing BFF `/positions/:walletId` endpoint should be used instead of adding client-side Orca reads | Task 1, Task 2 |
| UI must distinguish loading, error, true empty, and disconnected states | Task 3 |
| Web bundle must remain safe after route wiring | Task 4 |
| Manual verification must confirm a real Orca position shows in the app | Task 4 |
