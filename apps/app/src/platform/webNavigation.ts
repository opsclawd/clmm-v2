import { hasInjectedBrowserWalletProvider, readInjectedBrowserWalletWindow } from './browserWallet';

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

export function isSolanaMobileWebView(): boolean {
  if (!isWebPlatform()) return false;
  try {
    if (!hasInjectedBrowserWalletProvider(readInjectedBrowserWalletWindow())) return false;
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    return /wv\)/.test(ua) || /iPhone/.test(ua) || /iPad/.test(ua);
  } catch {
    // ignore
  }
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
