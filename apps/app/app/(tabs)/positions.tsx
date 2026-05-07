import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { PositionsListScreen } from '@clmm/ui';
import { useStore } from 'zustand';
import { fetchSupportedPositions } from '../../src/api/positions';
import { fetchCurrentSrLevels, SrLevelsUnsupportedPoolError } from '../../src/api/srLevels';
import { fetchCurrentRegime, RegimeUnsupportedPoolError } from '../../src/api/regime';
import { fetchCurrentSrTheses, SrThesesUnsupportedPoolError } from '../../src/api/srTheses';
import { walletSessionStore } from '../../src/state/walletSessionStore';
import type { PositionListItemViewModel } from '@clmm/ui';
import { navigateRoute } from '../../src/platform/webNavigation';

const SR_LEVELS_STALE_TIME_MS = 5 * 60 * 1000;
const REGIME_STALE_TIME_MS = 5 * 60 * 1000;
const SR_THESES_STALE_TIME_MS = 5 * 60 * 1000;

function deriveUniquePool(positions: { poolId: string; tokenPairLabel: string }[] | undefined): {
  poolId: string | null;
  poolLabel: string | null;
  isMixedPools: boolean;
} {
  if (!positions || positions.length === 0) {
    return { poolId: null, poolLabel: null, isMixedPools: false };
  }
  const seen = new Map<string, string>();
  for (const pos of positions) {
    if (!seen.has(pos.poolId)) {
      seen.set(pos.poolId, pos.tokenPairLabel);
    }
    if (seen.size > 1) {
      return { poolId: null, poolLabel: null, isMixedPools: true };
    }
  }
  const first = seen.entries().next().value as [string, string];
  return { poolId: first[0], poolLabel: first[1], isMixedPools: false };
}

export default function PositionsRoute() {
  const router = useRouter();
  const walletAddress = useStore(walletSessionStore, (state) => state.walletAddress);
  const platformCapabilities = useStore(walletSessionStore, (state) => state.platformCapabilities);
  const positionsQuery = useQuery({
    queryKey: ['supported-positions', walletAddress],
    queryFn: () => fetchSupportedPositions(walletAddress!),
    enabled: walletAddress != null && walletAddress.length > 0,
  });
  const positionsResult = positionsQuery.data;
  const positions = positionsResult?.positions;
  const positionsWarning = positionsResult?.warning ?? null;
  const hasLoadedPositions = (positions?.length ?? 0) > 0;

  const { poolId, poolLabel, isMixedPools } = deriveUniquePool(positions);

  const srLevelsQuery = useQuery({
    queryKey: ['sr-levels-current', poolId],
    queryFn: () => fetchCurrentSrLevels(poolId!),
    enabled: poolId != null,
    staleTime: SR_LEVELS_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    retry: (failureCount, error) =>
      !(error instanceof SrLevelsUnsupportedPoolError) && failureCount < 1,
    retryDelay: 1000,
  });

  const regimeQuery = useQuery({
    queryKey: ['regime-current', poolId],
    queryFn: () => fetchCurrentRegime(poolId!),
    enabled: poolId != null,
    staleTime: REGIME_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    retry: (failureCount, error) =>
      !(error instanceof RegimeUnsupportedPoolError) && failureCount < 1,
    retryDelay: 1000,
  });

  const srThesesQuery = useQuery({
    queryKey: ['sr-theses-current', poolId],
    queryFn: () => fetchCurrentSrTheses(poolId!),
    enabled: poolId != null,
    staleTime: SR_THESES_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    retry: (failureCount, error) =>
      !(error instanceof SrThesesUnsupportedPoolError) && failureCount < 1,
    retryDelay: 1000,
  });

  const srLevelsUnsupported = srLevelsQuery.error instanceof SrLevelsUnsupportedPoolError;
  const srLevelsError = srLevelsQuery.isError && !srLevelsUnsupported;

  const regimeUnsupported = regimeQuery.error instanceof RegimeUnsupportedPoolError;
  const regimeError = regimeQuery.isError && !regimeUnsupported;

  const srThesesUnsupported = srThesesQuery.error instanceof SrThesesUnsupportedPoolError;
  const srThesesError = srThesesQuery.isError && !srThesesUnsupported;

  return (
    <PositionsListScreen
      walletAddress={walletAddress}
      positions={positions}
      positionsLoading={positionsQuery.isLoading}
      positionsError={
        positionsQuery.isError && !hasLoadedPositions
          ? 'Could not load supported positions for this wallet.'
          : null
      }
      positionsWarning={positionsWarning}
      platformCapabilities={platformCapabilities}
      srLevels={srLevelsQuery.data?.srLevels}
      srLevelsLoading={srLevelsQuery.isLoading && srLevelsQuery.fetchStatus !== 'idle'}
      srLevelsError={srLevelsError}
      srLevelsUnsupported={srLevelsUnsupported}
      regime={regimeQuery.data?.regime}
      regimeLoading={regimeQuery.isLoading && regimeQuery.fetchStatus !== 'idle'}
      regimeError={regimeError}
      regimeUnsupported={regimeUnsupported}
      regimeUnavailableReason={regimeQuery.data?.unavailableReason ?? null}
      srTheses={srThesesQuery.data?.srTheses}
      srThesesLoading={srThesesQuery.isLoading && srThesesQuery.fetchStatus !== 'idle'}
      srThesesError={srThesesError}
      srThesesUnsupported={srThesesUnsupported}
      srThesesUnavailableReason={srThesesQuery.data?.unavailableReason ?? null}
      isMixedPools={isMixedPools}
      poolLabel={poolLabel}
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
