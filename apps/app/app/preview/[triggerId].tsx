import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ExecutionPreviewScreen } from '@clmm/ui';
import { createPreview, refreshPreview } from '../../src/api/previews';
import { getBffBaseUrl } from '../../src/api/http';

export default function PreviewRoute() {
  const { triggerId } = useLocalSearchParams<{ triggerId: string }>();
  const router = useRouter();

  const createPreviewMutation = useMutation({
    mutationFn: createPreview,
    retry: 0,
  });

  const refreshMutation = useMutation({
    mutationFn: () => refreshPreview(triggerId!),
  });

  useEffect(() => {
    if (triggerId == null || triggerId.length === 0) {
      return;
    }

    void createPreviewMutation.mutateAsync(triggerId);
  }, [createPreviewMutation, triggerId]);

  const approveMutation = useMutation({
    mutationFn: async () => {
      // Create an execution attempt from the preview
      const response = await fetch(`${getBffBaseUrl()}/executions/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          previewId: createPreviewMutation.data?.previewId,
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
      {...(createPreviewMutation.data ? { preview: createPreviewMutation.data } : {})}
      onApprove={() => approveMutation.mutate()}
      onRefresh={() => refreshMutation.mutate()}
    />
  );
}
