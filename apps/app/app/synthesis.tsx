import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SynthesisScreen } from '@clmm/ui';
import { fetchCurrentPolicyInsight } from '../src/api/policyInsights';
import { navigateRoute } from '../src/platform/webNavigation';

export default function SynthesisRoute() {
  const router = useRouter();

  const policyInsightsQuery = useQuery({
    queryKey: ['policy-insights-current', 'SOL/USDC'],
    queryFn: ({ signal }) => fetchCurrentPolicyInsight(signal),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    retry: false,
  });

  return (
    <SynthesisScreen
      policyInsight={policyInsightsQuery.data?.policyInsight ?? null}
      isLoading={policyInsightsQuery.isLoading || policyInsightsQuery.isFetching}
      isError={policyInsightsQuery.isError}
      unavailableReason={policyInsightsQuery.data?.unavailableReason ?? null}
      onBack={() => router.back()}
      onViewEvidence={() =>
        navigateRoute({
          router,
          path: '/evidence',
          method: 'push',
        })
      }
    />
  );
}
