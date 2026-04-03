import { useEffect } from 'react';
import { useRootNavigationState, useRouter } from 'expo-router';

export default function IndexRoute() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();

  useEffect(() => {
    if (!rootNavigationState?.key) {
      return;
    }

    router.replace('/connect');
  }, [rootNavigationState?.key, router]);

  return null;
}
