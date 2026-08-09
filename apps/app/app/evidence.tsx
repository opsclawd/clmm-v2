import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useStore } from 'zustand';
import { EvidenceScreen } from '@clmm/ui';
import { fetchCurrentEvidence } from '../src/api/evidence';
import { fetchCurrentPolicyInsight } from '../src/api/policyInsights';
import { walletSessionStore } from '../src/state/walletSessionStore';

import { RequireWallet } from '../src/wallet-boot/RequireWallet';

export default function EvidenceRoute() {
  const params = useLocalSearchParams<{ positionId?: string | string[] }>();
  const positionId =
    typeof params.positionId === 'string' && params.positionId.length > 0
      ? params.positionId
      : undefined;

  if (positionId) {
    return (
      <RequireWallet>
        <EvidenceRouteBody positionId={positionId} />
      </RequireWallet>
    );
  }

  return <EvidenceRouteBody />;
}

function EvidenceRouteBody({ positionId }: { positionId?: string }) {
  const router = useRouter();
  const walletAddress = useStore(walletSessionStore, (state) => state.walletAddress);
  const positionScope = positionId && walletAddress ? { walletAddress, positionId } : undefined;

  const pair = 'SOL/USDC';

  const evidenceQuery = useQuery({
    queryKey: positionId
      ? ['evidence-current', pair, 'position', walletAddress, positionId]
      : ['evidence-current', pair, 'pair'],
    queryFn: ({ signal }) => fetchCurrentEvidence(signal, positionScope),
    enabled: positionId == null || positionScope != null,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    retry: false,
  });

  const policyInsightQuery = useQuery({
    queryKey: positionId
      ? ['policy-insights-current', pair, 'position', walletAddress, positionId]
      : ['policy-insights-current', pair, 'pair'],
    queryFn: ({ signal }) => fetchCurrentPolicyInsight(signal),
    enabled: positionId == null || positionScope != null,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    retry: false,
  });

  const evidence = evidenceQuery.data?.evidence ?? null;
  const policyInsight = policyInsightQuery.data?.policyInsight ?? null;
  const isPolicyInsightLoading = policyInsightQuery.isLoading || policyInsightQuery.isFetching;
  const isPolicyInsightError = policyInsightQuery.isError;
  const policyInsightUnavailableReason = policyInsightQuery.data?.unavailableReason ?? null;

  return (
    <EvidenceScreen
      evidence={evidence}
      isLoading={evidenceQuery.isLoading || evidenceQuery.isFetching}
      isError={evidenceQuery.isError}
      unavailableReason={evidenceQuery.data?.unavailableReason ?? null}
      policyInsight={policyInsight}
      isPolicyInsightLoading={isPolicyInsightLoading}
      isPolicyInsightError={isPolicyInsightError}
      policyInsightUnavailableReason={policyInsightUnavailableReason}
      now={Date.now()}
      pair={pair}
      onBack={() => router.back()}
    />
  );
}
