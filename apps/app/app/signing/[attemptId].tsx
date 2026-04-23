import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { SigningStatusScreen } from '@clmm/ui';
import { useStore } from 'zustand';
import {
  approveExecutionPreview,
  fetchExecution,
  fetchExecutionSigningPayload,
  recordSignatureDecline,
  recordSignatureInterruption,
  submitExecution,
} from '../../src/api/executions';
import { signBrowserTransaction } from '../../src/platform/browserWallet';
import { signNativeTransaction } from '../../src/platform/nativeWallet';
import { mapWalletErrorToOutcome } from '../../src/platform/walletConnection';
import { navigateRoute } from '../../src/platform/webNavigation';
import { walletSessionStore } from '../../src/state/walletSessionStore';
import type { ExecutionAttemptDto } from '@clmm/application/public';

function readAttemptId(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && value.length > 0 && value !== 'pending' ? value : null;
}

function readPreviewId(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readTriggerId(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readEpisodeId(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function isPendingAttemptPlaceholder(value: string | string[] | undefined): boolean {
  return typeof value === 'string' && value === 'pending';
}

function canDeclineSigning(params: { displayedExecution: ExecutionAttemptDto | undefined }): boolean {
  return params.displayedExecution?.lifecycleState.kind === 'awaiting-signature';
}

async function recordSigningOutcome(params: {
  recordOutcome: () => Promise<unknown>;
  refetchExecution: () => Promise<unknown>;
  setStatusNotice: (notice: string | null) => void;
  successNotice: string;
}): Promise<void> {
  try {
    await params.recordOutcome();
    await params.refetchExecution();
    params.setStatusNotice(params.successNotice);
  } catch (error: unknown) {
    await params.refetchExecution();
    throw error;
  }
}

export default function SigningRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    attemptId?: string | string[];
    previewId?: string | string[];
    triggerId?: string | string[];
    episodeId?: string | string[];
  }>();
  const attemptId = readAttemptId(params.attemptId);
  const previewId = readPreviewId(params.previewId);
  const triggerId = readTriggerId(params.triggerId);
  const episodeId = readEpisodeId(params.episodeId);
  const hasPendingAttemptPlaceholder = isPendingAttemptPlaceholder(params.attemptId);
  const walletAddress = useStore(walletSessionStore, (state) => state.walletAddress);
  const hasHydrated = useStore(walletSessionStore, (s) => s.hasHydrated);
  const connectionKind = useStore(walletSessionStore, (state) => state.connectionKind);

  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [hasStartedPendingApproval, setHasStartedPendingApproval] = useState(false);

  useEffect(() => {
    if (attemptId == null && walletAddress == null && hasHydrated) {
      navigateRoute({ router, path: '/connect', method: 'push' });
    }
  }, [attemptId, walletAddress, hasHydrated, router]);

  const approveMutation = useMutation({
    mutationFn: approveExecutionPreview,
    retry: 0,
  });

  const isPendingApprovalMode = hasPendingAttemptPlaceholder && attemptId == null;
  const canStartPendingApproval = isPendingApprovalMode && previewId != null && walletAddress != null;

  useEffect(() => {
    if (
      !canStartPendingApproval ||
      hasStartedPendingApproval ||
      approveMutation.isPending ||
      approveMutation.isSuccess
    ) {
      return;
    }

    setHasStartedPendingApproval(true);
    approveMutation.mutate(
      {
        previewId,
        walletId: walletAddress,
        ...(episodeId ? { episodeId } : {}),
      },
        {
          onSuccess: (approval) => {
            navigateRoute({
              router,
              path: `/signing/${approval.attemptId}`,
              method: 'replace',
            });
          },
        },
      );
  }, [
    approveMutation,
    canStartPendingApproval,
    hasStartedPendingApproval,
    previewId,
    router,
    walletAddress,
  ]);

  const executionQuery = useQuery({
    queryKey: ['execution-attempt', attemptId],
    queryFn: () => fetchExecution(attemptId!),
    enabled: attemptId != null,
  });

  const signingPayloadQuery = useQuery({
    queryKey: ['execution-signing-payload', attemptId],
    queryFn: () => fetchExecutionSigningPayload(attemptId!),
    enabled: attemptId != null && executionQuery.data?.lifecycleState.kind === 'awaiting-signature',
  });

  const staleExecutionQuery = useQuery({
    queryKey: ['execution-attempt-stale-refresh', attemptId],
    queryFn: () => fetchExecution(attemptId!),
    enabled:
      attemptId != null &&
      signingPayloadQuery.error instanceof Error &&
      executionQuery.data?.lifecycleState.kind === 'awaiting-signature',
  });

  const displayedExecution =
    signingPayloadQuery.error instanceof Error
      ? (staleExecutionQuery.data ?? executionQuery.data)
      : executionQuery.data;

  const declineAvailable = canDeclineSigning({ displayedExecution });

  const signMutation = useMutation({
    mutationFn: async () => {
      if (
        attemptId == null ||
        walletAddress == null ||
        connectionKind == null ||
        displayedExecution?.lifecycleState.kind !== 'awaiting-signature' ||
        signingPayloadQuery.error instanceof Error ||
        signingPayloadQuery.data == null
      ) {
        throw new Error('Signing is not available for this attempt');
      }

      setStatusNotice(null);

      try {
        const refreshedSigningPayload = await signingPayloadQuery.refetch();

        if (refreshedSigningPayload.error instanceof Error) {
          throw refreshedSigningPayload.error;
        }

        const signingPayload = refreshedSigningPayload.data;
        if (signingPayload == null) {
          throw new Error('Signing payload is no longer available for this attempt.');
        }

        const signedPayload =
          connectionKind === 'browser'
            ? await signBrowserTransaction({
                browserWindow: typeof window === 'undefined' ? undefined : { solana: Reflect.get(window, 'solana') },
                serializedPayload: signingPayload.serializedPayload,
              })
            : await signNativeTransaction({
                serializedPayload: signingPayload.serializedPayload,
                walletId: walletAddress,
              });

        await submitExecution(attemptId, signedPayload, signingPayload.payloadVersion);
        await executionQuery.refetch();
        navigateRoute({
          router,
          path: `/execution/${attemptId}`,
          method: 'replace',
        });
      } catch (error: unknown) {
        const outcome = mapWalletErrorToOutcome(error);

        if (outcome.kind === 'cancelled') {
          await recordSigningOutcome({
            recordOutcome: () => recordSignatureDecline(attemptId),
            refetchExecution: () => executionQuery.refetch(),
            setStatusNotice,
            successNotice: 'You declined wallet signing.',
          });
          return;
        }

        if (outcome.kind === 'interrupted') {
          await recordSigningOutcome({
            recordOutcome: () => recordSignatureInterruption(attemptId),
            refetchExecution: () => executionQuery.refetch(),
            setStatusNotice,
            successNotice: 'Wallet signing was interrupted. Retry when you are ready.',
          });
          return;
        }

        await executionQuery.refetch();
        throw error;
      }
    },
  });

  const declineMutation = useMutation({
    mutationFn: async () => {
      if (attemptId == null) {
        throw new Error('Signing attempt is not available');
      }

      setStatusNotice(null);
      await recordSigningOutcome({
        recordOutcome: () => recordSignatureDecline(attemptId),
        refetchExecution: () => executionQuery.refetch(),
        setStatusNotice,
        successNotice: 'You declined wallet signing.',
      });
    },
  });

  if (attemptId == null && walletAddress == null) {
    return null;
  }

  return (
    <SigningStatusScreen
      {...(displayedExecution != null
        ? {
            lifecycleState: displayedExecution.lifecycleState,
            ...(displayedExecution.breachDirection != null ? { breachDirection: displayedExecution.breachDirection } : {}),
            ...(displayedExecution.retryEligible != null ? { retryEligible: displayedExecution.retryEligible } : {}),
          }
        : {})}
      declineLoading={declineMutation.isPending}
      statusLoading={
        (isPendingApprovalMode &&
          !hasStartedPendingApproval &&
          approveMutation.error == null &&
          previewId != null &&
          walletAddress != null) ||
        approveMutation.isPending ||
        executionQuery.isLoading ||
        staleExecutionQuery.isLoading ||
        signingPayloadQuery.isLoading ||
        signMutation.isPending ||
        declineMutation.isPending
      }
      statusError={
        isPendingApprovalMode && previewId == null
          ? 'Could not start signing flow: missing preview reference.'
          : isPendingApprovalMode && walletAddress == null
            ? 'Connect your wallet to continue signing.'
            : approveMutation.error instanceof Error
          ? approveMutation.error.message
          : executionQuery.error instanceof Error
          ? executionQuery.error.message
          : staleExecutionQuery.error instanceof Error
            ? staleExecutionQuery.error.message
            : signingPayloadQuery.error instanceof Error
              ? signingPayloadQuery.error.message
              : signMutation.error instanceof Error
                ? signMutation.error.message
                : declineMutation.error instanceof Error
                  ? declineMutation.error.message
                  : null
      }
      statusNotice={statusNotice}
      onGoHome={() => {
        navigateRoute({
          router,
          path: '/(tabs)/positions',
          method: 'replace',
        });
      }}
      {...(isPendingApprovalMode
        ? {
            ...(triggerId != null
                ? {
                    onRefreshQuote: () => {
                      navigateRoute({
                        router,
                        path: `/preview/${triggerId}`,
                        method: 'replace',
                      });
                    },
                  }
              : {}),
          }
        : {})}
      {...(declineAvailable
        ? {
            ...(declineAvailable
              ? {
                  onDecline: () => {
                    if (declineMutation.isPending) {
                      return;
                    }

                    declineMutation.mutate();
                  },
                }
              : {}),
          }
        : {})}
      {...(attemptId != null
        ? {
            onViewResult: () => {
              navigateRoute({
                router,
                path: `/execution/${attemptId}`,
                method: 'push',
              });
            },
          }
        : {})}
      signingState={displayedExecution?.lifecycleState.kind === 'awaiting-signature'
        ? (signMutation.isError ? 'error' : signMutation.isPending ? 'signing' : 'idle')
        : 'idle'}
      walletConnected={walletAddress != null}
      onSignAndExecute={() => {
        signMutation.mutate();
      }}
      {...(signMutation.error instanceof Error ? { signingError: signMutation.error.message } : {})}
    />
  );
}
