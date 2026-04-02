import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SigningStatusScreen } from '@clmm/ui';
import { fetchExecution } from '../../src/api/executions.js';

export default function SigningRoute() {
  const { attemptId } = useLocalSearchParams<{ attemptId: string }>();

  const executionQuery = useQuery({
    queryKey: ['execution', attemptId],
    queryFn: () => fetchExecution(attemptId!),
    enabled: attemptId != null && attemptId.length > 0,
    refetchInterval: 5_000, // Poll for state updates during signing
  });

  const attempt = executionQuery.data;

  return (
    <SigningStatusScreen
      {...(attempt?.lifecycleState ? { lifecycleState: attempt.lifecycleState } : {})}
      {...(attempt?.breachDirection ? { breachDirection: attempt.breachDirection } : {})}
      {...(attempt?.retryEligible != null ? { retryEligible: attempt.retryEligible } : {})}
    />
  );
}
