import { useEffect, useRef } from 'react';
import { useRootNavigationState, useRouter } from 'expo-router';
import { navigateRoute } from '../src/platform/webNavigation';
import { addDebugLog } from './_layout';

type RootNavigationState = {
  key?: string;
};

addDebugLog('index.tsx module loaded');

export default function IndexRoute() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState() as RootNavigationState | undefined;
  const hasNavigated = useRef(false);

  const isReady = !!rootNavigationState?.key;

  useEffect(() => {
    if (isReady && !hasNavigated.current) {
      hasNavigated.current = true;
      addDebugLog(`IndexRoute: navState ready, navigating to /connect`);
      navigateRoute({ router, path: '/connect', method: 'replace' });
    }
  }, [isReady, router]);

  if (!isReady) {
    return null;
  }

  return null;
}