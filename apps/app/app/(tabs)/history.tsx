import { useQuery } from '@tanstack/react-query';
import { HistoryListScreen } from '@clmm/ui';
import { useStore } from 'zustand';
import { fetchWalletExecutionHistory } from '../../src/api/executions';
import { walletSessionStore } from '../../src/state/walletSessionStore';

export default function HistoryRoute() {
  const walletAddress = useStore(walletSessionStore, (state) => state.walletAddress);

  const historyQuery = useQuery({
    queryKey: ['wallet-execution-history', walletAddress],
    queryFn: () => fetchWalletExecutionHistory(walletAddress!),
    enabled: walletAddress != null && walletAddress.length > 0,
  });

  return <HistoryListScreen {...(historyQuery.data != null ? { events: historyQuery.data } : {})} />;
}
