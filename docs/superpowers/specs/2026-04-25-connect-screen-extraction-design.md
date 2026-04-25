# Connect Screen Extraction: App Shell to packages/ui

**Date:** 2026-04-25
**Issue:** https://github.com/opsclawd/clmm-v2/issues/37
**PR context:** https://github.com/opsclawd/clmm-v2/pull/34#discussion_r3141513191

## Problem

`apps/app/app/connect.tsx` is a 521-line route file that owns wallet discovery state, fallback detection, deep-link handling, connection outcome rendering, and inline JSX for every visual state. This violates the boundary in `AGENTS.md`:

> `apps/app` is an Expo shell and must not own screens or business logic.

The existing `WalletConnectScreen` in `packages/ui` is a polished presentation component (hero animation, "Protect your Orca positions" headline, features list) but only takes `onSelectWallet(kind)` and has no concept of per-wallet browser discovery, fallback states, social-webview escape, or deep-link actions. The route file in `apps/app` does not currently use it — it reimplements the screen inline with a different visual treatment.

This spec extracts the orchestration into `packages/ui` behind a discriminated state model, so the route can shrink to a thin wiring file and the screen owns every visual case.

## Approach

**Discriminated state model.** The screen accepts `{ viewModel: ConnectScreenViewModel, actions: ConnectScreenActions }`. The view-model carries a `state: ConnectScreenState` — a discriminated union covering every visual case the screen knows how to render. The shell route translates its hooks, store, platform inspection, and connect error into one of those named states; the screen renders accordingly. Impossible state combinations are unrepresentable.

**Visual target: hybrid.** Keep the polish of the existing `WalletConnectScreen` (hero pulse animation, headline, subtitle, features list at the bottom). Replace the single "Connect Browser Wallet" button with a state-driven body: per-wallet picker rows (when wallets are discovered), discovery spinner, fallback panels with deep-link CTAs, social-webview escape panel, etc.

**Fallback detection stays in the shell.** Detection of social-webview, mobile-no-wallet, and desktop-no-wallet uses `navigator.userAgent` and `Platform.OS`, which are forbidden in `packages/ui`. The shell computes a `FallbackState` and passes it to the view-model as a typed input. No new application port is introduced for this single screen.

## Module layout

### `packages/ui/src`

```
screens/
  WalletConnectScreen.tsx         ← rewritten: hybrid hero+features+state-driven body
  WalletConnectScreen.test.tsx    ← per-state-variant render tests
view-models/
  WalletConnectionViewModel.ts    ← extended: buildConnectScreenViewModel(...) added
  WalletConnectionViewModel.test.ts
components/
  WalletConnectionUtils.ts        ← extended: WalletPickerOption, ConnectScreenState, ConnectScreenActions
  ConnectWalletPicker.tsx         ← new: per-wallet row list (icon + name)
  ConnectFallbackPanel.tsx        ← new: deep-link buttons + fallback copy
  SocialWebviewEscapePanel.tsx    ← new: social-webview-specific block
```

### `apps/app`

```
app/connect.tsx                                       ← collapses from 521 → ~90 lines
src/platform/detectFallbackState.ts                   ← new: lifted from inline
src/platform/detectFallbackState.test.ts              ← new: UA matrix
src/platform/browserWallet/useDiscoveryState.ts       ← new: lifted from inline
src/platform/browserWallet/useDiscoveryState.test.ts  ← new: timeout/sticky behavior
```

`packages/ui` does not import `react-native`'s `Linking`, `expo-router`, `navigator`, `@clmm/adapters/*`, or anything from `apps/app/src`.

## ConnectScreenState shape

In `packages/ui/src/components/WalletConnectionUtils.ts`:

```ts
export type WalletPickerOption = {
  id: string;
  name: string;
  iconUri: string | null;  // null when wallet has no icon
};

export type ConnectScreenState =
  | { kind: 'loading-capabilities' }
  | { kind: 'social-webview'; socialEscapeAttempted: boolean }
  | { kind: 'discovering';   nativeAvailable: boolean }
  | { kind: 'ready';
      nativeAvailable: boolean;
      browserWallets: WalletPickerOption[];
    }
  | { kind: 'timed-out-discovery'; nativeAvailable: boolean }
  | { kind: 'wallet-fallback';     nativeAvailable: boolean }
  | { kind: 'desktop-no-wallet' };
```

`browserWallets` may be empty in the `ready` state only when `nativeAvailable: true` (the native-only path on iOS/Android). All other variants either have non-empty `browserWallets` or do not carry them.

## View-model

In `packages/ui/src/view-models/WalletConnectionViewModel.ts`:

```ts
export type ConnectScreenInputs = {
  capabilities: PlatformCapabilities | null;     // null = still loading
  fallbackState: 'none' | 'social-webview' | 'wallet-fallback' | 'desktop-no-wallet';
  discoveryState: 'discovering' | 'ready' | 'timed-out';
  browserWallets: WalletPickerOption[];
  connectionOutcome: ConnectionOutcome | null;
  isConnecting: boolean;
  socialEscapeAttempted: boolean;
};

export type ConnectScreenViewModel = {
  state: ConnectScreenState;
  outcome: ConnectionOutcomeDisplay | null;
  isConnecting: boolean;
};

export function buildConnectScreenViewModel(
  inputs: ConnectScreenInputs,
): ConnectScreenViewModel;
```

### Decision rules

1. `capabilities === null` → `{ kind: 'loading-capabilities' }`. `outcome` suppressed.
2. `fallbackState === 'social-webview'` → `{ kind: 'social-webview', socialEscapeAttempted }`. Wins over everything else (extensions can't run in social webviews).
3. `fallbackState === 'desktop-no-wallet'` → that variant.
4. `fallbackState === 'wallet-fallback'` → `{ kind: 'wallet-fallback', nativeAvailable }`.
5. Otherwise look at `discoveryState`:
   - `'discovering'` → `{ kind: 'discovering', nativeAvailable }`
   - `'ready'` → `{ kind: 'ready', nativeAvailable, browserWallets }`
   - `'timed-out'` → `{ kind: 'timed-out-discovery', nativeAvailable }`

### Outcome derivation

`outcome = (connectionOutcome === null || connectionOutcome.kind === 'connected') ? null : getConnectionOutcomeDisplay(connectionOutcome)`. The outcome banner renders globally, including beneath the social-webview panel.

### `nativeAvailable` source

`nativeAvailable === capabilities.nativeWalletAvailable`. Pulled out of capabilities once at the top of the builder.

### Existing builders preserved

`buildWalletConnectViewModel` and `buildWalletSettingsViewModel` (used by `WalletSettingsScreen`) are unchanged. The new function is additive.

## Action surface

In `packages/ui/src/components/WalletConnectionUtils.ts`:

```ts
export type ConnectScreenActions = {
  onSelectNativeWallet: () => void;
  onSelectBrowserWallet: (walletId: string) => void;     // from picker rows in 'ready'
  onConnectDefaultBrowser: () => void;                    // from CTA in 'timed-out-discovery'

  onOpenInExternalBrowser: () => void;
  onOpenInPhantom: () => void;
  onOpenInSolflare: () => void;

  onGoBack: () => void;
  onDismissOutcome: () => void;
};
```

Fine-grained over a single tagged callback because each entry maps to a distinct shell-side side effect (`Linking.openURL` with different URLs, `walletPlatform.connectNativeWallet()`, `browserConnect.connect(walletId)`, `router.back()`, `clearOutcome()`). A unified callback would just immediately switch on the tag.

`onDismissOutcome` is split from `onGoBack` so the screen can dismiss a stale outcome banner without leaving the screen. `onGoBack` still clears the outcome and pops the route.

## Screen component

In `packages/ui/src/screens/WalletConnectScreen.tsx`:

```ts
type Props = {
  viewModel: ConnectScreenViewModel;
  actions: ConnectScreenActions;
};
```

The screen always renders the hero pulse animation, the title ("Protect your Orca positions"), the subtitle, and the features list at the bottom. Between the subtitle and the features list, it switches on `viewModel.state.kind`:

| `state.kind` | Body |
|---|---|
| `loading-capabilities` | Centered `ActivityIndicator` |
| `social-webview` | `SocialWebviewEscapePanel` (warning + Open in Browser CTA + Phantom/Solflare deep-link buttons; "Open in Browser" disabled when `socialEscapeAttempted: true`) |
| `discovering` | Native button (if `nativeAvailable`) + spinner row "Detecting browser wallets..." |
| `ready` | Native button (if `nativeAvailable`) + `ConnectWalletPicker` rendering one row per `browserWallets[]` (icon + name) |
| `timed-out-discovery` | Native button (if `nativeAvailable`) + single "Connect Browser Wallet" CTA → `onConnectDefaultBrowser` |
| `wallet-fallback` | Native button (if `nativeAvailable`) + `ConnectFallbackPanel` (no-extension warning + Phantom/Solflare deep-link buttons) |
| `desktop-no-wallet` | Install-extension warning panel; no wallet buttons |

The outcome banner (`viewModel.outcome`) and the connecting indicator (`viewModel.isConnecting`) render globally, below the body, regardless of state.

Per-wallet rows in `ConnectWalletPicker` invoke `actions.onSelectBrowserWallet(wallet.id)` on press. The native button invokes `actions.onSelectNativeWallet`. Both are disabled while `viewModel.isConnecting === true`.

## Shell route

`apps/app/app/connect.tsx` after the change (~90 lines):

```tsx
export default function ConnectRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const returnTo = useMemo(() => parseReturnTo(params.returnTo), [params.returnTo]);

  const session = useStore(walletSessionStore);
  const browserConnect = useBrowserWalletConnect();
  const [socialEscapeAttempted, setSocialEscapeAttempted] = useState(false);
  const discoveryState = useDiscoveryState(browserConnect.wallets.length);

  // Sync capabilities once on mount
  useEffect(() => {
    let active = true;
    void platformCapabilityAdapter
      .getCapabilities()
      .then((c) => { if (active) session.setPlatformCapabilities(c); })
      .catch(() => { if (active) session.setPlatformCapabilities(FALLBACK_PLATFORM_CAPABILITIES); });
    return () => { active = false; };
  }, []);

  const fallbackState = useMemo(
    () => detectFallbackState(session.platformCapabilities, browserConnect.error),
    [session.platformCapabilities, browserConnect.error],
  );

  const browserWallets: WalletPickerOption[] = useMemo(
    () => browserConnect.wallets.map((w) => ({ id: w.id, name: w.name, iconUri: w.icon || null })),
    [browserConnect.wallets],
  );

  const viewModel = buildConnectScreenViewModel({
    capabilities: session.platformCapabilities,
    fallbackState,
    discoveryState,
    browserWallets,
    connectionOutcome: session.connectionOutcome,
    isConnecting: session.isConnecting,
    socialEscapeAttempted,
  });

  const handleConnectionError = (error: unknown) => {
    const outcome = mapWalletErrorToOutcome(error);
    session.markOutcome(outcome.kind === 'connected'
      ? { kind: 'failed', reason: 'Unexpected connected error outcome' }
      : outcome);
  };
  const onSuccess = (address: string, kind: 'native' | 'browser') => {
    session.markConnected({ walletAddress: address, connectionKind: kind });
    enrollWalletForMonitoring(address).catch((e) => console.warn('Wallet enrollment failed:', e));
    navigateRoute({ router, path: returnTo, method: 'replace' });
  };

  const actions: ConnectScreenActions = {
    onSelectNativeWallet:    async () => { session.beginConnection(); try { onSuccess(await walletPlatform.connectNativeWallet(), 'native'); } catch (e) { handleConnectionError(e); } },
    onSelectBrowserWallet:   async (id) => { session.beginConnection(); try { const { address } = await browserConnect.connect(id); onSuccess(address, 'browser'); } catch (e) { handleConnectionError(e); } },
    onConnectDefaultBrowser: async () => { session.beginConnection(); try { const { address } = await browserConnect.connect(); onSuccess(address, 'browser'); } catch (e) { handleConnectionError(e); } },
    onOpenInExternalBrowser: () => { setSocialEscapeAttempted(true); openInExternalBrowser(window.location.href); },
    onOpenInPhantom:         () => void Linking.openURL(buildPhantomBrowseUrl(window.location.href)),
    onOpenInSolflare:        () => void Linking.openURL(buildSolflareBrowseUrl(window.location.href)),
    onGoBack:                () => { session.clearOutcome(); router.back(); },
    onDismissOutcome:        session.clearOutcome,
  };

  return <WalletConnectScreen viewModel={viewModel} actions={actions} />;
}
```

`socialEscapeAttempted` stays as React state in the route — purely a UI flag, the route is the only consumer.

### New shell-side helpers

`apps/app/src/platform/detectFallbackState.ts` — pure function `(capabilities, connectError) => FallbackState`. Lifted verbatim from the inline declaration in `connect.tsx`. Same signature as today.

`apps/app/src/platform/browserWallet/useDiscoveryState.ts` — small hook wrapping the `walletCount + setTimeout(2000)` logic. Returns `'discovering' | 'ready' | 'timed-out'`. Sticky: once `'timed-out'`, stays `'timed-out'` even if wallets later appear (preserves today's behavior — the user has already seen the "Connect Browser Wallet" CTA and the default-browser path still works).

## Error handling & edge cases

### Capability fetch failure

Today: catches the error, sets `FALLBACK_PLATFORM_CAPABILITIES` (all flags `false`), and routes the error through `handleConnectionError`, writing a `connectionOutcome`. That misrepresents a *capability* failure as a *connection* failure. This spec drops the `markOutcome(error)` call from the capability-fetch failure path. The user lands in `desktop-no-wallet` (or `wallet-fallback` if mobile UA), which is the correct visual state.

### Connection errors

Unchanged: `mapWalletErrorToOutcome` runs in the shell, `session.markOutcome(...)` writes to the store, the screen renders the outcome banner via `getConnectionOutcomeDisplay`. Defensive case preserved: if the mapper returns `{ kind: 'connected' }` for a thrown error (shouldn't happen), substitute `{ kind: 'failed', reason: 'Unexpected connected error outcome' }`.

### Browser wallet hook error

`browserConnect.error` feeds `detectFallbackState` (the `'No supported browser wallet detected on this device'` message triggers `wallet-fallback`/`desktop-no-wallet`). Other browser-connect errors only surface when the user explicitly tries to connect — handled by the `try/catch` around `browserConnect.connect(...)`. No change.

### Concurrent connection attempts

`session.beginConnection()` sets `isConnecting: true`. The screen disables wallet buttons via `viewModel.isConnecting`. No screen-level lock.

### Stale outcome banner

`beginConnection()` already clears `connectionOutcome` to `null` on retry, so the banner auto-dismisses. `actions.onDismissOutcome` provides explicit dismissal without retrying.

### Deep-link round-trip

`returnTo` is parsed from URL params via `parseReturnTo` and preserved when the user lands back from a deep-link / external browser. No new behavior.

### Native-only path

On iOS/Android in Expo, `fallbackState === 'none'`, `browserConnect.wallets` is always empty, and `browserConnect.error` may be `null`. `discoveryState` would land at `'timed-out'` after 2s — wrong visual: the "Connect Browser Wallet" CTA doesn't apply. Resolution: the view-model treats `nativeAvailable: true && browserWallets.length === 0` as a valid `ready` state (no browser CTA in the body). This is an explicit relaxation of the "browserWallets always non-empty in ready" rule.

## Testing

### `packages/ui/src/view-models/WalletConnectionViewModel.test.ts`

Decision-tree coverage for `buildConnectScreenViewModel`:

| Input | Expected `state.kind` |
|---|---|
| `capabilities: null` | `loading-capabilities` |
| `fallbackState: 'social-webview'`, `socialEscapeAttempted: false` | `social-webview` (escape flag pass-through) |
| `fallbackState: 'social-webview'`, `socialEscapeAttempted: true` | `social-webview` (`socialEscapeAttempted: true`) |
| `fallbackState: 'desktop-no-wallet'` | `desktop-no-wallet` |
| `fallbackState: 'wallet-fallback'`, native available | `wallet-fallback` (`nativeAvailable: true`) |
| `fallbackState: 'wallet-fallback'`, no native | `wallet-fallback` (`nativeAvailable: false`) |
| `discoveryState: 'discovering'` | `discovering` |
| `discoveryState: 'ready'`, 1+ wallets | `ready` with `browserWallets` |
| `discoveryState: 'ready'`, 0 wallets, native available | `ready` with `browserWallets: []` (native-only path) |
| `discoveryState: 'timed-out'` | `timed-out-discovery` |
| `social-webview` wins over `discoveryState: 'ready'` | `social-webview` |
| `connectionOutcome: { kind: 'failed', reason: 'x' }` | `outcome.title === 'Connection Failed'` |
| `connectionOutcome: { kind: 'connected' }` | `outcome === null` |
| `isConnecting: true` | passed through |

### `packages/ui/src/screens/WalletConnectScreen.test.tsx`

Render-per-state tests using `@testing-library/react-native` (matching the existing test style):

- Hero, title, features render in every state (regression-guard the hybrid layout).
- `loading-capabilities` renders `ActivityIndicator`, no wallet buttons.
- `discovering` renders spinner + "Detecting browser wallets..." copy + native button if `nativeAvailable`.
- `ready` with N wallets renders N wallet rows with names + icons; pressing row N invokes `actions.onSelectBrowserWallet(wallets[N].id)`.
- `ready` with 0 wallets + `nativeAvailable: true` renders only the native button; no browser section.
- `timed-out-discovery` renders the "Connect Browser Wallet" default-browser CTA → `actions.onConnectDefaultBrowser`.
- `social-webview` renders the warning, "Open in Browser" CTA → `actions.onOpenInExternalBrowser`, Phantom/Solflare buttons; "Open in Browser" disabled when `socialEscapeAttempted: true`.
- `wallet-fallback` renders the no-wallet warning + Phantom/Solflare buttons.
- `desktop-no-wallet` renders install-extension copy with no wallet buttons.
- Outcome banner present iff `viewModel.outcome !== null`; severity color matches.
- `actions.onGoBack` invoked from back button.
- `actions.onDismissOutcome` invoked from outcome dismiss affordance.
- `viewModel.isConnecting: true` shows "Connecting..." section and disables wallet buttons.

### `apps/app/src/platform/detectFallbackState.test.ts`

UA matrix:

- `Platform.OS !== 'web'` → `'none'` regardless of caps/error
- Social UAs (Facebook, Instagram, Twitter, TikTok, LinkedIn, Line) → `'social-webview'`
- Mobile UA (Android, iPhone, iPad) + no wallet → `'wallet-fallback'`
- Desktop UA + no wallet → `'desktop-no-wallet'`
- Mobile UA + browser wallet available → `'none'`
- `connectError.message === NO_WALLET_MESSAGE` triggers fallback path even when caps reports a wallet available

### `apps/app/src/platform/browserWallet/useDiscoveryState.test.ts`

- Starts at `'discovering'`.
- Transitions to `'ready'` immediately when `walletCount` becomes `> 0` before timeout.
- Transitions to `'timed-out'` after 2000ms with `walletCount === 0`.
- Stays `'timed-out'` even if `walletCount` later becomes `> 0` (sticky).
- Once `'ready'`, doesn't go back to `'discovering'` if `walletCount` returns to 0.

### Not tested

- No integration test of the route file — it's a thin wiring file; its imports are exercised by the screen unit tests + the lifted shell-helper unit tests.
- No visual regression / snapshot of the hero animation.
- No live `Linking.openURL` / `navigator` testing — those are stdlib boundaries; URL builders have their own tests in `walletDeepLinks.test.ts`.

### Boundary check

`pnpm boundaries` runs in CI and will catch any accidental import from `apps/app` into `packages/ui`. No new boundary configuration required.

## Migration & cleanup

Single PR, internal sequence so the tree is buildable at each step:

1. Add new types and view-model in `packages/ui` (`WalletPickerOption`, `ConnectScreenState`, `ConnectScreenActions`, `ConnectScreenViewModel`, `buildConnectScreenViewModel`). Export from `packages/ui/src/index.ts`. New view-model tests pass. Old `WalletConnectScreen` still works (untouched).
2. Add new sub-components in `packages/ui`: `ConnectWalletPicker`, `ConnectFallbackPanel`, `SocialWebviewEscapePanel`. Internal to `packages/ui`; not re-exported.
3. Rewrite `WalletConnectScreen.tsx` to consume `{ viewModel, actions }`. Hybrid layout: keep `HeroAnimation`, title, subtitle, features list; replace the body with a state-driven switch over `viewModel.state.kind`. Update `WalletConnectScreen.test.tsx` per the testing section.
4. Lift `detectFallbackState` and `useDiscoveryState` to their own files in `apps/app/src/platform/...`, with tests. Inline behavior preserved.
5. Rewrite `apps/app/app/connect.tsx` to the ~90-line shape. Drop the inline UI; render `<WalletConnectScreen viewModel={vm} actions={actions} />`.
6. Drop the capability-fetch `markOutcome` side effect in the rewritten route.
7. Run validation — `pnpm typecheck`, `pnpm lint`, `pnpm boundaries`, `pnpm test`. Existing wallet-related tests in `packages/ui` and `apps/app` should pass; new tests added per the testing section.

### What gets deleted

- ~430 lines of inline JSX/styles/render helpers in `apps/app/app/connect.tsx`
- The two inline state shapes (`FallbackState`, `WalletDiscoveryState`) and `detectFallbackState` *as inline declarations* — they move to dedicated files, not deleted in spirit
- Inline `setTimeout` discovery logic (replaced by `useDiscoveryState`)
- The route's direct imports from `react-native` (`View`, `Text`, `TouchableOpacity`, `ScrollView`, `ActivityIndicator`, `Image`) — only `Linking` and `Platform` remain
- The route's import of `getConnectionOutcomeDisplay` — view-model owns that now

### What does not change

- `walletSessionStore` shape and behavior
- `useBrowserWalletConnect` hook contract
- `platformCapabilityAdapter` and `PlatformCapabilityState` in `packages/application`
- The existing `buildWalletConnectViewModel` and `buildWalletSettingsViewModel` (still used by `WalletSettingsScreen`)
- `WalletConnectionUtils.ts` existing exports (added to, not changed)
- `walletDeepLinks.ts` URL builders

### Backwards-compat shims

None. The old `WalletConnectScreen` props (`platformCapabilities`, `connectionOutcome`, `isConnecting`, `onSelectWallet`, `onGoBack`) are removed. Per `AGENTS.md` "no backwards-compat hacks," there is no transitional alias for the old prop shape. The only consumer is the connect route, which is rewritten in the same PR.

## Out of scope

Tracked separately:

- **Disconnect-error inline banners in `WalletSettingsScreen`** — issue #37's fourth bullet. The current `connect.tsx` does not contain disconnect-error orchestration; it lives in a different screen. Deferred to a follow-up issue so this spec stays focused on the 521-line offender.
- **Moving capability or fallback detection behind a new application port** — considered and rejected for this scope. Detection lives in the shell adapter, consistent with how other DOM/Expo inspection (`useBrowserWalletConnect`, `Linking`) already lives there. Revisit only if a second screen needs the same logic.
- **Visual redesign of the hero/features** — keeping current `WalletConnectScreen` polish as-is.

## Risks

- The hybrid layout (hero + features + state-driven body) makes the screen taller. On small viewports the wallet picker may sit below the fold. Confirm with manual smoke test on a phone-sized viewport — not blocking.
- `useDiscoveryState`'s sticky-timeout behavior is intentional but subtle; the test suite codifies it.
- `pnpm boundaries` will catch any accidental import from `apps/app` into `packages/ui`. Run it before pushing.
