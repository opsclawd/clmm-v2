import React from 'react';
import { Text, View } from 'react-native';
import { colors, typography } from '../design-system/index.js';

const PIPELINE_STAGES = [
  ['Collection', 'Sources are observed and normalized into safe reference metadata.'],
  ['Features & claims', 'Observations become deterministic features and contextual claims.'],
  ['Evidence bundle', 'Those records are frozen into the evidence bundle shown below.'],
  ['Synthesis', 'The policy engine selects the source references relevant to this insight.'],
  [
    'Policy insight',
    'The resulting recommendation is advisory and requires your signature to execute.',
  ],
] as const;

const cardStyle = {
  padding: 16,
  backgroundColor: colors.surface,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: colors.border,
  marginBottom: 16,
  gap: 12,
} as const;

export function PipelineExplainer(): JSX.Element {
  return (
    <View testID="pipeline-explainer" style={cardStyle}>
      <Text
        style={{
          color: colors.textPrimary,
          fontSize: typography.fontSize.sm,
          fontWeight: typography.fontWeight.bold,
        }}
      >
        How evidence becomes policy
      </Text>
      <Text style={{ color: colors.textBody, fontSize: typography.fontSize.xs }}>
        A Contributed badge means this insight selected source lineage from that family.
      </Text>
      {PIPELINE_STAGES.map(([title, description], index) => (
        <View key={title} style={{ flexDirection: 'row', gap: 10 }}>
          <Text
            style={{
              color: colors.primary,
              fontSize: typography.fontSize.xs,
              fontWeight: typography.fontWeight.bold,
            }}
          >
            {index + 1}
          </Text>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: colors.textPrimary,
                fontSize: typography.fontSize.xs,
                fontWeight: typography.fontWeight.semibold,
              }}
            >
              {title}
            </Text>
            <Text style={{ color: colors.textBody, fontSize: typography.fontSize.xs }}>
              {description}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}
