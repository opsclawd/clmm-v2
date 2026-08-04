import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useStore } from 'zustand';
import { EvidenceScreen } from '@clmm/ui';
import { fetchCurrentEvidence } from '../src/api/evidence';
import { walletSessionStore } from '../src/state/walletSessionStore';
import { RawTelemetryContainer } from '../src/evidence/RawTelemetryContainer';

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

  const evidenceQuery = useQuery({
    queryKey: positionId
      ? ['evidence-current', 'SOL/USDC', 'position', walletAddress, positionId]
      : ['evidence-current', 'SOL/USDC', 'pair'],
    queryFn: ({ signal }) => fetchCurrentEvidence(signal, positionScope),
    enabled: positionId == null || positionScope != null,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    retry: false,
  });

  const evidence = evidenceQuery.data?.evidence ?? null;

  return (
    <EvidenceScreen
      evidence={evidence}
      isLoading={evidenceQuery.isLoading || evidenceQuery.isFetching}
      isError={evidenceQuery.isError}
      unavailableReason={evidenceQuery.data?.unavailableReason ?? null}
      now={Date.now()}
      pair="SOL/USDC"
      onBack={() => router.back()}
      rawTelemetrySlot={
        evidence ? <RawTelemetryContainer key={evidence.runId} runId={evidence.runId} /> : null
      }
    />
  );
}
