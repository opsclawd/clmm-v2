import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { queryClient } from '../src/composition/queryClient';

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as {
        route?: string;
        positionId?: string;
        triggerId?: string;
      };
      if (data.route) {
        router.push(data.route);
      } else if (data.triggerId) {
        router.push(`/preview/${data.triggerId}`);
      } else if (data.positionId) {
        router.push(`/position/${data.positionId}`);
      }
    });
    return () => subscription.remove();
  }, [router]);

  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  );
}
