import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { PositionDetailScreen } from '@clmm/ui';
import { Text, View } from 'react-native';
import { useStore } from 'zustand';
import { fetchPositionDetail } from '../../src/api/positions.js';
import { fetchAlerts } from '../../src/api/alerts.js';
import { walletSessionStore } from '../../src/state/walletSessionStore.js';

export default function PositionDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const walletAddress = useStore(walletSessionStore, (state) => state.walletAddress);
  const positionId = typeof id === 'string' ? id : undefined;
  const hasValidPositionId = positionId != null && positionId.length > 0;
  const hasWalletAddress = walletAddress != null && walletAddress.length > 0;

  // Fetch alerts to find the matching alert for this position
  const alertsQuery = useQuery({
    queryKey: ['alerts', walletAddress],
    queryFn: () => fetchAlerts(walletAddress!),
    enabled: hasWalletAddress,
  });

  // Find alert matching this position
  const alert = alertsQuery.data?.find((a) => a.positionId === positionId);

  const positionQuery = useQuery({
    queryKey: ['position-detail', walletAddress, positionId],
    queryFn: () => fetchPositionDetail(walletAddress!, positionId!),
    enabled: hasWalletAddress && hasValidPositionId,
  });

  if (!hasValidPositionId) {
    return (
      <View style={{ flex: 1, padding: 16, justifyContent: 'center' }}>
        <Text>Position not found.</Text>
      </View>
    );
  }

  if (positionQuery.isError) {
    return (
      <View style={{ flex: 1, padding: 16, justifyContent: 'center' }}>
        <Text>Could not load position detail for this wallet.</Text>
      </View>
    );
  }

  return (
    <PositionDetailScreen
      {...(positionQuery.data ? { position: positionQuery.data } : {})}
      {...(alert ? { alert } : {})}
      onViewPreview={(triggerId) => router.push(`/preview/${triggerId}`)}
    />
  );
}
