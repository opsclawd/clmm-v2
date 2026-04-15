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