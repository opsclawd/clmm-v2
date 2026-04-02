import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SigningStatusScreen } from '@clmm/ui';
import { fetchExecution, submitExecution } from '../../src/api/executions.js';

export default function SigningRoute() {
  const { attemptId } = useLocalSearchParams<{ attemptId: string }>();
  const router = useRouter();

  const executionQuery = useQuery({
    queryKey: ['execution', attemptId],
    queryFn: () => fetchExecution(attemptId!),
    enabled: attemptId != null && attemptId.length > 0,
    refetchInterval: 5_000,
  });

  const attempt = executionQuery.data;

  // When attempt transitions to submitted/confirmed/failed/partial, navigate to result
  const currentState = attempt?.lifecycleState?.kind;
  useEffect(() => {
    if (
      currentState === 'submitted' ||
      currentState === 'confirmed' ||
      currentState === 'failed' ||
      currentState === 'partial'
    ) {
      router.replace(`/execution/${attemptId}`);
    }
  }, [currentState, attemptId, router]);

  return (
    <SigningStatusScreen
      {...(attempt?.lifecycleState ? { lifecycleState: attempt.lifecycleState } : {})}
      {...(attempt?.breachDirection ? { breachDirection: attempt.breachDirection } : {})}
      {...(attempt?.retryEligible != null ? { retryEligible: attempt.retryEligible } : {})}
    />
  );
}
