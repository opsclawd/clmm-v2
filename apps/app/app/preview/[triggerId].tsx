import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { ExecutionPreviewScreen } from '@clmm/ui';
import { useStore } from 'zustand';
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
  const hasHydrated = useStore(walletSessionStore, (s) => s.hasHydrated);

  if (triggerId != null && walletAddress == null && hasHydrated) {
    router.push('/connect');
    return null;
  }

  const createMutation = useMutation({
    mutationFn: createPreview,
    retry: 0,
  });

  const refreshMutation = useMutation({
    mutationFn: refreshPreview,
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

  return (
    <ExecutionPreviewScreen
      {...(preview != null ? { preview } : {})}
      previewLoading={createMutation.isPending || refreshMutation.isPending}
      previewError={
        createMutation.error instanceof Error
          ? createMutation.error.message
          : refreshMutation.error instanceof Error
            ? refreshMutation.error.message
            : null
      }
      {...(preview != null && walletAddress != null
        ? {
            onApprove: () => {
              const signingParams: {
                attemptId: string;
                previewId: string;
                triggerId?: string;
                episodeId?: string;
              } = {
                attemptId: 'pending',
                previewId: preview.previewId,
              };
              if (triggerId != null) {
                signingParams.triggerId = triggerId;
              }
              if (preview.episodeId != null) {
                signingParams.episodeId = preview.episodeId;
              }

              router.push({
                pathname: '/signing/[attemptId]',
                params: signingParams,
              });
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
