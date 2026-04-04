import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { AlertsListScreen } from '@clmm/ui';
import { useStore } from 'zustand';
import { fetchAlerts } from '../../src/api/alerts';
import { walletSessionStore } from '../../src/state/walletSessionStore';

export default function AlertsRoute() {
  const router = useRouter();
  const walletAddress = useStore(walletSessionStore, (state) => state.walletAddress);
  const platformCapabilities = useStore(walletSessionStore, (state) => state.platformCapabilities);

  const alertsQuery = useQuery({
    queryKey: ['alerts', walletAddress],
    queryFn: () => fetchAlerts(walletAddress!),
    enabled: walletAddress != null && walletAddress.length > 0,
    refetchInterval: 30_000,
  });

  return (
    <AlertsListScreen
      alerts={alertsQuery.data ?? []}
      platformCapabilities={platformCapabilities}
      onSelectAlert={(triggerId, positionId) =>
        router.push(`/position/${positionId}`)
      }
    />
  );
}
