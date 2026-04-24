import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { Platform } from 'react-native';
import { queryClient } from '../src/composition/queryClient';
import { BrowserWalletProvider } from '../src/platform/browserWallet';
import { navigateRoute } from '../src/platform/webNavigation';

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let subscription: { remove: () => void } | undefined;

    const setupNotifications = async () => {
      const { addNotificationResponseReceivedListener } = await import('expo-notifications');
      subscription = addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as {
          route?: string;
          positionId?: string;
          triggerId?: string;
        };
        if (data.route) {
          navigateRoute({ router, path: data.route, method: 'push' });
        } else if (data.triggerId) {
          navigateRoute({ router, path: `/preview/${data.triggerId}`, method: 'push' });
        } else if (data.positionId) {
          navigateRoute({ router, path: `/position/${data.positionId}`, method: 'push' });
        }
      });
    };

    void setupNotifications();

    return () => subscription?.remove();
  }, [router]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserWalletProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </BrowserWalletProvider>
    </QueryClientProvider>
  );
}