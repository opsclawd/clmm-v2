import { useQuery } from '@tanstack/react-query';
import { HistoryListScreen } from '@clmm/ui';
import { useStore } from 'zustand';
import { fetchExecutionHistory } from '../../src/api/history';
import { walletSessionStore } from '../../src/state/walletSessionStore';

export default function HistoryRoute() {
  const walletAddress = useStore(walletSessionStore, (state) => state.walletAddress);

  const historyQuery = useQuery({
    queryKey: ['execution-history', walletAddress],
    queryFn: () => fetchExecutionHistory(walletAddress!),
    enabled: walletAddress != null && walletAddress.length > 0,
    refetchInterval: 30_000,
  });

  return (
    <HistoryListScreen
      events={historyQuery.data ?? []}
    />
  );
}
