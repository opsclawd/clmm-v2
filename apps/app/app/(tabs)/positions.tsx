import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { PositionsListScreen } from '@clmm/ui';
import { useStore } from 'zustand';
import { fetchSupportedPositions } from '../../src/api/positions';
import { fetchCurrentSrLevels, SrLevelsUnsupportedPoolError } from '../../src/api/srLevels';
import { walletSessionStore } from '../../src/state/walletSessionStore';
import type { PositionListItemViewModel } from '@clmm/ui';
import { navigateRoute } from '../../src/platform/webNavigation';

const SR_LEVELS_STALE_TIME_MS = 5 * 60 * 1000;

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

  const poolId = positionsQuery.data?.[0]?.poolId ?? null;

  const srLevelsQuery = useQuery({
    queryKey: ['sr-levels-current', poolId],
    queryFn: () => fetchCurrentSrLevels(poolId!),
    enabled: poolId != null,
    staleTime: SR_LEVELS_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    retry: (failureCount, error) =>
      !(error instanceof SrLevelsUnsupportedPoolError) && failureCount < 1,
  });

  const srLevelsUnsupported = srLevelsQuery.error instanceof SrLevelsUnsupportedPoolError;
  const srLevelsError = srLevelsQuery.isError && !srLevelsUnsupported;

  return (
    <PositionsListScreen
      walletAddress={walletAddress}
      positions={positionsQuery.data}
      positionsLoading={positionsQuery.isLoading}
      positionsError={positionsQuery.isError && !hasLoadedPositions ? 'Could not load supported positions for this wallet.' : null}
      platformCapabilities={platformCapabilities}
      srLevels={srLevelsQuery.data?.srLevels ?? null}
      srLevelsLoading={srLevelsQuery.isLoading && srLevelsQuery.fetchStatus !== 'idle'}
      srLevelsError={srLevelsError}
      srLevelsUnsupported={srLevelsUnsupported}
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