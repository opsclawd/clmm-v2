import { useEffect } from 'react';
import { useRootNavigationState, useRouter } from 'expo-router';

type RootNavigationState = {
  key?: string;
};

export default function IndexRoute() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState() as RootNavigationState | undefined;

  useEffect(() => {
    if (!rootNavigationState?.key) {
      return;
    }

    router.replace('/connect');
  }, [rootNavigationState?.key, router]);

  return null;
}
