import { View, Text, TouchableOpacity } from 'react-native';
import type { PositionPlanViewModel } from '../view-models/PositionPlanViewModel.js';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';

type Props = {
  plan: PositionPlanViewModel;
  onAcknowledge?: () => void;
  onPreview?: () => void;
  onApprove?: () => void;
  isActionPending?: boolean;
};

export function PositionPlanCard({
  plan,
  onAcknowledge,
  onPreview,
  onApprove,
  isActionPending = false,
}: Props): JSX.Element {
  if (plan.status === 'unavailable') {
    return (
      <View
        style={{ padding: 16, backgroundColor: colors.surface, borderRadius: 8, marginTop: 12 }}
      >
        <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
          {plan.unavailableReason ?? 'Plan information unavailable'}
        </Text>
      </View>
    );
  }

  if (plan.status === 'advisory') {
    return (
      <View
        style={{
          padding: 16,
          backgroundColor: colors.surface,
          borderRadius: 8,
          marginTop: 12,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: colors.warning,
                fontSize: typography.fontSize.base,
                fontWeight: typography.fontWeight.semibold,
              }}
            >
              {plan.advisoryKind === 'HOLD' ? 'Hold Advisory' : 'Stand Down Advisory'}
            </Text>
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: typography.fontSize.sm,
                marginTop: 4,
              }}
            >
              Regime: {plan.regimeLabel} | Suitability: {plan.suitabilityLabel}
            </Text>
          </View>
        </View>
        <Text
          style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: 8 }}
        >
          {plan.advisoryKind === 'HOLD'
            ? 'No action recommended at this time. Acknowledge to dismiss.'
            : 'Exit action paused. Stand down confirmed. Acknowledge to continue monitoring.'}
        </Text>
        {plan.canAcknowledge && onAcknowledge && (
          <TouchableOpacity
            onPress={onAcknowledge}
            disabled={isActionPending}
            style={{
              marginTop: 12,
              padding: 12,
              backgroundColor: colors.surfaceElevated,
              borderRadius: 8,
              alignItems: 'center',
              opacity: isActionPending ? 0.5 : 1,
            }}
          >
            <Text
              style={{
                color: colors.primary,
                fontSize: typography.fontSize.base,
                fontWeight: typography.fontWeight.medium,
              }}
            >
              Acknowledge
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (plan.status === 'requesting-exit') {
    return (
      <View
        style={{
          padding: 16,
          backgroundColor: colors.surface,
          borderRadius: 8,
          marginTop: 12,
          borderWidth: 1,
          borderColor: colors.primary,
        }}
      >
        <Text
          style={{
            color: colors.primary,
            fontSize: typography.fontSize.base,
            fontWeight: typography.fontWeight.semibold,
          }}
        >
          Plan Recommends Exit
        </Text>
        <Text
          style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: 4 }}
        >
          Exit Posture: {plan.exitPosture === 'ExitToSOL' ? 'USDC → SOL' : 'SOL → USDC'}
        </Text>
        <Text
          style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: 4 }}
        >
          Regime: {plan.regimeLabel}
        </Text>
        {plan.canPreview && onPreview && (
          <TouchableOpacity
            onPress={onPreview}
            disabled={isActionPending}
            style={{
              marginTop: 12,
              padding: 12,
              backgroundColor: colors.primary,
              borderRadius: 8,
              alignItems: 'center',
              opacity: isActionPending ? 0.5 : 1,
            }}
          >
            <Text
              style={{
                color: colors.background,
                fontSize: typography.fontSize.base,
                fontWeight: typography.fontWeight.bold,
              }}
            >
              Preview Exit
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (plan.status === 'preview-ready') {
    return (
      <View
        style={{
          padding: 16,
          backgroundColor: colors.surface,
          borderRadius: 8,
          marginTop: 12,
          borderWidth: 1,
          borderColor: colors.primary,
        }}
      >
        <Text
          style={{
            color: colors.primary,
            fontSize: typography.fontSize.base,
            fontWeight: typography.fontWeight.semibold,
          }}
        >
          Exit Preview Ready
        </Text>
        <Text
          style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: 4 }}
        >
          Preview ID: {plan.previewId}
        </Text>
        <Text
          style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: 4 }}
        >
          Exit Posture: {plan.exitPosture === 'ExitToSOL' ? 'USDC → SOL' : 'SOL → USDC'}
        </Text>
        {plan.canApprove && onApprove && (
          <TouchableOpacity
            onPress={onApprove}
            disabled={isActionPending}
            style={{
              marginTop: 12,
              padding: 12,
              backgroundColor: colors.primary,
              borderRadius: 8,
              alignItems: 'center',
              opacity: isActionPending ? 0.5 : 1,
            }}
          >
            <Text
              style={{
                color: colors.background,
                fontSize: typography.fontSize.base,
                fontWeight: typography.fontWeight.bold,
              }}
            >
              Approve & Sign
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (plan.status === 'awaiting-signature') {
    return (
      <View
        style={{
          padding: 16,
          backgroundColor: colors.surface,
          borderRadius: 8,
          marginTop: 12,
          borderWidth: 1,
          borderColor: colors.pending,
        }}
      >
        <Text
          style={{
            color: colors.pending,
            fontSize: typography.fontSize.base,
            fontWeight: typography.fontWeight.semibold,
          }}
        >
          Awaiting Signature
        </Text>
        <Text
          style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: 4 }}
        >
          Please sign the transaction in your wallet
        </Text>
        <Text
          style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: 4 }}
        >
          Exit Posture: {plan.exitPosture === 'ExitToSOL' ? 'USDC → SOL' : 'SOL → USDC'}
        </Text>
      </View>
    );
  }

  if (plan.status === 'in-flight') {
    return (
      <View
        style={{
          padding: 16,
          backgroundColor: colors.surface,
          borderRadius: 8,
          marginTop: 12,
          borderWidth: 1,
          borderColor: colors.pending,
        }}
      >
        <Text
          style={{
            color: colors.pending,
            fontSize: typography.fontSize.base,
            fontWeight: typography.fontWeight.semibold,
          }}
        >
          Transaction Submitted
        </Text>
        <Text
          style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: 4 }}
        >
          Attempt ID: {plan.attemptId}
        </Text>
        <Text
          style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: 4 }}
        >
          Exit Posture: {plan.exitPosture === 'ExitToSOL' ? 'USDC → SOL' : 'SOL → USDC'}
        </Text>
      </View>
    );
  }

  if (plan.status === 'result-pending') {
    return (
      <View
        style={{ padding: 16, backgroundColor: colors.surface, borderRadius: 8, marginTop: 12 }}
      >
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: typography.fontSize.base,
            fontWeight: typography.fontWeight.medium,
          }}
        >
          Processing Result...
        </Text>
      </View>
    );
  }

  if (plan.status === 'completed') {
    return (
      <View
        style={{
          padding: 16,
          backgroundColor: colors.surface,
          borderRadius: 8,
          marginTop: 12,
          borderWidth: 1,
          borderColor: colors.success,
        }}
      >
        <Text
          style={{
            color: colors.success,
            fontSize: typography.fontSize.base,
            fontWeight: typography.fontWeight.semibold,
          }}
        >
          Exit Completed
        </Text>
        <Text
          style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: 4 }}
        >
          Your position has been exited successfully
        </Text>
      </View>
    );
  }

  if (plan.status === 'failed') {
    return (
      <View
        style={{
          padding: 16,
          backgroundColor: colors.surface,
          borderRadius: 8,
          marginTop: 12,
          borderWidth: 1,
          borderColor: colors.danger,
        }}
      >
        <Text
          style={{
            color: colors.danger,
            fontSize: typography.fontSize.base,
            fontWeight: typography.fontWeight.semibold,
          }}
        >
          Exit Failed
        </Text>
        <Text
          style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: 4 }}
        >
          The exit transaction failed. Please try again.
        </Text>
      </View>
    );
  }

  if (plan.status === 'conflict') {
    return (
      <View
        style={{
          padding: 16,
          backgroundColor: colors.surface,
          borderRadius: 8,
          marginTop: 12,
          borderWidth: 1,
          borderColor: colors.danger,
        }}
      >
        <Text
          style={{
            color: colors.danger,
            fontSize: typography.fontSize.base,
            fontWeight: typography.fontWeight.semibold,
          }}
        >
          Plan Conflict Detected
        </Text>
        <Text
          style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: 4 }}
        >
          {plan.conflictReason}
        </Text>
      </View>
    );
  }

  if (plan.status === 'superseded') {
    return (
      <View
        style={{
          padding: 16,
          backgroundColor: colors.surface,
          borderRadius: 8,
          marginTop: 12,
          borderWidth: 1,
          borderColor: colors.warning,
        }}
      >
        <Text
          style={{
            color: colors.warning,
            fontSize: typography.fontSize.base,
            fontWeight: typography.fontWeight.semibold,
          }}
        >
          Plan Superseded
        </Text>
        <Text
          style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: 4 }}
        >
          {plan.supersededReason}
        </Text>
      </View>
    );
  }

  if (plan.status === 'stale') {
    return (
      <View
        style={{
          padding: 16,
          backgroundColor: colors.surface,
          borderRadius: 8,
          marginTop: 12,
          borderWidth: 1,
          borderColor: colors.warning,
        }}
      >
        <Text
          style={{
            color: colors.warning,
            fontSize: typography.fontSize.base,
            fontWeight: typography.fontWeight.semibold,
          }}
        >
          Plan Stale
        </Text>
        <Text
          style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: 4 }}
        >
          {plan.staleReason}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ padding: 16, backgroundColor: colors.surface, borderRadius: 8, marginTop: 12 }}>
      <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
        Unknown plan state
      </Text>
    </View>
  );
}
