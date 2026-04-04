import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ExecutionPreviewScreen } from '@clmm/ui';
import { refreshPreview } from '../../src/api/previews';
import { getBffBaseUrl } from '../../src/api/http';

export default function PreviewRoute() {
  const { triggerId } = useLocalSearchParams<{ triggerId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Create a fresh preview by refreshing from the trigger
  const previewQuery = useQuery({
    queryKey: ['preview', triggerId],
    queryFn: () => refreshPreview(triggerId!),
    enabled: triggerId != null && triggerId.length > 0,
  });

  const refreshMutation = useMutation({
    mutationFn: () => refreshPreview(triggerId!),
    onSuccess: (data) => {
      queryClient.setQueryData(['preview', triggerId], data);
    },
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      // Create an execution attempt from the preview
      const response = await fetch(`${getBffBaseUrl()}/executions/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          previewId: previewQuery.data?.previewId,
          triggerId,
        }),
      });
      if (!response.ok) throw new Error(`Approve failed: HTTP ${response.status}`);
      return response.json() as Promise<{ attemptId: string }>;
    },
    onSuccess: (data) => {
      router.push(`/signing/${data.attemptId}`);
    },
  });

  return (
    <ExecutionPreviewScreen
      {...(previewQuery.data ? { preview: previewQuery.data } : {})}
      onApprove={() => approveMutation.mutate()}
      onRefresh={() => refreshMutation.mutate()}
    />
  );
}
