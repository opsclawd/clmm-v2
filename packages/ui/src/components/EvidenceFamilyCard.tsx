import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { colors, typography } from '../design-system/index.js';
import type { EvidenceFamilyCardViewModel } from '../view-models/EvidenceViewModel.js';

export interface EvidenceFamilyCardProps {
  card: EvidenceFamilyCardViewModel;
}

const cardStyle = {
  padding: 16,
  backgroundColor: colors.surface,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: colors.border,
  marginBottom: 12,
} as const;

function availabilityColor(availability: EvidenceFamilyCardViewModel['availability']): string {
  switch (availability) {
    case 'available':
      return colors.safe;
    case 'partial':
      return colors.warn;
    case 'invalid':
      return colors.breachAccent;
    case 'unavailable':
    default:
      return colors.textTertiary;
  }
}

export function EvidenceFamilyCard({ card }: EvidenceFamilyCardProps): JSX.Element {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setExpandedRows({});
  }, [card]);

  function toggleRow(rowId: string): void {
    setExpandedRows((current) => ({ ...current, [rowId]: !current[rowId] }));
  }

  const accessibleLabel = `${card.title}, ${card.availability}, ${card.freshnessLabel}`;

  return (
    <View
      testID={`evidence-family-card-${card.id}`}
      accessibilityLabel={accessibleLabel}
      aria-label={accessibleLabel}
      style={cardStyle}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <Text
          style={{
            color: colors.textPrimary,
            fontSize: typography.fontSize.md,
            fontWeight: typography.fontWeight.bold,
          }}
        >
          {card.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text
            style={{
              color: card.stale ? colors.warn : colors.textTertiary,
              fontSize: typography.fontSize.xs,
            }}
          >
            {card.freshnessLabel}
          </Text>
          <Text
            style={{
              color: availabilityColor(card.availability),
              fontSize: typography.fontSize.xs,
              fontWeight: typography.fontWeight.semibold,
              textTransform: 'lowercase',
            }}
          >
            {card.availability}
          </Text>
        </View>
      </View>

      {card.warnings && card.warnings.length > 0 ? (
        <View style={{ marginBottom: 8, gap: 4 }}>
          {card.warnings.map((warning, wIdx) => (
            <Text
              key={wIdx}
              style={{
                color: colors.warn,
                fontSize: typography.fontSize.xs,
              }}
            >
              {warning}
            </Text>
          ))}
        </View>
      ) : null}

      {card.rows.length > 0 ? (
        <View style={{ marginTop: 4, gap: 4 }}>
          {card.rows.map((row, idx) => {
            const isDerivationCapable = Boolean(row.derivation);
            const isExpanded = Boolean(expandedRows[row.label]);
            const derivation = row.derivation;

            return (
              <View key={row.label || idx}>
                {isDerivationCapable ? (
                  <TouchableOpacity
                    testID={`evidence-derivation-toggle-${row.label}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${isExpanded ? 'Collapse' : 'Expand'} derivation for ${row.label}`}
                    accessibilityState={{ expanded: isExpanded }}
                    aria-expanded={isExpanded}
                    onPress={() => toggleRow(row.label)}
                    style={{
                      minHeight: 44,
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Text
                      style={{
                        color: colors.textSecondary,
                        fontSize: typography.fontSize.sm,
                      }}
                    >
                      {row.label}
                    </Text>
                    <Text
                      style={{
                        color: colors.textPrimary,
                        fontSize: typography.fontSize.sm,
                        fontWeight: typography.fontWeight.medium,
                      }}
                    >
                      {row.value}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View
                    style={{
                      minHeight: 44,
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Text
                      style={{
                        color: colors.textSecondary,
                        fontSize: typography.fontSize.sm,
                      }}
                    >
                      {row.label}
                    </Text>
                    <Text
                      style={{
                        color: colors.textPrimary,
                        fontSize: typography.fontSize.sm,
                        fontWeight: typography.fontWeight.medium,
                      }}
                    >
                      {row.value}
                    </Text>
                  </View>
                )}

                {row.warnings && row.warnings.length > 0 ? (
                  <View style={{ marginTop: 2, marginBottom: 4, gap: 2 }}>
                    {row.warnings.map((w, wIdx) => (
                      <Text
                        key={wIdx}
                        style={{
                          color: colors.warn,
                          fontSize: typography.fontSize.xs,
                        }}
                      >
                        {w}
                      </Text>
                    ))}
                  </View>
                ) : null}

                {isExpanded && derivation ? (
                  <View
                    style={{
                      marginTop: 4,
                      marginBottom: 8,
                      padding: 8,
                      backgroundColor: colors.background,
                      borderRadius: 6,
                      gap: 6,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.textPrimary,
                        fontSize: typography.fontSize.xs,
                      }}
                    >
                      {`${row.label} = ${row.value}, from ${derivation.inputCount} ${derivation.inputCount === 1 ? 'observation' : 'observations'} spanning ${derivation.timeSpanLabel}, computed by ${derivation.calculatorLabel}, observed ${derivation.observedAtLabel}, fresh until ${derivation.freshUntilLabel}.`}
                    </Text>
                    <Text
                      testID={`evidence-freshness-status-${row.label}`}
                      style={{
                        color: derivation.isStale ? colors.warn : colors.safe,
                        fontSize: typography.fontSize.xs,
                      }}
                    >
                      {`Status: ${derivation.isStale ? 'Stale' : 'Fresh'}`}
                    </Text>
                    {derivation.inputs.length > 0 ? (
                      <View style={{ marginTop: 4, gap: 4 }}>
                        <Text
                          style={{
                            color: colors.textSecondary,
                            fontSize: typography.fontSize.xs,
                            fontWeight: typography.fontWeight.semibold,
                          }}
                        >
                          Inputs
                        </Text>
                        {derivation.inputs.map((input, inputIdx) => (
                          <View
                            key={`${input.locator}-${inputIdx}`}
                            style={{
                              flexDirection: 'row',
                              justifyContent: 'space-between',
                              flexWrap: 'wrap',
                              gap: 4,
                            }}
                          >
                            <Text
                              style={{
                                color: colors.textSecondary,
                                fontSize: typography.fontSize.xs,
                                fontFamily: 'monospace',
                                flexShrink: 1,
                              }}
                            >
                              {input.locator}
                            </Text>
                            <Text
                              style={{
                                color: colors.textTertiary,
                                fontSize: typography.fontSize.xs,
                              }}
                            >
                              {input.observedAtLabel}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {card.claims.length > 0 ? (
        <View style={{ marginTop: 8, gap: 8 }}>
          {card.claims.map((claim, idx) => (
            <View
              key={idx}
              style={{
                padding: 8,
                backgroundColor: colors.background,
                borderRadius: 6,
                gap: 4,
              }}
            >
              <Text
                style={{
                  color: colors.textPrimary,
                  fontSize: typography.fontSize.sm,
                  fontWeight: typography.fontWeight.medium,
                }}
              >
                {claim.claim}
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <Text
                  style={{
                    color: colors.safe,
                    fontSize: typography.fontSize.xs,
                    fontWeight: typography.fontWeight.semibold,
                  }}
                >
                  {claim.direction}
                </Text>
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: typography.fontSize.xs,
                  }}
                >
                  Confidence: {claim.confidenceLabel}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                }}
              >
                <Text
                  style={{
                    color: colors.textTertiary,
                    fontSize: typography.fontSize.xs,
                  }}
                >
                  Observed: {claim.observedAtLabel}
                </Text>
                <Text
                  style={{
                    color: colors.textTertiary,
                    fontSize: typography.fontSize.xs,
                  }}
                >
                  Expires: {claim.expiresAtLabel}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
