---
title: Connect screen extraction dropped platform guards, error handlers, and wallet icons
date: 2026-04-25
category: ui-bugs
module: packages/ui
problem_type: ui_bug
component: development_workflow
severity: high
symptoms:
  - Browser wallet CTA and discovery spinner rendered on native platforms where no browser wallets exist
  - Unhandled promise rejections from fire-and-forget enrollWalletForMonitoring calls
  - getCapabilities catch path silently swallowed errors instead of surfacing them as outcome banners
  - Social-webview renderer dropped outcome banner, masking capability/connection failures from in-app browser users
  - Discovered wallet buttons showed generic Feather icon instead of each wallet's branded icon URL
root_cause: logic_error
resolution_type: code_fix
tags: [view-model, extraction, platform-guard, react-native, connect-screen, error-handling, wallet-icons]
related_components: [packages/ui, apps/app]
---

# Connect screen extraction dropped platform guards, error handlers, and wallet icons

## Problem

A connect screen extraction refactor from `apps/app/app/connect.tsx` into `packages/ui` introduced five bugs where platform-specific guards, error handlers, and data-to-render bindings from the original code were silently dropped. None of these omissions caused type errors or compile failures — they were logic regressions that only manifested at runtime on specific platforms or error paths.

## Symptoms

- On iOS/Android, after the discovery timeout, a "Connect Browser Wallet" button appears. Tapping it always fails because the native connector has no browser wallets — the original code gated this with `Platform.OS !== 'web'`.
- `enrollWalletForMonitoring()` rejections appear as unhandled promise rejections in dev consoles and crash reporters.
- When `getCapabilities()` rejects (adapter/runtime failure), the user sees nothing — the screen silently falls back to safe capabilities instead of showing an outcome banner.
- Users on social in-app browsers (Instagram, Facebook) who encounter connection errors see no feedback — `renderSocialWebview` never renders `vm.outcomeDisplay`.
- Every discovered wallet button shows a generic wallet Feather icon instead of the wallet's branded icon (Phantom purple, Solflare orange).

## What Didn't Work

All five bugs were caught in code review rather than runtime investigation. The reviewer identified that:

- The original `Platform.OS` guard was dropped and not replaced with a data-driven equivalent in the view model.
- `.catch()` handlers were dropped as boilerplate during extraction.
- The `renderSocialWebview` function was factored out in isolation, never receiving the outcome banner that the parent route rendered.
- Wallet icon data existed in the `DiscoveredWallet` type but the render path regressed to a hardcoded `<Icon name="wallet" />`.

## Solution

Five targeted fixes, each restoring a defensive behavior through the view model's data model rather than re-introducing platform API calls in `packages/ui`:

### 1. Gate browser wallet sections on `browserWalletAvailable`

Added `browserWalletAvailable: boolean` to `WalletConnectViewModel`, derived from the existing `caps.browserWalletAvailable` field. Screen components now conditionally render discovery/timeout sections only when `vm.browserWalletAvailable` is true.

```ts
// WalletConnectionViewModel.ts — type and builder
export type WalletConnectViewModel = {
  browserWalletAvailable: boolean;
  // ... other fields
};

// In builder
return {
  browserWalletAvailable: caps.browserWalletAvailable,
  // ...
};
```

```tsx
// WalletConnectScreen.tsx — gated rendering
{!vm.isConnecting && vm.browserWalletAvailable && vm.discovery === 'discovering' ? (...) : null}
{!vm.isConnecting && vm.browserWalletAvailable && vm.discovery === 'ready' && vm.discoveredWallets.length > 0 ? (...) : null}
{!vm.isConnecting && vm.browserWalletAvailable && vm.discovery === 'timed-out' ? (...) : null}
```

### 2. Add `.catch()` to fire-and-forget enrollment calls

```ts
void enrollWalletForMonitoring(address).catch(() => {});
// Applied to all three call sites in connect.tsx
```

### 3. Restore `handleConnectionError` in capability probe catch path

```ts
.catch((error) => {
  if (!active) return;
  setPlatformCapabilities({...fallback});
  handleConnectionError(error); // restored — surfaces errors as outcome banners
});
```

### 4. Render outcome banner in social-webview path

Added `vm.outcomeDisplay` rendering at the top of `renderSocialWebview`, before the social warning banner.

```tsx
{vm.outcomeDisplay ? (
  <View style={[styles.outcomeBanner, { borderColor: severityBorderColor(vm.outcomeDisplay.severity) }]}>
    <Text style={[styles.outcomeTitle, { color: severityTextColor(vm.outcomeDisplay.severity) }]}>
      {vm.outcomeDisplay.title}
    </Text>
    {vm.outcomeDisplay.detail ? (
      <Text style={styles.outcomeDetail}>{vm.outcomeDisplay.detail}</Text>
    ) : null}
  </View>
) : null}
```

### 5. Render wallet-specific icons with fallback

```tsx
{wallet.icon ? (
  <Image source={{ uri: wallet.icon }} style={styles.walletIcon} />
) : (
  <Icon name="wallet" size={20} color={colors.textPrimary} />
)}
```

Added `walletIcon: { width: 24, height: 24 }` to StyleSheet and `Image` to React Native imports.

## Why This Works

The root cause across all five bugs was the same pattern: **during extraction/refactor, platform-specific guards and error-handling paths from the original code were silently dropped because they didn't cause compile errors or type failures.** The original code was defensive — it gated browser wallet UI on `Platform.OS`, caught enrollment errors, surfaced capability failures, rendered outcome banners across all code paths, and had wallet icon data available. The refactored code removed these defensive pieces because:

- The `vm.discovery` state model replaced the ad-hoc `Platform.OS` check, but the new model lacked a `browserWalletAvailable` field to carry the same semantics. Without it, the type system couldn't flag the omission — `vm.discovery` is a valid enum on all platforms.
- `.catch()` handlers were dropped as "boilerplate" during extraction.
- `renderSocialWebview` was factored out in isolation, never receiving the outcome banner the parent route rendered.
- Wallet icon data was preserved in the type system but the render path regressed to a hardcoded icon.

Each fix restores the defensive behavior through the view model's data model (rather than coupling back to `Platform.OS` directly), restoring error handlers, or ensuring all render paths include outcome banners.

## Prevention

- **Platform-gated UI must carry its guard into the view model.** When replacing `Platform.OS` checks with a view model, include a field like `browserWalletAvailable` so the gate travels with the data. Without it, `vm.discovery` is a valid enum on all platforms and the type system can't flag the omission.
- **Every `void`-prefixed fire-and-forget call must have a `.catch()`.** Enforce with `@typescript-eslint/no-floating-promises` or a PR checklist item.
- **Error-surfacing paths must be preserved in `.catch()` chains.** When a catch handler falls back to safe defaults, it must also surface the error. Code review should verify that `.catch()` paths that replace data also call error-surfacing functions.
- **All UI render branches must display outcome banners.** When factoring out a new render function, verify that every branch renders `vm.outcomeDisplay`. A visual test per platform-route branch catches this class of regression.
- **Type-level data must flow to the render layer.** If a type carries UI-relevant data (icons, labels, colors), the render path should use it. Use conditional rendering with fallback (`icon ? <Image> : <Icon>`) rather than ignoring the field entirely.
- **Extraction-specific review checklist.** For extraction/refactor PRs, explicitly verify: (a) all platform guards are preserved in the new abstraction, (b) all `.catch()` chains are preserved, (c) all render branches display outcome/feedback, (d) all type-level UI data flows to renders.

## Related Issues

- [GitHub #37](https://github.com/opsclawd/clmm-v2/issues/37) — Extract connect screen from app shell into packages/ui
- [GitHub #45](https://github.com/opsclawd/clmm-v2/pull/45) — PR with review findings and fixes
- `docs/solutions/integration-issues/phantom-mobile-injected-provider-migrated-to-connectorkit-wallet-standard-2026-04-24.md` — Direct ancestor; the CK migration introduced the connect screen code being extracted
- `docs/solutions/ui-bugs/signing-status-error-invisible-when-state-loaded-2026-04-23.md` — Same bug class: conditional-rendering gates that silently drop error/outcome state