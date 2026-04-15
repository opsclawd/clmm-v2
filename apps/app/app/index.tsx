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

  const isReady = !!rootNavigationState?.key;

  useEffect(() => {
    if (isReady && !hasNavigated.current) {
      hasNavigated.current = true;
      navigateRoute({ router, path: '/connect', method: 'replace' });
    }
  }, [isReady, router]);

  if (!isReady) {
    return null;
  }

  return null;
}