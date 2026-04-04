import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ExecutionResultScreen } from '@clmm/ui';
import { fetchExecution } from '../../src/api/executions';

export default function ExecutionResultRoute() {
  const { attemptId } = useLocalSearchParams<{ attemptId: string }>();
  const router = useRouter();

  const executionQuery = useQuery({
    queryKey: ['execution', attemptId],
    queryFn: () => fetchExecution(attemptId!),
    enabled: attemptId != null && attemptId.length > 0,
    refetchInterval: (query) => {
      // Poll aggressively while submitted, then stop
      const state = query.state.data?.lifecycleState?.kind;
      if (state === 'submitted') return 5_000;
      if (state === 'confirmed' || state === 'failed' || state === 'partial' || state === 'abandoned') return false;
      return 15_000;
    },
  });

  const attempt = executionQuery.data;
  const firstTxSig = attempt?.transactionReferences?.[0]?.signature;

  return (
    <ExecutionResultScreen
      {...(attempt?.lifecycleState ? { lifecycleState: attempt.lifecycleState } : {})}
      {...(attempt?.breachDirection ? { breachDirection: attempt.breachDirection } : {})}
      {...(attempt?.retryEligible != null ? { retryEligible: attempt.retryEligible } : {})}
      {...(firstTxSig ? { transactionSignature: firstTxSig } : {})}
      onViewHistory={() => router.push('/(tabs)/history')}
    />
  );
}
