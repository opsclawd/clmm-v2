import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { PositionDetailScreen } from '@clmm/ui';
import { useStore } from 'zustand';
import { fetchJson } from '../../src/api/http.js';
import { fetchAlerts } from '../../src/api/alerts.js';
import { walletSessionStore } from '../../src/state/walletSessionStore.js';
import type { PositionDetailDto } from '@clmm/application/public';

export default function PositionDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const walletAddress = useStore(walletSessionStore, (state) => state.walletAddress);

  // Fetch alerts to find the matching alert for this position
  const alertsQuery = useQuery({
    queryKey: ['alerts', walletAddress],
    queryFn: () => fetchAlerts(walletAddress!),
    enabled: walletAddress != null && walletAddress.length > 0,
  });

  // Find alert matching this position
  const alert = alertsQuery.data?.find((a) => a.positionId === id);

  // Fetch position detail from positions list
  const positionsQuery = useQuery({
    queryKey: ['supported-positions', walletAddress],
    queryFn: async () => {
      const payload = (await fetchJson(`/positions/${walletAddress}`)) as { positions: PositionDetailDto[] };
      return payload.positions;
    },
    enabled: walletAddress != null && walletAddress.length > 0,
  });

  const position = positionsQuery.data?.find((p) => p.positionId === id) as PositionDetailDto | undefined;

  return (
    <PositionDetailScreen
      {...(position ? { position } : {})}
      {...(alert ? { alert } : {})}
      onViewPreview={(triggerId) => router.push(`/preview/${triggerId}`)}
    />
  );
}
