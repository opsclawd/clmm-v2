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

    // Primary: navigate when navigation state is ready
    if (!rootNavigationState?.key) {
      return;
    }

    hasNavigated.current = true;
    navigateRoute({ router, path: '/connect', method: 'replace' });
  }, [rootNavigationState?.key, router]);

  // Fallback: ensure redirect even if navigation state never becomes ready
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (!hasNavigated.current) {
        hasNavigated.current = true;
        navigateRoute({ router, path: '/connect', method: 'replace' });
      }
    }, 1500);

    return () => clearTimeout(timeoutId);
  }, [router]);

  return null;
}
