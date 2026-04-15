type RouterLike = {
  push: (path: string) => void;
  replace: (path: string) => void;
};

type NavigationMethod = 'push' | 'replace';

export function normalizeExpoRouterRoute(path: string): string {
  return path.startsWith('/(tabs)/') ? path.replace('/(tabs)', '') : path;
}

export function navigateRoute(params: {
  router: RouterLike;
  path: string;
  method: NavigationMethod;
}): void {
  const canonicalPath = normalizeExpoRouterRoute(params.path);

  if (params.method === 'replace') {
    params.router.replace(canonicalPath);
    return;
  }

  params.router.push(canonicalPath);
}
