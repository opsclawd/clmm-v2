import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { ExecutionPreviewScreen } from '@clmm/ui';
import { useStore } from 'zustand';
import { approveExecutionPreview } from '../../src/api/executions';
import { createPreview, refreshPreview } from '../../src/api/previews';
import { walletSessionStore } from '../../src/state/walletSessionStore';

function readTriggerId(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export default function PreviewRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ triggerId?: string | string[] }>();
  const triggerId = readTriggerId(params.triggerId);
  const walletAddress = useStore(walletSessionStore, (state) => state.walletAddress);

  const createMutation = useMutation({
    mutationFn: createPreview,
    retry: 0,
  });

  const refreshMutation = useMutation({
    mutationFn: refreshPreview,
    retry: 0,
  });

  const approvalMutation = useMutation({
    mutationFn: approveExecutionPreview,
    retry: 0,
  });

  useEffect(() => {
    if (triggerId == null) {
      return;
    }

    void createMutation.mutateAsync(triggerId);
    // Intentionally depend only on triggerId to avoid mutation-object re-render loops.
  }, [triggerId]);

  const preview = refreshMutation.data ?? createMutation.data;

  return (
    <ExecutionPreviewScreen
      {...(preview != null ? { preview } : {})}
      previewLoading={createMutation.isPending || refreshMutation.isPending || approvalMutation.isPending}
      previewError={
        createMutation.error instanceof Error
          ? createMutation.error.message
          : refreshMutation.error instanceof Error
            ? refreshMutation.error.message
            : approvalMutation.error instanceof Error
              ? approvalMutation.error.message
              : null
      }
      {...(preview != null && walletAddress != null
        ? {
            onApprove: async () => {
              const approval = await approvalMutation.mutateAsync({
                previewId: preview.previewId,
                walletId: walletAddress,
              });

              router.push({
                pathname: '/signing/[attemptId]',
                params: { attemptId: approval.attemptId },
              });
            },
          }
        : {})}
      {...(triggerId != null
        ? {
            onRefresh: () => {
              void refreshMutation.mutateAsync(triggerId);
            },
          }
        : {})}
    />
  );
}
