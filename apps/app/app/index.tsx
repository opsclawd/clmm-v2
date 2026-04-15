import { useEffect, useRef } from 'react';
import { useRootNavigationState, useRouter } from 'expo-router';
import { navigateRoute } from '../src/platform/webNavigation';

type RootNavigationState = {
  key?: string;
};

export default function IndexRoute() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState() as RootNavigationState | undefined;
  const hasNavigated = useRef(false);

  useEffect(() => {
    if (hasNavigated.current) {
      return;
    }

    if (!rootNavigationState?.key) {
      return;
    }

    hasNavigated.current = true;
    navigateRoute({ router, path: '/connect', method: 'replace' });
  }, [rootNavigationState?.key, router]);

  return null;
}
