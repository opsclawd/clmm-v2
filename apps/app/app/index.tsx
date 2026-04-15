import { useEffect, useRef } from 'react';
import { Redirect, useRootNavigationState } from 'expo-router';
import { addDebugLog } from './_layout';

type RootNavigationState = {
  key?: string;
};

addDebugLog('index.tsx module loaded');

export default function IndexRoute() {
  const rootNavigationState = useRootNavigationState() as RootNavigationState | undefined;
  const hasNavigated = useRef(false);

  const isReady = !!rootNavigationState?.key;

  addDebugLog(`IndexRoute render | navState.key=${rootNavigationState?.key ?? 'undefined'} | isReady=${isReady}`);

  useEffect(() => {
    if (isReady && !hasNavigated.current) {
      hasNavigated.current = true;
      addDebugLog(`IndexRoute: navState ready, hasNavigated set to true`);
    }
  }, [isReady]);

  if (!isReady) {
    addDebugLog('IndexRoute: navState not ready, returning null');
    return null;
  }

  addDebugLog('IndexRoute: navState ready, rendering Redirect to /connect');
  return <Redirect href="/connect" />;
}