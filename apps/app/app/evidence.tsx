import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { EvidenceScreen } from '@clmm/ui';
import { fetchCurrentEvidence } from '../src/api/evidence';

export default function EvidenceRoute() {
  const router = useRouter();

  const evidenceQuery = useQuery({
    queryKey: ['evidence-current', 'SOL/USDC'],
    queryFn: ({ signal }) => fetchCurrentEvidence(signal),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    retry: false,
  });

  return (
    <EvidenceScreen
      evidence={evidenceQuery.data?.evidence ?? null}
      isLoading={evidenceQuery.isLoading || evidenceQuery.isFetching}
      isError={evidenceQuery.isError}
      unavailableReason={evidenceQuery.data?.unavailableReason ?? null}
      now={Date.now()}
      pair="SOL/USDC"
      onBack={() => router.back()}
    />
  );
}
