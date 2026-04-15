---
title: Phantom WebView silently fails Expo Router soft navigation
date: 2026-04-15
category: integration-issues
module: apps/app
problem_type: integration_issue
component: frontend_stimulus
symptoms:
  - Root path shows blank white screen on Phantom mobile browser, no redirect to /connect
  - Wallet connected but stuck on /connect, no redirect to /positions
  - Position detail navigation completely non-functional
  - Expo Router router.push/replace/Redirect render without error but produce no navigation
root_cause: wrong_api
resolution_type: code_fix
severity: critical
tags:
  - phantom
  - webview
  - expo-router
  - navigation
  - mobile-browser
  - hard-navigate
  - history-api
---

# Phantom WebView silently fails Expo Router soft navigation

## Problem

Expo Router's soft navigation (`router.push`, `router.replace`, `<Redirect>`) silently fails in Phantom's in-app WebView. Navigation actions execute without throwing errors, but the DOM and URL bar never change. The app is entirely non-functional on Phantom mobile browser, which is a primary target platform for this Solana dApp.

## Symptoms

- Root `/` shows blank white screen — no redirect to `/connect`
- After manually navigating to `/connect` and connecting wallet, user is stuck — no redirect to `/positions`
- Tapping a position in the list produces no navigation to `/position/:id`
- `navState.key` becomes valid (navigation container initializes), `<Redirect>` renders, but no URL or screen change occurs
- `window.location.replace()` works immediately as a bypass

## What Didn't Work

1. **Removed `_layout.tsx` hydration gate** — Hypothesized that a `useState(Platform.OS !== 'web')` guard blocking `<Stack>` from mounting on the first web render was the cause. The `Stack` mounted fine after removal, but navigation still failed. The guard was a red herring; the navigation container initialized correctly.

2. **Replaced imperative navigation with declarative `<Redirect>`** — Hypothesized the `useRootNavigationState` + `useEffect` + `useRef` pattern was fragile. `<Redirect>` rendered correctly but produced no navigation — Expo Router's entire soft navigation layer was broken, not just the trigger mechanism.

3. **Added `not_found_handling: "single-page-application"` to `wrangler.jsonc`** — Hypothesized Cloudflare Workers (not Pages) was serving 404s for non-root paths. The site deploys via Cloudflare Pages GitHub integration, which already provides automatic SPA routing. Wrong infrastructure layer entirely.

The breakthrough came from adding an on-screen debug overlay that rendered `navState.key`, `<Redirect>` render state, and a `window.location.replace()` button directly in the UI. This isolated the failure to the navigation mechanism, not the trigger.

## Solution

**1. `apps/app/src/platform/webNavigation.ts`** — Detect Phantom WebView and bypass Expo Router with `window.location`:

```typescript
function isInPhantomWebView(): boolean {
  if (!isWebPlatform()) return false;
  try {
    const win = window as unknown as Record<string, unknown>;
    const solana = win['solana'];
    if (solana && typeof solana === 'object' && solana !== null) {
      const sol = solana as Record<string, unknown>;
      if (sol['isPhantom'] === true) return true;
    }
    if (typeof navigator !== 'undefined' && /Phantom/i.test(navigator.userAgent)) return true;
  } catch { /* ignore */ }
  return false;
}

function hardNavigate(path: string, method: NavigationMethod): void {
  const url = new URL(path, window.location.origin);
  if (method === 'replace') {
    window.location.replace(url.href);
  } else {
    window.location.href = url.href;
  }
}

export function navigateRoute(params: {
  router: RouterLike;
  path: string;
  method: NavigationMethod;
}): void {
  const canonicalPath = normalizeExpoRouterRoute(params.path);
  if (isWebPlatform() && isInPhantomWebView()) {
    hardNavigate(canonicalPath, params.method);
    return;
  }
  if (params.method === 'replace') {
    params.router.replace(canonicalPath);
    return;
  }
  params.router.push(canonicalPath);
}
```

**2. `apps/app/app/index.tsx`** — Wait for `navState.key` readiness on web, preserve `<Redirect>` on native:

```typescript
export default function IndexRoute() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState() as RootNavigationState | undefined;
  const hasNavigated = useRef(false);
  const isReady = !!rootNavigationState?.key;

  useEffect(() => {
    if (Platform.OS === 'web' && isReady && !hasNavigated.current) {
      hasNavigated.current = true;
      navigateRoute({ router, path: '/connect', method: 'replace' });
    }
  }, [isReady, router]);

  if (!isReady) return null;
  if (Platform.OS === 'web') return null;
  return <Redirect href="/connect" />;
}
```

**3. `apps/app/app/_layout.tsx`** — Removed the web hydration gate. `<Stack>` now renders immediately on all platforms since there is no SSR hydration mismatch to protect against with Expo static export.

## Why This Works

Phantom's in-app WebView has a broken or non-standard browser History API implementation. Expo Router's soft navigation relies on React Navigation dispatching actions through the browser History API (`pushState`/`replaceState` + `popstate` events), which silently fails in Phantom's WebView — the API calls execute without error, but the WebView doesn't process the resulting state changes.

The fix detects the Phantom environment and falls back to `window.location.replace()` / `window.location.href`, which bypasses the History API entirely and forces a full page navigation. This is the only mechanism that works reliably in Phantom's WebView.

## Prevention

- **Centralize navigation through an abstraction layer** — All calls must go through `navigateRoute()` rather than calling `router.push`/`router.replace` directly. This ensures the Phantom fallback applies everywhere without missing call sites.
- **Never trust the History API in embedded WebViews** — Wallet in-app browsers (Phantom, MetaMask, etc.) often have non-standard WebView implementations. Any SPA routing framework that depends on the History API should have a `window.location` fallback path.
- **Distinguish trigger from mechanism when debugging navigation failures** — Three failed attempts conflated "the navigation isn't being triggered" with "the navigation mechanism is broken." Testing `window.location.replace()` directly isolated the mechanism as the failure point.
- **On-screen debug overlay for WebView debugging** — When devtools are unavailable (restricted WebViews, mobile in-app browsers), render navigation state and test actions directly on screen. This pattern should be readily reproducible for future WebView issues.
- **Test coverage gap** — The Phantom/hard-navigate branch in `webNavigation.ts` lacks unit tests since `window.location` is not easily mockable in the test environment. Consider integration testing with a headless WebView, or at minimum a test that verifies the detection function.

## Related Issues

- None. This is the first documented case of WebView navigation failure in this codebase.