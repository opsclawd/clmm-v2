type RouterLike = {
  push: (path: string) => void;
  replace: (path: string) => void;
};

type NavigationMethod = 'push' | 'replace';

export function navigateRoute(params: {
  router: RouterLike;
  path: string;
  method: NavigationMethod;
}): void {
  if (params.method === 'replace') {
    params.router.replace(params.path);
    return;
  }

  params.router.push(params.path);
}
