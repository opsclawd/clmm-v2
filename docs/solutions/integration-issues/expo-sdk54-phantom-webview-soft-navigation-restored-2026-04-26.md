---
title: "Expo SDK 54 restored soft navigation in Phantom mobile WebView — hard-navigation workaround obsolete"
date: 2026-04-26
category: docs/solutions/integration-issues
module: apps/app
problem_type: integration_issue
component: frontend_stimulus
severity: critical
symptoms:
  - "Expo Router soft navigation silently fails in Phantom mobile WebView (pre-SDK 54)"
  - "window.location hard-navigation workaround required to navigate in Phantom"
  - "Hard navigation causes full-page reload, disrupting session recovery timing"
root_cause: wrong_api
resolution_type: dependency_update
severity: critical
tags:
  - phantom
  - webview
  - expo-sdk-54
  - expo-router
  - navigation
  - soft-navigation
  - hard-navigate
  - mobile-browser
related_components:
  - expo-router
  - react-native-reanimated
  - @solana/kit
---

# Expo SDK 54 restored soft navigation in Phantom mobile WebView

## Problem

Expo Router soft navigation (`router.push`, `router.replace`) silently failed in Phantom's mobile in-app browser — calls completed without errors but produced no visible navigation or URL change. The app was entirely non-functional on Phantom mobile, a primary target platform for this Solana dApp.

## Symptoms

- `router.push()` / `router.replace()` returned successfully with no thrown errors
- URL in the WebView address bar did not change
- Screen content remained static after navigation calls
- No JavaScript console errors were produced
- Navigation appeared to succeed but actually did nothing

## What Didn't Work

**Hard-navigation workaround (pre-SDK 54):** Detecting Solana mobile WebViews via `isSolanaMobileWebView()` and falling back to `window.location` hard-navigation:

```typescript
// OLD — hard-fallback strategy (pre-SDK 54)
function navigateSoftPreferred(router, path, method) {
  if (isWebPlatform() && isSolanaMobileWebView()) {
    hardNavigate(path, method); // window.location.replace() / window.location.href
    return;
  }
  if (method === 'replace') {
    router.replace(path);
    return;
  }
  router.push(path);
}
```

This workaround was contextually correct but introduced full-page reloads that disrupted wallet session recovery timing (fixed separately in PR #38).

## Solution

After upgrading to Expo SDK 54 (`expo ~54`, `expo-router ~6.0.23`), the underlying Expo Router WebView navigation bug was resolved. Soft navigation now works correctly in Phantom mobile WebViews.

**Updated `apps/app/src/platform/webNavigation.ts`:**

```typescript
// NEW — soft-preferred strategy (SDK 54+)
function navigateSoftPreferred(router: RouterLike, canonicalPath: string, method: NavigationMethod): void {
  if (method === 'replace') {
    router.replace(canonicalPath);
    return;
  }
  router.push(canonicalPath);
}
```

The `WALLET_WEBVIEW_NAVIGATION_STRATEGY` constant was flipped from `'hard-fallback'` to `'soft-preferred'`:

```typescript
const WALLET_WEBVIEW_NAVIGATION_STRATEGY: NavigationStrategy = 'soft-preferred';
```

The `hard-fallback` strategy remains available for wallets that still require hard navigation.

## Why This Works

**Root cause:** Expo Router's soft navigation relied on the browser History API (`pushState` / `replaceState`) to update the URL and trigger route changes. Phantom's mobile WebView had a broken implementation of these History API methods — calls would succeed silently without updating the WebView's internal navigation state or triggering route listeners.

**Fix:** Expo SDK 54 fixed the History API implementation in their WebView layer. The `isSolanaMobileWebView()` detection + `window.location` fallback became unnecessary and was removed from the `soft-preferred` path to simplify the navigation layer.

The `hard-fallback` strategy and `navigateHardFallback()` function are preserved for other wallets or environments that may still require hard navigation.

## Prevention

- **Validate navigation in target wallet WebViews before shipping routing changes** — Phantom mobile was a silent failure mode that only manifested in production
- **Use typed navigation strategy constants** — `WALLET_WEBVIEW_NAVIGATION_STRATEGY` makes the active approach grep-able and auditable; any change requires updating the ADR at `docs/decisions/0001-wallet-webview-navigation.md`
- **Test across Expo SDK upgrades** — minor Expo SDK bumps can resolve or introduce WebView compatibility issues; treat them as potentially behavior-changing for navigation
- **Preserve the hard-fallback path** — the `hard-fallback` strategy and `navigateHardFallback()` function remain available for wallets that still require it; do not remove them when switching to `soft-preferred`

## Related Issues

- PR #16, #18 — Original hard-navigation workaround introduction
- PR #38 — Wallet boot reload/session-recovery fix
- Issue #39 — Expo SDK 54 upgrade and re-evaluation
- ADR `docs/decisions/0001-wallet-webview-navigation.md` — Post-upgrade navigation strategy decision
