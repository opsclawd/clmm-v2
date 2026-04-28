import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { PositionDetailScreen } from '@clmm/ui';
import { Text, View } from 'react-native';
import { useStore } from 'zustand';
import { fetchPositionDetail } from '../../src/api/positions';
import { navigateRoute } from '../../src/platform/webNavigation';
import { walletSessionStore } from '../../src/state/walletSessionStore';
import { RequireWallet } from '../../src/wallet-boot/RequireWallet';

export default function PositionDetailRoute() {
  return (
    <RequireWallet>
      <PositionDetailRouteBody />
    </RequireWallet>
  );
}

function PositionDetailRouteBody() {
  const { id, triggerId } = useLocalSearchParams<{
    id?: string | string[];
    triggerId?: string | string[];
  }>();
  const router = useRouter();
  const walletAddress = useStore(walletSessionStore, (state) => state.walletAddress);
  const positionId = typeof id === 'string' ? id : undefined;
  const alertTriggerId = typeof triggerId === 'string' && triggerId.length > 0 ? triggerId : undefined;
  const hasValidPositionId = positionId != null && positionId.length > 0;

  const positionQuery = useQuery({
    queryKey: ['position-detail', walletAddress, positionId],
    queryFn: () => fetchPositionDetail(walletAddress!, positionId!),
    enabled: walletAddress != null && hasValidPositionId,
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

  const position = positionQuery.data;

  return (
    <PositionDetailScreen
      {...(position ? { position } : {})}
      onViewPreview={(resolvedTriggerId: string) =>
        navigateRoute({
          router,
          path: `/preview/${alertTriggerId ?? resolvedTriggerId}`,
          method: 'push',
        })
      }
    />
  );
}