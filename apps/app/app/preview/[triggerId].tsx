import { useEffect, useState } from 'react';
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
  const [isApprovingTransition, setIsApprovingTransition] = useState(false);

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

    createMutation.mutate(triggerId);
    // Intentionally depend only on triggerId to avoid mutation-object re-render loops.
  }, [triggerId]);

  const preview = refreshMutation.data ?? createMutation.data;
  const displayPreview = isApprovingTransition ? undefined : preview;

  return (
    <ExecutionPreviewScreen
      {...(displayPreview != null ? { preview: displayPreview } : {})}
      previewLoading={
        isApprovingTransition || createMutation.isPending || refreshMutation.isPending || approvalMutation.isPending
      }
      previewError={
        isApprovingTransition
          ? null
          : createMutation.error instanceof Error
            ? createMutation.error.message
            : refreshMutation.error instanceof Error
              ? refreshMutation.error.message
              : approvalMutation.error instanceof Error
                ? approvalMutation.error.message
                : null
      }
      {...(preview != null && walletAddress != null
        ? {
            onApprove: () => {
              if (isApprovingTransition || approvalMutation.isPending) {
                return;
              }

              setIsApprovingTransition(true);
              approvalMutation.mutate(
                {
                  previewId: preview.previewId,
                  walletId: walletAddress,
                },
                {
                  onSuccess: (approval) => {
                    router.push({
                      pathname: '/signing/[attemptId]',
                      params: { attemptId: approval.attemptId },
                    });
                  },
                  onError: () => {
                    setIsApprovingTransition(false);
                  },
                },
              );
            },
          }
        : {})}
      {...(triggerId != null
        ? {
            onRefresh: () => {
              refreshMutation.mutate(triggerId);
            },
          }
        : {})}
    />
  );
}
