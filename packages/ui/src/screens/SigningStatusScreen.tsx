import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import type { ExecutionLifecycleState, BreachDirection } from '@clmm/application/public';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';
import { buildExecutionStateViewModel } from '../view-models/ExecutionStateViewModel.js';
import { ExecutionStateCard } from '../components/ExecutionStateCard.js';
import { DirectionalPolicyCard } from '../components/DirectionalPolicyCard.js';

type SigningState = 'idle' | 'preparing' | 'signing' | 'submitting' | 'error';

type Props = {
  lifecycleState?: ExecutionLifecycleState;
  breachDirection?: BreachDirection;
  retryEligible?: boolean;
  signingState: SigningState;
  signingError?: string;
  declineLoading?: boolean;
  statusLoading?: boolean;
  statusError?: string | null;
  statusNotice?: string | null;
  onDecline?: () => void;
  onViewResult?: () => void;
  onSignAndExecute: () => void;
  walletConnected: boolean;
};

function getProgressLabel(signingState: Exclude<SigningState, 'idle' | 'error'>): string {
  switch (signingState) {
    case 'preparing':
      return 'Preparing a fresh transaction payload...';
    case 'signing':
      return 'Waiting for your wallet signature...';
    case 'submitting':
      return 'Submitting the signed transaction...';
  }
}

export function SigningStatusScreen({
  lifecycleState,
  breachDirection,
  retryEligible,
  signingState,
  signingError,
  declineLoading,
  statusLoading,
  statusError,
  statusNotice,
  onDecline,
  onViewResult,
  onSignAndExecute,
  walletConnected,
}: Props) {
  if (statusLoading && !lifecycleState) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: 16 }}>
        <ActivityIndicator color={colors.primary} />
        <Text style={{
          color: colors.text,
          fontSize: typography.fontSize.lg,
          fontWeight: typography.fontWeight.semibold,
          marginTop: 12,
          textAlign: 'center',
        }}>
          Loading signing status
        </Text>
        {statusNotice ? (
          <View style={{
            marginTop: 16,
            padding: 12,
            backgroundColor: '#422006',
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.warning,
            alignSelf: 'stretch',
          }}>
            <Text style={{
              color: colors.warning,
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.medium,
            }}>
              {statusNotice}
            </Text>
          </View>
        ) : null}
      </View>
    );
  }

  if (!lifecycleState && statusError) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 16, justifyContent: 'center' }}>
        <Text style={{ color: colors.text, fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold }}>
          Signing Status
        </Text>
        <Text style={{ color: colors.text, fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, marginTop: 16 }}>
          Could not load signing status
        </Text>
        <Text style={{ color: colors.textSecondary, marginTop: 8 }}>
          {statusError}
        </Text>
        {statusNotice ? (
          <View style={{
            marginTop: 16,
            padding: 12,
            backgroundColor: '#422006',
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.warning,
          }}>
            <Text style={{
              color: colors.warning,
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.medium,
            }}>
              {statusNotice}
            </Text>
          </View>
        ) : null}
      </View>
    );
  }

  if (!lifecycleState) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
        <Text style={{ color: colors.text, fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold }}>
          Signing Status
        </Text>
        <Text style={{ color: colors.textSecondary, marginTop: 8 }}>
          Loading signing status...
        </Text>
        {statusNotice ? (
          <View style={{
            marginTop: 16,
            padding: 12,
            backgroundColor: '#422006',
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.warning,
          }}>
            <Text style={{
              color: colors.warning,
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.medium,
            }}>
              {statusNotice}
            </Text>
          </View>
        ) : null}
      </View>
    );
  }

  const viewModel = buildExecutionStateViewModel(lifecycleState, retryEligible ?? false);
  const canSign =
    signingState === 'idle' &&
    lifecycleState.kind === 'awaiting-signature' &&
    walletConnected;
  const showProgress =
    signingState === 'preparing' || signingState === 'signing' || signingState === 'submitting';
  const showNoWalletMessage =
    lifecycleState.kind === 'awaiting-signature' && !walletConnected;
  const canRetry =
    walletConnected &&
    lifecycleState.kind === 'awaiting-signature';
  const canDecline = lifecycleState.kind === 'awaiting-signature' && onDecline != null;
  const canViewResult =
    onViewResult != null &&
    (lifecycleState.kind === 'submitted' ||
      lifecycleState.kind === 'confirmed' ||
      lifecycleState.kind === 'failed' ||
      lifecycleState.kind === 'expired' ||
      lifecycleState.kind === 'abandoned' ||
      lifecycleState.kind === 'partial');
  const retryDisabled = !canRetry;
  const progressLabel = showProgress ? getProgressLabel(signingState) : undefined;
  const declineDisabled = declineLoading === true;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: 16 }}>
        <Text style={{
          color: colors.text,
          fontSize: typography.fontSize.xl,
          fontWeight: typography.fontWeight.bold,
          marginBottom: 16,
        }}>
          Signing Status
        </Text>

        {statusNotice ? (
          <View style={{
            marginBottom: 16,
            paddingVertical: 8,
            paddingHorizontal: 12,
            backgroundColor: '#422006',
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.warning,
          }}>
            <Text style={{
              color: colors.warning,
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.medium,
            }}>
              {statusNotice}
            </Text>
          </View>
        ) : null}

        {breachDirection ? (
          <View style={{ marginBottom: 16 }}>
            <DirectionalPolicyCard direction={breachDirection} />
          </View>
        ) : null}

        <ExecutionStateCard viewModel={viewModel} />

        {showNoWalletMessage ? (
          <View style={{
            marginTop: 16,
            padding: 12,
            backgroundColor: `${colors.warning}20`,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.warning,
          }}>
            <Text style={{
              color: colors.warning,
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.semibold,
            }}>
              Connect a browser wallet to sign and submit this exit.
            </Text>
          </View>
        ) : null}

        {canDecline ? (
          <TouchableOpacity
            disabled={declineDisabled}
            onPress={declineDisabled ? undefined : onDecline}
            style={{
              marginTop: 16,
              padding: 16,
              backgroundColor: colors.surface,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 8,
              opacity: declineDisabled ? 0.7 : 1,
            }}
          >
            {declineDisabled ? <ActivityIndicator size="small" color={colors.text} /> : null}
            <Text style={{
              color: colors.text,
              fontSize: typography.fontSize.base,
              fontWeight: typography.fontWeight.semibold,
            }}>
              {declineDisabled ? 'Declining...' : 'Decline Signing'}
            </Text>
          </TouchableOpacity>
        ) : null}

        {showProgress ? (
          <View style={{
            marginTop: 16,
            padding: 16,
            backgroundColor: colors.surface,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{
              color: colors.text,
              fontSize: typography.fontSize.base,
              fontWeight: typography.fontWeight.medium,
            }}>
              {progressLabel}
            </Text>
          </View>
        ) : null}

        {canViewResult ? (
          <TouchableOpacity
            onPress={onViewResult}
            style={{
              marginTop: 16,
              padding: 16,
              backgroundColor: colors.surface,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: 'center',
            }}
          >
            <Text style={{
              color: colors.text,
              fontSize: typography.fontSize.base,
              fontWeight: typography.fontWeight.semibold,
            }}>
              View Execution Result
            </Text>
          </TouchableOpacity>
        ) : null}

        {signingState === 'error' ? (
          <View style={{
            marginTop: 16,
            padding: 16,
            backgroundColor: `${colors.danger}20`,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.danger,
          }}>
            <Text style={{
              color: colors.danger,
              fontSize: typography.fontSize.base,
              fontWeight: typography.fontWeight.bold,
            }}>
              Signing error
            </Text>
            <Text style={{
              color: colors.text,
              fontSize: typography.fontSize.sm,
              marginTop: 8,
            }}>
              {signingError ?? 'Something went wrong while signing this execution.'}
            </Text>
            <TouchableOpacity
              disabled={retryDisabled}
              onPress={retryDisabled ? undefined : onSignAndExecute}
              style={{
                marginTop: 16,
                padding: 14,
                backgroundColor: retryDisabled ? colors.surface : colors.danger,
                borderRadius: 8,
                borderWidth: retryDisabled ? 1 : 0,
                borderColor: retryDisabled ? colors.border : colors.danger,
                alignItems: 'center',
              }}
            >
              <Text style={{
                color: retryDisabled ? colors.textSecondary : colors.background,
                fontSize: typography.fontSize.base,
                fontWeight: typography.fontWeight.bold,
              }}>
                Try Again
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {canSign ? (
          <TouchableOpacity
            onPress={onSignAndExecute}
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
              Sign & Execute
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </ScrollView>
  );
}
