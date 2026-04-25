type RouterLike = {
  push: (path: string) => void;
  replace: (path: string) => void;
};

type NavigationMethod = 'push' | 'replace';

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

  if (isWebPlatform() && isSolanaMobileWebView()) {
    hardNavigate(canonicalPath, params.method);
    return;
  }

  if (params.method === 'replace') {
    params.router.replace(canonicalPath);
    return;
  }

  params.router.push(canonicalPath);
}
