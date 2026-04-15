import { useEffect, useRef } from 'react';
import { useRootNavigationState } from 'expo-router';
import { Platform } from 'react-native';
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
      addDebugLog(`IndexRoute: navState ready, attempting window.location redirect to /connect`);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        addDebugLog(`IndexRoute: calling window.location.replace('/connect')`);
        window.location.replace('/connect');
      }
    }
  }, [isReady]);

  if (!isReady) {
    addDebugLog('IndexRoute: navState not ready, returning null');
    return null;
  }

  addDebugLog('IndexRoute: navState ready, rendering null (navigation handled by effect)');
  return null;
}