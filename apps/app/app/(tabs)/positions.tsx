import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { PositionsListScreen } from '@clmm/ui';
import { useStore } from 'zustand';
import { fetchSupportedPositions } from '../../src/api/positions';
import { walletSessionStore } from '../../src/state/walletSessionStore';
import type { PositionListItemViewModel } from '@clmm/ui';
import { navigateRoute } from '../../src/platform/webNavigation';

export default function PositionsRoute() {
  const router = useRouter();
  const walletAddress = useStore(walletSessionStore, (state) => state.walletAddress);
  const platformCapabilities = useStore(walletSessionStore, (state) => state.platformCapabilities);
  const positionsQuery = useQuery({
    queryKey: ['supported-positions', walletAddress],
    queryFn: () => fetchSupportedPositions(walletAddress!),
    enabled: walletAddress != null && walletAddress.length > 0,
  });
  const hasLoadedPositions = (positionsQuery.data?.length ?? 0) > 0;

  return (
    <PositionsListScreen
      walletAddress={walletAddress}
      positions={positionsQuery.data}
      positionsLoading={positionsQuery.isLoading}
      positionsError={positionsQuery.isError && !hasLoadedPositions ? 'Could not load supported positions for this wallet.' : null}
      platformCapabilities={platformCapabilities}
      onConnectWallet={() =>
        navigateRoute({
          router,
          path: '/connect',
          method: 'push',
        })
      }
      onSelectPosition={(positionId: PositionListItemViewModel['positionId']) =>
        navigateRoute({
          router,
          path: `/position/${positionId}`,
          method: 'push',
        })
      }
    />
  );
}
