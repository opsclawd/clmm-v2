import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import type { PolicyInsightBlock, PolicyInsightsUnavailableReason } from '@clmm/application/public';
import { colors, typography } from '../design-system/index.js';
import { buildSynthesisViewModel } from '../view-models/SynthesisViewModel.js';

export interface SynthesisScreenProps {
  policyInsight?: PolicyInsightBlock | null;
  isLoading?: boolean;
  isError?: boolean;
  unavailableReason?: PolicyInsightsUnavailableReason | null;
  onBack?: () => void;
  onViewEvidence?: () => void;
}

function unavailableCopy(reason: PolicyInsightsUnavailableReason): string {
  switch (reason) {
    case 'not-found':
      return 'No policy insight is available for this selection.';
    case 'store-unavailable':
      return 'The policy insight store is temporarily unavailable.';
    case 'config-error':
      return 'Policy analysis is not configured.';
    case 'upstream-error':
      return 'The policy insight service could not be reached.';
    case 'malformed':
      return 'The policy insight payload was malformed.';
    default:
      return 'Policy synthesis is currently unavailable.';
  }
}

const cardStyle = {
  padding: 16,
  backgroundColor: colors.surface,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: colors.border,
  marginBottom: 16,
} as const;

const sectionTitleStyle = {
  color: colors.textPrimary,
  fontSize: typography.fontSize.sm,
  fontWeight: typography.fontWeight.bold,
} as const;

const rowStyle = {
  flexDirection: 'row',
  justifyContent: 'space-between',
} as const;

const labelStyle = {
  color: colors.textSecondary,
  fontSize: typography.fontSize.xs,
} as const;

const valueStyle = {
  color: colors.textBody,
  fontSize: typography.fontSize.xs,
} as const;

const valuePrimaryStyle = {
  color: colors.textPrimary,
  fontSize: typography.fontSize.xs,
  fontWeight: typography.fontWeight.semibold,
} as const;

export function SynthesisScreen({
  policyInsight = null,
  isLoading = false,
  isError = false,
  unavailableReason = null,
  onBack,
  onViewEvidence,
}: SynthesisScreenProps): JSX.Element {
  // 1. Loading state (when loading and no insight available)
  if (isLoading && policyInsight == null) {
    return (
      <View
        testID="synthesis-screen-loading"
        style={{
          flex: 1,
          backgroundColor: colors.background,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 16,
        }}
      >
        <ActivityIndicator color={colors.safe} size="large" />
        <Text
          style={{ color: colors.textSecondary, marginTop: 12, fontSize: typography.fontSize.sm }}
        >
          Loading policy synthesis…
        </Text>
      </View>
    );
  }

  // 2. Transport error state (when transport error and no insight)
  if (isError && policyInsight == null && !unavailableReason) {
    return (
      <View
        testID="synthesis-screen-error"
        style={{
          flex: 1,
          backgroundColor: colors.background,
          padding: 16,
        }}
      >
        {onBack ? (
          <TouchableOpacity
            testID="synthesis-back-button"
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{ marginBottom: 16 }}
          >
            <Text style={{ color: colors.primary, fontSize: typography.fontSize.sm }}>← Back</Text>
          </TouchableOpacity>
        ) : null}
        <View
          style={{
            padding: 16,
            backgroundColor: colors.surface,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text
            style={{
              color: colors.textPrimary,
              fontSize: typography.fontSize.md,
              fontWeight: typography.fontWeight.bold,
            }}
          >
            Synthesis Error
          </Text>
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: typography.fontSize.sm,
              marginTop: 8,
            }}
          >
            Failed to load policy synthesis. Please try again.
          </Text>
        </View>
      </View>
    );
  }

  // 3. Unavailable reason state
  if (policyInsight == null && unavailableReason != null) {
    return (
      <View
        testID="synthesis-screen-unavailable"
        style={{
          flex: 1,
          backgroundColor: colors.background,
          padding: 16,
        }}
      >
        {onBack ? (
          <TouchableOpacity
            testID="synthesis-back-button"
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{ marginBottom: 16 }}
          >
            <Text style={{ color: colors.primary, fontSize: typography.fontSize.sm }}>← Back</Text>
          </TouchableOpacity>
        ) : null}
        <View
          style={{
            padding: 16,
            backgroundColor: colors.surface,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text
            style={{
              color: colors.textPrimary,
              fontSize: typography.fontSize.md,
              fontWeight: typography.fontWeight.bold,
            }}
          >
            Synthesis Unavailable
          </Text>
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: typography.fontSize.sm,
              marginTop: 8,
            }}
          >
            {unavailableCopy(unavailableReason)}
          </Text>
        </View>
      </View>
    );
  }

  // Fallback for null policyInsight with no state flags
  if (policyInsight == null) {
    return (
      <View
        testID="synthesis-screen-unavailable"
        style={{
          flex: 1,
          backgroundColor: colors.background,
          padding: 16,
        }}
      >
        {onBack ? (
          <TouchableOpacity
            testID="synthesis-back-button"
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{ marginBottom: 16 }}
          >
            <Text style={{ color: colors.primary, fontSize: typography.fontSize.sm }}>← Back</Text>
          </TouchableOpacity>
        ) : null}
        <View
          style={{
            padding: 16,
            backgroundColor: colors.surface,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: typography.fontSize.sm,
            }}
          >
            No policy insight data available.
          </Text>
        </View>
      </View>
    );
  }

  // 4. Canonical data state
  const vm = buildSynthesisViewModel(policyInsight);

  return (
    <ScrollView
      testID="synthesis-screen-canonical"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16 }}
    >
      {onBack ? (
        <TouchableOpacity
          testID="synthesis-back-button"
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{ marginBottom: 16 }}
        >
          <Text style={{ color: colors.primary, fontSize: typography.fontSize.sm }}>← Back</Text>
        </TouchableOpacity>
      ) : null}

      {isLoading ? (
        <Text
          testID="synthesis-screen-updating"
          style={{
            color: colors.textTertiary,
            fontSize: typography.fontSize.xs,
            marginBottom: 8,
          }}
        >
          Updating policy synthesis…
        </Text>
      ) : null}

      {isError ? (
        <Text
          testID="synthesis-screen-refresh-failed"
          style={{
            color: colors.warn,
            fontSize: typography.fontSize.xs,
            marginBottom: 8,
          }}
        >
          Refresh failed — showing last available policy synthesis.
        </Text>
      ) : null}

      {/* Header & Overview */}
      <View style={{ marginBottom: 16 }}>
        <Text
          style={{
            color: colors.textPrimary,
            fontSize: typography.fontSize.xl,
            fontWeight: typography.fontWeight.bold,
          }}
        >
          Policy Synthesis ({vm.pairLabel})
        </Text>
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: typography.fontSize.xs,
            marginTop: 4,
          }}
        >
          Comprehensive synthesis of directional recommendations and evidence families.
        </Text>
      </View>

      {/* Recommendation Context */}
      <View style={cardStyle}>
        <Text style={sectionTitleStyle}>Recommendation Context</Text>
        <View style={{ gap: 4, marginTop: 8 }}>
          <View style={rowStyle}>
            <Text style={labelStyle}>Action:</Text>
            <Text style={valuePrimaryStyle}>{vm.recommendationLabel}</Text>
          </View>
          <View style={rowStyle}>
            <Text style={labelStyle}>Market Regime:</Text>
            <Text style={valueStyle}>{vm.marketRegimeLabel}</Text>
          </View>
          <View style={rowStyle}>
            <Text style={labelStyle}>Fundamental Regime:</Text>
            <Text style={valueStyle}>{vm.fundamentalRegimeLabel}</Text>
          </View>
          <View style={rowStyle}>
            <Text style={labelStyle}>Confidence:</Text>
            <Text style={valueStyle}>{vm.confidenceLabel}</Text>
          </View>
          <View style={rowStyle}>
            <Text style={labelStyle}>Data Quality:</Text>
            <Text style={valueStyle}>{vm.dataQualityLabel}</Text>
          </View>
        </View>
      </View>

      {/* General Evidence Action */}
      {onViewEvidence ? (
        <TouchableOpacity
          testID="synthesis-view-evidence"
          onPress={onViewEvidence}
          accessibilityRole="button"
          accessibilityLabel="View Contextual Evidence"
          style={{
            backgroundColor: colors.surface,
            padding: 12,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.primary,
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <Text
            style={{
              color: colors.primary,
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.semibold,
            }}
          >
            View Contextual Evidence
          </Text>
        </TouchableOpacity>
      ) : null}

      {/* Complete Reasoning */}
      <View style={cardStyle}>
        <Text style={sectionTitleStyle}>Reasoning</Text>
        <Text style={{ color: colors.textBody, fontSize: typography.fontSize.sm, marginTop: 4 }}>
          {vm.reasoning}
        </Text>
        {vm.reasonBullets.length > 0 ? (
          <View style={{ marginTop: 8 }}>
            {vm.reasonBullets.map((bullet, idx) => (
              <Text
                key={idx}
                style={{
                  color: colors.textSecondary,
                  fontSize: typography.fontSize.xs,
                  marginTop: 2,
                }}
              >
                • {bullet}
              </Text>
            ))}
          </View>
        ) : null}
      </View>

      {/* Evidence Families */}
      <View style={cardStyle}>
        <Text style={sectionTitleStyle}>Evidence Families</Text>
        {vm.familyStatusCaveat ? (
          <Text style={{ color: colors.warn, fontSize: typography.fontSize.xs, marginTop: 4 }}>
            {vm.familyStatusCaveat}
          </Text>
        ) : null}
        <View style={{ marginTop: 8 }}>
          {vm.families.map((family) => (
            <View
              key={family.id}
              testID={`synthesis-family-${family.id}`}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingVertical: 8,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <Text style={{ color: colors.textPrimary, fontSize: typography.fontSize.sm }}>
                {family.label}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
                {family.statusLabel}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Warnings */}
      <View style={cardStyle}>
        <Text style={sectionTitleStyle}>Warnings</Text>
        <View style={{ marginTop: 4 }}>
          {vm.warningLabels.map((warning, idx) => (
            <Text
              key={idx}
              style={{
                color: warning === 'No active warnings' ? colors.textSecondary : colors.warn,
                fontSize: typography.fontSize.xs,
                marginTop: 2,
              }}
            >
              {warning === 'No active warnings' ? warning : `Warning: ${warning}`}
            </Text>
          ))}
        </View>
      </View>

      {/* Selection Policy Metadata */}
      <View style={cardStyle}>
        <Text style={sectionTitleStyle}>Selection Policy Metadata</Text>
        <View style={{ gap: 4, marginTop: 8 }}>
          <View style={rowStyle}>
            <Text style={labelStyle}>Coverage Status:</Text>
            <Text style={valueStyle}>{vm.selectionStatusLabel}</Text>
          </View>
          <View style={rowStyle}>
            <Text style={labelStyle}>Policy Version:</Text>
            <Text style={valueStyle}>{vm.selectionPolicyVersion}</Text>
          </View>
        </View>

        <Text style={{ ...sectionTitleStyle, marginTop: 16 }}>Bundle References</Text>
        <View style={{ marginTop: 4 }}>
          {vm.bundleReferences.length === 0 ? (
            <Text style={{ color: colors.textTertiary, fontSize: typography.fontSize.xs }}>
              No selected bundles
            </Text>
          ) : (
            vm.bundleReferences.map((bundle, idx) => (
              <View key={idx} style={{ marginTop: 6 }}>
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: typography.fontSize.xs,
                    fontWeight: typography.fontWeight.medium,
                  }}
                >
                  Hash: {bundle.bundleHash}
                </Text>
                <Text style={{ color: colors.textTertiary, fontSize: typography.fontSize.xs }}>
                  Publisher: {bundle.publisher} | Source: {bundle.sourceId} | Run: {bundle.runId}
                </Text>
              </View>
            ))
          )}
        </View>

        <Text style={{ ...sectionTitleStyle, marginTop: 16 }}>Source References</Text>
        <View style={{ marginTop: 4 }}>
          {vm.sourceReferences.length === 0 ? (
            <Text style={{ color: colors.textTertiary, fontSize: typography.fontSize.xs }}>
              No selected sources
            </Text>
          ) : (
            vm.sourceReferences.map((source, idx) => (
              <View key={idx} style={{ marginTop: 6 }}>
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: typography.fontSize.xs,
                    fontWeight: typography.fontWeight.medium,
                  }}
                >
                  [{source.sourceTypeLabel}] {source.referenceId}
                </Text>
                <Text style={{ color: colors.textTertiary, fontSize: typography.fontSize.xs }}>
                  Locator: {source.locator} ({source.observedAtLabel})
                </Text>
              </View>
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
}
