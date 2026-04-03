import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SigningStatusScreen, colors, typography } from '@clmm/ui';
import { Text, TouchableOpacity, View } from 'react-native';
import { useStore } from 'zustand';
import { Buffer } from 'buffer';
import { fetchExecution, prepareExecution, submitExecution } from '../../src/api/executions.js';
import { signTransactionWithBrowserWallet } from '../../src/platform/browserWallet.js';
import { walletSessionStore } from '../../src/state/walletSessionStore.js';

type SigningState = 'idle' | 'preparing' | 'signing' | 'submitting' | 'error';

function decodeBase64ToBytes(encodedValue: string): Uint8Array {
  return Uint8Array.from(Buffer.from(encodedValue, 'base64'));
}

function encodeBytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function getExecutionQueryErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return 'Could not load signing status for this execution attempt.';
}

export default function SigningRoute() {
  const { attemptId } = useLocalSearchParams<{ attemptId: string }>();
  const router = useRouter();
  const walletAddress = useStore(walletSessionStore, (state) => state.walletAddress);
  const [signingState, setSigningState] = useState<SigningState>('idle');
  const [signingError, setSigningError] = useState<string | undefined>();
  const resolvedAttemptId = typeof attemptId === 'string' && attemptId.length > 0 ? attemptId : undefined;

  const executionQuery = useQuery({
    queryKey: ['execution', resolvedAttemptId],
    queryFn: async () => {
      if (!resolvedAttemptId) {
        throw new Error('Missing execution attempt id');
      }

      return fetchExecution(resolvedAttemptId);
    },
    enabled: resolvedAttemptId != null,
    refetchInterval: (query) => {
      const state = query.state.data?.lifecycleState?.kind;
      if (state === 'submitted') {
        return 5_000;
      }
      return false;
    },
  });

  const attempt = executionQuery.data;

  const currentState = attempt?.lifecycleState?.kind;
  useEffect(() => {
    if (!resolvedAttemptId) {
      return;
    }

    if (
      currentState === 'confirmed' ||
      currentState === 'failed' ||
      currentState === 'partial' ||
      currentState === 'abandoned'
    ) {
      router.replace(`/execution/${resolvedAttemptId}`);
    }
  }, [currentState, resolvedAttemptId, router]);

  async function handleSignAndExecute() {
    if (!resolvedAttemptId) {
      setSigningState('error');
      setSigningError('Missing execution attempt id');
      return;
    }

    if (!walletAddress) {
      setSigningState('error');
      setSigningError('Connect a wallet to continue');
      return;
    }

    if (attempt?.lifecycleState.kind !== 'awaiting-signature') {
      router.replace(`/execution/${resolvedAttemptId}`);
      return;
    }

    if (typeof window === 'undefined') {
      setSigningState('error');
      setSigningError('Browser wallet signing is only supported in this pass.');
      return;
    }

    try {
      setSigningState('preparing');
      setSigningError(undefined);

      const prepared = await prepareExecution(resolvedAttemptId, walletAddress);

      setSigningState('signing');
      const unsignedPayload = decodeBase64ToBytes(prepared.unsignedPayloadBase64);
      const browserWindow = { solana: Reflect.get(window, 'solana') as unknown };
      const signedPayload = await signTransactionWithBrowserWallet(browserWindow, unsignedPayload);
      const signedPayloadBase64 = encodeBytesToBase64(signedPayload);

      setSigningState('submitting');
      await submitExecution(resolvedAttemptId, signedPayloadBase64, prepared.payloadVersion);

      const refreshedAttempt = await executionQuery.refetch();
      const refreshedState = refreshedAttempt.data?.lifecycleState?.kind;

      if (
        refreshedState !== 'submitted' &&
        refreshedState !== 'confirmed' &&
        refreshedState !== 'failed' &&
        refreshedState !== 'partial'
      ) {
        setSigningState('idle');
      }
    } catch (error: unknown) {
      setSigningState('error');
      setSigningError(error instanceof Error ? error.message : 'Signing failed');
    }
  }

  if (executionQuery.isError) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 16, justifyContent: 'center' }}>
        <Text style={{ color: colors.text, fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold }}>
          Signing Status
        </Text>
        <Text style={{ color: colors.textSecondary, marginTop: 8 }}>
          {getExecutionQueryErrorMessage(executionQuery.error)}
        </Text>
        <TouchableOpacity
          onPress={() => {
            void executionQuery.refetch();
          }}
          style={{
            marginTop: 20,
            padding: 16,
            backgroundColor: colors.primary,
            borderRadius: 8,
            alignItems: 'center',
          }}
        >
          <Text style={{
            color: colors.background,
            fontSize: typography.fontSize.base,
            fontWeight: typography.fontWeight.bold,
          }}>
            Retry Load
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SigningStatusScreen
      {...(attempt?.lifecycleState ? { lifecycleState: attempt.lifecycleState } : {})}
      {...(attempt?.breachDirection ? { breachDirection: attempt.breachDirection } : {})}
      {...(attempt?.retryEligible != null ? { retryEligible: attempt.retryEligible } : {})}
      signingState={signingState}
      {...(signingError != null ? { signingError } : {})}
      onSignAndExecute={() => {
        void handleSignAndExecute();
      }}
      walletConnected={walletAddress != null && walletAddress.length > 0}
    />
  );
}
