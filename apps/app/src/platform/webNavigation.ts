type RouterLike = {
  push: (path: string) => void;
  replace: (path: string) => void;
};

type LocationLike = {
  assign: (url: string) => void;
  replace: (url: string) => void;
};

type NavigationMethod = 'push' | 'replace';

function detectMobileWeb(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    /Mobile|Android|iPhone/i.test(navigator.userAgent)
  );
}

export function normalizeExpoRouterRoute(path: string): string {
  return path.startsWith('/(tabs)/') ? path.replace('/(tabs)', '') : path;
}

export function navigateRoute(params: {
  router: RouterLike;
  path: string;
  method: NavigationMethod;
  isMobileWeb?: boolean;
  location?: LocationLike;
}): void {
  const path = normalizeExpoRouterRoute(params.path);
  const isMobileWeb = params.isMobileWeb ?? detectMobileWeb();

  if (isMobileWeb) {
    const location = params.location ?? globalThis.location;
    if (params.method === 'replace') {
      location.replace(path);
    } else {
      location.assign(path);
    }

    return;
  }

  if (params.method === 'replace') {
    params.router.replace(path);
    return;
  }

  params.router.push(path);
}
