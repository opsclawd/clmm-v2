type RouterLike = {
  push: (path: string) => void;
  replace: (path: string) => void;
};

type NavigationMethod = 'push' | 'replace';

type NavigationStrategy = 'soft-preferred' | 'hard-fallback' | 'capability-driven';

/**
 * Active wallet WebView navigation strategy. The reasoning, validation
 * evidence, and selected outcome live in:
 *   docs/decisions/0001-wallet-webview-navigation.md
 *
 * Any change to this constant MUST update or supersede that ADR.
 */
const WALLET_WEBVIEW_NAVIGATION_STRATEGY: NavigationStrategy = 'soft-preferred';

let _activeStrategy: NavigationStrategy = WALLET_WEBVIEW_NAVIGATION_STRATEGY;

function getStrategy(): NavigationStrategy {
  return _activeStrategy;
}

export { WALLET_WEBVIEW_NAVIGATION_STRATEGY };

/** @internal Test-only hook to override the active strategy per-test. */
export function _setStrategyForTesting(strategy: NavigationStrategy): void {
  _activeStrategy = strategy;
}

export function normalizeExpoRouterRoute(path: string): string {
  return path.startsWith('/(tabs)/') ? path.replace('/(tabs)', '') : path;
}

function isWebPlatform(): boolean {
  return typeof window !== 'undefined';
}

type WalletLike = Record<string, unknown>;

function hasConnect(wallet: unknown): boolean {
  return wallet != null && typeof wallet === 'object' && typeof (wallet as WalletLike)['connect'] === 'function';
}

export function hasBrowserWalletPresence(): boolean {
  if (!isWebPlatform()) return false;
  try {
    const win = window as unknown as Record<string, unknown>;

    const solana = win['solana'];
    if (hasConnect(solana)) return true;

    const phantom = win['phantom'];
    if (phantom && typeof phantom === 'object' && phantom !== null) {
      const phantomSolana = (phantom as WalletLike)['solana'];
      if (hasConnect(phantomSolana)) return true;
    }

    const solflare = win['solflare'];
    if (hasConnect(solflare)) return true;

    return false;
  } catch {
    return false;
  }
}

export function isSolanaMobileWebView(): boolean {
  if (!isWebPlatform()) return false;
  try {
    if (!hasBrowserWalletPresence()) return false;
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const isMobile = /wv\)/.test(ua) || /iPhone/.test(ua) || /iPad/.test(ua) || /Android.*Mobile/.test(ua);
    const walletBrowserSignal = /Phantom|Solflare/.test(ua);
    return isMobile || walletBrowserSignal;
  } catch {
    return false;
  }
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

  switch (getStrategy()) {
    case 'soft-preferred':
      navigateSoftPreferred(params.router, canonicalPath, params.method);
      return;
    case 'hard-fallback':
      navigateHardFallback(params.router, canonicalPath, params.method);
      return;
    case 'capability-driven':
      navigateCapabilityDriven(params.router, canonicalPath, params.method);
      return;
  }
}

function navigateSoftPreferred(router: RouterLike, canonicalPath: string, method: NavigationMethod): void {
  if (method === 'replace') {
    router.replace(canonicalPath);
    return;
  }
  router.push(canonicalPath);
}

function navigateHardFallback(router: RouterLike, canonicalPath: string, method: NavigationMethod): void {
  if (isWebPlatform() && isSolanaMobileWebView()) {
    hardNavigate(canonicalPath, method);
    return;
  }
  if (method === 'replace') {
    router.replace(canonicalPath);
    return;
  }
  router.push(canonicalPath);
}

function navigateCapabilityDriven(router: RouterLike, canonicalPath: string, method: NavigationMethod): void {
  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn(
      "[webNavigation] strategy 'capability-driven' is a stub; falling back to 'hard-fallback' behavior. " +
        'See docs/decisions/0001-wallet-webview-navigation.md.',
    );
  }
  navigateHardFallback(router, canonicalPath, method);
}
