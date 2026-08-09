import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import type {
  EvidenceBundle,
  EvidenceUnavailableReason,
  PolicyInsightBlock,
  PolicyInsightsUnavailableReason,
} from '@clmm/application/public';
import { colors, typography } from '../design-system/index.js';
import { buildEvidenceViewModel } from '../view-models/EvidenceViewModel.js';
import { EvidenceFamilyCard } from '../components/EvidenceFamilyCard.js';
import { ReasonCodesExplainer } from '../components/ReasonCodesExplainer.js';

export interface EvidenceScreenProps {
  evidence?: EvidenceBundle | null;
  isLoading?: boolean;
  isError?: boolean;
  unavailableReason?: EvidenceUnavailableReason | null;
  policyInsight?: PolicyInsightBlock | null;
  isPolicyInsightLoading?: boolean;
  isPolicyInsightError?: boolean;
  policyInsightUnavailableReason?: PolicyInsightsUnavailableReason | null;
  now: number;
  pair?: string;
  onBack?: () => void;
}

function unavailableCopy(reason: EvidenceUnavailableReason): string {
  switch (reason) {
    case 'not-found':
      return 'No evidence bundle is available for this selection.';
    case 'store-unavailable':
      return 'The evidence store is temporarily unavailable.';
    case 'config-error':
      return 'Evidence analysis is not configured.';
    case 'upstream-error':
      return 'The evidence service could not be reached.';
    case 'malformed':
      return 'The evidence payload was malformed.';
    default:
      return 'Evidence is currently unavailable.';
  }
}

export function EvidenceScreen({
  evidence,
  isLoading = false,
  isError = false,
  unavailableReason = null,
  policyInsight = null,
  isPolicyInsightLoading = false,
  isPolicyInsightError = false,
  policyInsightUnavailableReason = null,
  now,
  pair,
  onBack,
}: EvidenceScreenProps): JSX.Element {
  // 1. Loading state (when loading and no evidence loaded yet)
  if (isLoading && evidence == null) {
    return (
      <View
        testID="evidence-screen-loading"
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
          Loading evidence…
        </Text>
      </View>
    );
  }

  // 2. Transport error state (when transport error and no evidence bundle)
  if (isError && evidence == null && !unavailableReason) {
    return (
      <View
        testID="evidence-screen-error"
        style={{
          flex: 1,
          backgroundColor: colors.background,
          padding: 16,
        }}
      >
        {onBack ? (
          <TouchableOpacity
            testID="evidence-back-button"
            onPress={onBack}
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
            Evidence Error
          </Text>
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: typography.fontSize.sm,
              marginTop: 8,
            }}
          >
            Failed to load evidence. Please try again.
          </Text>
        </View>
      </View>
    );
  }

  // 3. Degraded / unavailable state
  if (evidence == null && unavailableReason != null) {
    return (
      <View
        testID="evidence-screen-unavailable"
        style={{
          flex: 1,
          backgroundColor: colors.background,
          padding: 16,
        }}
      >
        {onBack ? (
          <TouchableOpacity
            testID="evidence-back-button"
            onPress={onBack}
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
            Evidence Unavailable
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

  // Fallback for null evidence with no other state flag
  if (evidence == null) {
    return (
      <View
        testID="evidence-screen-unavailable"
        style={{
          flex: 1,
          backgroundColor: colors.background,
          padding: 16,
        }}
      >
        {onBack ? (
          <TouchableOpacity
            testID="evidence-back-button"
            onPress={onBack}
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
            No evidence data available.
          </Text>
        </View>
      </View>
    );
  }

  // 4. Canonical data state
  const vm = buildEvidenceViewModel(evidence, now);
  const displayPair = pair ?? evidence.pair ?? 'SOL/USDC';

  return (
    <ScrollView
      testID="evidence-screen-canonical"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16 }}
    >
      {onBack ? (
        <TouchableOpacity
          testID="evidence-back-button"
          onPress={onBack}
          style={{ marginBottom: 16 }}
        >
          <Text style={{ color: colors.primary, fontSize: typography.fontSize.sm }}>← Back</Text>
        </TouchableOpacity>
      ) : null}

      {/* Policy Insight Reason Codes Explainer */}
      <ReasonCodesExplainer
        policyInsight={policyInsight}
        isLoading={isPolicyInsightLoading}
        isError={isPolicyInsightError}
        unavailableReason={policyInsightUnavailableReason}
        evidenceRunId={evidence.runId}
      />

      {/* Header */}
      <View style={{ marginBottom: 16 }}>
        <Text
          style={{
            color: colors.textPrimary,
            fontSize: typography.fontSize.xl,
            fontWeight: typography.fontWeight.bold,
          }}
        >
          Evidence Detail ({displayPair})
        </Text>
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: typography.fontSize.xs,
            marginTop: 4,
          }}
        >
          Deterministic features and contextual evidence supporting policy recommendations.
        </Text>
      </View>

      {/* Summary Box */}
      <View
        style={{
          padding: 16,
          backgroundColor: colors.surface,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          marginBottom: 16,
          gap: 4,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs }}>
            Last collected:
          </Text>
          <Text
            style={{
              color: colors.textPrimary,
              fontSize: typography.fontSize.xs,
              fontWeight: typography.fontWeight.medium,
            }}
          >
            {vm.lastCollectedLabel}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs }}>
            As of:
          </Text>
          <Text style={{ color: colors.textTertiary, fontSize: typography.fontSize.xs }}>
            {vm.asOfLabel}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs }}>
            Fresh until:
          </Text>
          <Text style={{ color: colors.textTertiary, fontSize: typography.fontSize.xs }}>
            {vm.freshUntilLabel}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs }}>
            Expires:
          </Text>
          <Text style={{ color: colors.textTertiary, fontSize: typography.fontSize.xs }}>
            {vm.expiresAtLabel}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
          <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs }}>
            Confidence:
          </Text>
          <Text style={{ color: colors.textPrimary, fontSize: typography.fontSize.xs }}>
            {vm.overallConfidenceLabel}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs }}>
            Quality:
          </Text>
          <Text style={{ color: colors.textPrimary, fontSize: typography.fontSize.xs }}>
            {vm.qualityLabel}
          </Text>
        </View>
        {vm.isStale ? (
          <Text
            style={{
              color: colors.warn,
              fontSize: typography.fontSize.xs,
              marginTop: 4,
            }}
          >
            Stale evidence bundle — data may be outdated.
          </Text>
        ) : null}
      </View>

      {/* Research Brief */}
      {vm.brief ? (
        <View
          style={{
            padding: 16,
            backgroundColor: colors.surface,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 16,
            gap: 8,
          }}
        >
          <Text
            style={{
              color: colors.textPrimary,
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.bold,
            }}
          >
            Research Brief
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs }}>
            Model: {vm.brief.modelLabel}
          </Text>
          <Text style={{ color: colors.textBody, fontSize: typography.fontSize.sm }}>
            {vm.brief.summary}
          </Text>
          {vm.brief.keyFindings.length > 0 ? (
            <View style={{ marginTop: 4 }}>
              <Text
                style={{
                  color: colors.textPrimary,
                  fontSize: typography.fontSize.xs,
                  fontWeight: typography.fontWeight.semibold,
                  marginBottom: 2,
                }}
              >
                Key Findings:
              </Text>
              {vm.brief.keyFindings.map((finding, idx) => (
                <Text
                  key={idx}
                  style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs }}
                >
                  • {finding}
                </Text>
              ))}
            </View>
          ) : null}
          {vm.brief.uncertainties.length > 0 ? (
            <View style={{ marginTop: 4 }}>
              <Text
                style={{
                  color: colors.textPrimary,
                  fontSize: typography.fontSize.xs,
                  fontWeight: typography.fontWeight.semibold,
                  marginBottom: 2,
                }}
              >
                Uncertainties:
              </Text>
              {vm.brief.uncertainties.map((unc, idx) => (
                <Text
                  key={idx}
                  style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs }}
                >
                  • {unc}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Warnings */}
      {vm.warnings.length > 0 ? (
        <View
          testID="evidence-general-warnings"
          style={{
            padding: 12,
            backgroundColor: colors.surface,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.warn,
            marginBottom: 16,
            gap: 4,
          }}
        >
          <Text
            style={{
              color: colors.warn,
              fontSize: typography.fontSize.xs,
              fontWeight: typography.fontWeight.semibold,
            }}
          >
            General warnings:
          </Text>
          {vm.warnings.map((w, idx) => (
            <Text key={idx} style={{ color: colors.warn, fontSize: typography.fontSize.xs }}>
              • {w}
            </Text>
          ))}
        </View>
      ) : null}

      {/* Family Cards */}
      <View style={{ marginTop: 4 }}>
        {vm.cards.map((card) => (
          <EvidenceFamilyCard key={card.id} card={card} />
        ))}
      </View>
    </ScrollView>
  );
}
