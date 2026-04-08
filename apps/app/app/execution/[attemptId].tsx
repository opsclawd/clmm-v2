import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ExecutionResultScreen } from '@clmm/ui';
import { fetchExecution } from '../../src/api/executions';

function readAttemptId(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export default function ExecutionRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ attemptId?: string | string[] }>();
  const attemptId = readAttemptId(params.attemptId);

  const executionQuery = useQuery({
    queryKey: ['execution-attempt', attemptId],
    queryFn: () => fetchExecution(attemptId!),
    enabled: attemptId != null,
  });

  return (
    <ExecutionResultScreen
      {...(executionQuery.data != null
        ? {
            lifecycleState: executionQuery.data.lifecycleState,
            breachDirection: executionQuery.data.breachDirection,
            retryEligible: executionQuery.data.retryEligible,
            ...(executionQuery.data.transactionReferences[0]?.signature != null
              ? { transactionSignature: executionQuery.data.transactionReferences[0].signature }
              : {}),
          }
        : {})}
      resultLoading={executionQuery.isLoading}
      resultError={executionQuery.error instanceof Error ? executionQuery.error.message : null}
      onViewHistory={() => router.push('/(tabs)/history')}
    />
  );
}
