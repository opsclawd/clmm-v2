import { useEffect, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useRootNavigationState } from 'expo-router';
import { Platform, Text, View, StyleSheet, Pressable } from 'react-native';
import { queryClient } from '../src/composition/queryClient';
import { navigateRoute } from '../src/platform/webNavigation';

type DebugLog = {
  timestamp: number;
  message: string;
};

const MAX_DEBUG_LOGS = 50;
const debugLogs: DebugLog[] = [];
const listeners: Set<() => void> = new Set();

function addDebugLog(message: string) {
  const entry = { timestamp: Date.now(), message };
  debugLogs.push(entry);
  if (debugLogs.length > MAX_DEBUG_LOGS) {
    debugLogs.shift();
  }
  listeners.forEach((l) => l());
}

function useDebugLogs(): DebugLog[] {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return debugLogs;
}

addDebugLog(`_layout mount | Platform.OS=${Platform.OS} | userAgent=${typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 80) : 'N/A'}`);

function DebugOverlay() {
  const logs = useDebugLogs();
  const [visible, setVisible] = useState(true);

  if (!visible) {
    return (
      <Pressable
        style={[StyleSheet.absoluteFillObject, { top: 'auto', bottom: 0, height: 24, backgroundColor: 'rgba(0,0,0,0.3)' }]}
        onPress={() => setVisible(true)}
      >
        <Text style={{ color: '#0f0', fontSize: 10, textAlign: 'center' }}>TAP TO SHOW LOGS ({logs.length})</Text>
      </Pressable>
    );
  }

  return (
    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, padding: 4, paddingTop: 20 }]} pointerEvents="box-none">
      <Pressable
        style={{ position: 'absolute', top: 4, right: 4, padding: 4, backgroundColor: '#600', zIndex: 10000 }}
        onPress={() => setVisible(false)}
      >
        <Text style={{ color: '#fff', fontSize: 10 }}>HIDE</Text>
      </Pressable>
      <Text style={{ color: '#0f0', fontSize: 10, fontWeight: 'bold' }}>=== NAV DEBUG ({logs.length}) ===</Text>
      {logs.map((log, i) => (
        <Text key={i} style={{ color: '#0f0', fontSize: 8, lineHeight: 10 }}>
          {log.message}
        </Text>
      ))}
    </View>
  );
}

export default function RootLayout() {
  const router = useRouter();
  const rootNavState = useRootNavigationState() as { key?: string } | undefined;

  addDebugLog(
    `RootLayout render | navState.key=${rootNavState?.key ?? 'undefined'}`
  );

  useEffect(() => {
    if (Platform.OS === 'web') {
      addDebugLog('web platform detected');
    }
  }, []);

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
      <Stack screenOptions={{ headerShown: false }} />
      <DebugOverlay />
    </QueryClientProvider>
  );
}

export { addDebugLog, useDebugLogs };