# Cross-Platform Wallet Connect Design

## Goal

Make wallet connection work end-to-end from the existing UI on both web and native.
The Positions screen must navigate to `/connect`, the connect screen must stop spinning and show real wallet options, a successful connection must persist app-local wallet session state, and the app must return to the Positions tab showing connected state.

This design is scoped to app-shell wiring and wallet session orchestration. It does not change domain policy, exit direction mapping, execution planning, or backend behavior.

## Current Problem

Story 6.8 added presentational UI in `packages/ui`, but the app shell in `apps/app` still uses thin re-export route files.

That creates two failures:

1. `apps/app/app/(tabs)/positions.tsx` does not pass `onConnectWallet`, so the button is a no-op.
2. `apps/app/app/connect.tsx` does not pass `platformCapabilities`, so `WalletConnectScreen` stays on the loading spinner forever.

Additionally, the app has no wallet session state in `apps/app`, and the current `connectWalletSession` application use case is not a real wallet connection flow. It only creates execution-session records for later execution lifecycle work.

## Selected Approach

Use an app-local wallet session layer in `apps/app` and keep `packages/ui` presentational.

Why this approach:

- It preserves repo boundaries: UI remains prop-driven, app shell owns navigation and platform integration.
- It supports shared state across Positions, Connect, and Wallet/Settings screens.
- It allows cross-platform wallet behavior without leaking router or browser APIs into `packages/ui`.
- It matches the existing monorepo structure where `apps/app` owns composition and platform edge logic.

## Architecture

### 1. App-local wallet session store

Add a small Zustand store under `apps/app/src/` as the app-level source of truth for wallet connection state.

The store will hold:

- `walletAddress: string | null`
- `connectionKind: 'native' | 'browser' | null`
- `connectionOutcome: ConnectionOutcome | null`
- `platformCapabilities: PlatformCapabilityState | null`
- `isConnecting: boolean`

The store will expose actions to:

- load platform capabilities
- begin a connection attempt
- mark connected
- mark failed / cancelled / interrupted
- disconnect
- clear stale outcome messages when appropriate

This state is app-local and ephemeral for now. It does not introduce durable wallet persistence.

### 2. Real route components in `apps/app/app/`

Replace thin re-export route files for wallet-related routes with app-shell route components that read from the store and wire navigation.

Affected routes:

- `app/(tabs)/positions.tsx`
- `app/connect.tsx`
- `app/(tabs)/wallet.tsx`

Behavior:

- Positions route passes `walletAddress` and `onConnectWallet={() => router.push('/connect')}`.
- Connect route loads capabilities, renders real wallet options, handles connection actions, and on success navigates back to the Positions tab.
- Wallet route reads the same state for connected wallet summary and disconnect behavior.

`packages/ui` remains unchanged except for any strictly necessary prop shape adjustments.

### 3. Platform capability loading

Continue using the existing composition entrypoint in `apps/app/src/composition/index.ts`.

The connect route will call the existing capability adapter to populate `platformCapabilities` in the wallet session store. This resolves the infinite spinner by ensuring the screen gets real capability data instead of `undefined`.

### 4. Web wallet bridge in app shell

Because web is the active testing surface and current dependencies do not include a browser wallet connection package, add a browser wallet integration in `apps/app`.

This bridge must:

- detect a supported wallet provider in the browser
- request connection from the provider
- read the connected public address
- normalize the outcome into the UI-facing `ConnectionOutcome`
- expose a sign callback compatible with later use by the browser signing adapter shape

This bridge belongs in `apps/app/src/platform/` or `apps/app/src/composition/`, not in `packages/ui`.

For MVP scope, the browser bridge should support the installed extension path needed for testing on web. If multiple browser wallets are later supported, the bridge can become a provider selector behind the same app-shell interface.

### 5. Native wallet connect path

Use the native wallet path through the existing mobile wallet adapter stack already present in `packages/adapters`.

The native connect path must:

- trigger wallet authorization
- read the authorized account address
- store the connected address and mark the session as `native`
- map interruptions / declines to existing UI outcomes

If the existing native adapter only supports signing and does not expose an app-shell connect/authorize helper, add a minimal app-shell native connection bridge that uses the documented MWA authorize flow without moving SDK code into UI.

### 6. Navigation flow

Target flow:

1. User lands on Positions while disconnected.
2. Pressing `Connect Wallet` navigates to `/connect`.
3. `/connect` loads platform capabilities and renders available wallet options.
4. User selects a wallet option.
5. Successful connection stores wallet address + connection kind + success outcome.
6. App navigates back to the Positions tab automatically.
7. Positions screen renders connected state using the stored wallet address.
8. Wallet/Settings screen shows the same connected wallet summary and allows disconnect.

### 7. Connection state contract

Use the existing `ConnectionOutcome` shape already defined in `packages/ui`.

Mappings:

- successful provider connect -> `{ kind: 'connected' }`
- explicit user rejection / cancel -> `{ kind: 'cancelled' }`
- interrupted handoff / provider disappearance -> `{ kind: 'interrupted' }`
- other provider errors -> `{ kind: 'failed', reason }`

Store the raw address separately from `ConnectionOutcome`. Do not overload the outcome object with persistent session data.

## Boundaries

### What stays in `packages/ui`

- `PositionsListScreen`
- `WalletConnectScreen`
- `WalletSettingsScreen`
- wallet connection view-models and utils

These remain pure/presentational and receive all state via props.

### What belongs in `apps/app`

- route handlers
- router navigation
- Zustand wallet session store
- platform capability loading
- browser wallet connect bridge
- native wallet connect bridge

### What must not happen

- No router imports in `packages/ui`
- No browser APIs in `packages/ui`
- No new direction/policy logic outside domain
- No fake “connected” state without an actual wallet address
- No backend custody or server-side wallet authority

## Error Handling

Web:

- If no wallet provider is detected, stop loading and show unsupported/no-wallet messaging.
- If the user rejects the connect request, show `cancelled`.
- If provider APIs throw, surface `failed` with a user-safe reason.

Native:

- If authorize is declined, show `cancelled`.
- If the handoff is interrupted, show `interrupted`.
- If native wallet capability is unavailable, show platform notice instead of spinning.

General:

- Always clear `isConnecting` in `finally`-style behavior.
- Avoid leaving the screen in a permanent loading state.
- Preserve the latest outcome so users get visible feedback after a failed attempt.

## Testing Strategy

### App-layer tests

Add tests in `apps/app/src/` for pure logic and store behavior only.

Focus areas:

- wallet session store transitions
- connection outcome mapping from provider/native bridge results
- route helper logic if extracted into pure utilities

### Existing UI tests

Keep `packages/ui` tests focused on pure utils/view-models. Do not add component render tests there.

### Verification

At minimum verify:

- app typecheck
- ui typecheck
- relevant app/store tests
- existing ui tests
- manual web flow: Positions -> Connect -> browser wallet select -> return to Positions

## Open Design Choices Fixed Here

- Use Zustand for shared app-local wallet session state.
- Return to the Positions tab automatically after successful connection.
- Keep wallet state ephemeral for now; no persistence across reloads in this change.
- Implement web support now via app-shell browser wallet bridge since web is the active test platform.

## Out of Scope

- Durable wallet session persistence across app restarts or browser refresh
- Position fetching tied to the connected wallet if that read path is not already wired
- Execution signing flow changes beyond establishing a usable wallet connection state
- Generic multi-wallet management UI beyond the current supported-option screen

## Expected Outcome

After implementation:

- the Positions screen connect CTA works
- the `/connect` screen renders real options instead of spinning forever
- web wallet connection works end-to-end for active testing
- native wallet connection follows the same app-shell state contract
- successful connection returns the user to Positions and shows connected state in both Positions and Wallet/Settings
