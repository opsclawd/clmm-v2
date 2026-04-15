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

function isPhantomMobileWebView(): boolean {
  if (!isWebPlatform()) return false;
  try {
    const win = window as unknown as Record<string, unknown>;
    const solana = win['solana'];
    const hasPhantomInject =
      solana && typeof solana === 'object' && solana !== null &&
      (solana as Record<string, unknown>)['isPhantom'] === true;
    const hasPhantomUA =
      typeof navigator !== 'undefined' && /Phantom/i.test(navigator.userAgent);
    if (!hasPhantomInject && !hasPhantomUA) return false;
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    return /wv\)/.test(ua) || /iPhone.*Phantom/.test(ua);
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

  if (isWebPlatform() && isPhantomMobileWebView()) {
    hardNavigate(canonicalPath, params.method);
    return;
  }

  if (params.method === 'replace') {
    params.router.replace(canonicalPath);
    return;
  }

  params.router.push(canonicalPath);
}