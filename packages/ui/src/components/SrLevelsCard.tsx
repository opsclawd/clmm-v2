import { View, Text } from 'react-native';
import { colors, typography } from '../design-system/index.js';
import type { SrLevelsViewModelBlock } from '../view-models/PositionDetailViewModel.js';

const toneColors = {
  safe: {
    text: colors.safe,
    border: 'rgba(158,236,209,0.30)',
    bg: 'rgba(158,236,209,0.08)',
  },
  warn: {
    text: colors.warn,
    border: 'rgba(244,201,122,0.30)',
    bg: 'rgba(244,201,122,0.08)',
  },
  breach: {
    text: colors.breachAccent,
    border: 'rgba(245,148,132,0.30)',
    bg: 'rgba(245,148,132,0.08)',
  },
} as const;

function TriggerInvalidationSection({
  label,
  text,
  labelColor,
}: {
  label: string;
  text: string;
  labelColor: string;
}): JSX.Element {
  return (
    <View
      style={{
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}
    >
      <Text
        style={{
          fontSize: typography.fontSize.micro,
          color: labelColor,
          fontWeight: typography.fontWeight.semibold,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: typography.fontSize.micro,
          color: colors.textMuted,
          lineHeight: 16,
          marginTop: 2,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

type Props = {
  srLevels?: SrLevelsViewModelBlock | undefined;
};

export function SrLevelsCard({ srLevels }: Props): JSX.Element {
  if (!srLevels) {
    return (
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: typography.fontSize.sm,
          marginTop: 16,
        }}
      >
        No current MCO levels available
      </Text>
    );
  }

  return (
    <View
      style={{
        marginTop: 14,
        padding: 16,
        backgroundColor: colors.surface,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.medium,
          }}
        >
          Support & Resistance
        </Text>
        <Text
          style={{
            fontSize: typography.fontSize.micro,
            color: colors.textMuted,
          }}
        >
          {srLevels.freshnessLabel}
        </Text>
      </View>

      {/* Groups */}
      {srLevels.groups.map((group, gi) => (
        <View
          key={`sr-group-${gi}`}
          testID={`sr-group-${gi}`}
          style={{
            backgroundColor: colors.surfaceRecessed,
            borderRadius: 10,
            padding: 14,
            marginTop: gi === 0 ? 0 : 10,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          {/* Group header: bias pill + cluster label */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10,
            }}
          >
            {group.bias ? (
              <View
                style={{
                  height: 22,
                  paddingHorizontal: 10,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: 'rgba(244,201,122,0.30)',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: typography.fontSize.micro,
                    color: colors.warn,
                    fontWeight: typography.fontWeight.semibold,
                  }}
                >
                  {group.bias}
                </Text>
              </View>
            ) : (
              <View />
            )}
            <Text
              style={{
                fontSize: typography.fontSize.micro,
                color: colors.textMuted,
                textTransform: 'uppercase',
                letterSpacing: 0.06,
              }}
            >
              {group.levels[0]?.kind === 'resistance'
                ? 'Resistance Cluster'
                : 'Support Cluster'}
            </Text>
          </View>

          {/* Levels */}
          {group.levels.map((lv, li) => {
            const tone = toneColors[lv.tone];
            return (
              <View
                key={`sr-level-${gi}-${li}`}
                testID={`sr-level-${gi}-${li}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: li === 0 ? 0 : 8,
                  borderTopWidth: li === 0 ? 0 : 1,
                  borderTopColor: colors.border,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <View
                    style={{
                      height: 22,
                      paddingHorizontal: 8,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: tone.border,
                      backgroundColor: tone.bg,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: typography.fontSize.micro,
                        color: tone.text,
                        fontWeight: typography.fontWeight.semibold,
                      }}
                    >
                      {lv.kind === 'resistance' ? 'Resist' : 'Support'}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontFamily: typography.fontFamily.mono,
                      fontSize: typography.fontSize.sm,
                      fontWeight: typography.fontWeight.semibold,
                      color: colors.text,
                    }}
                  >
                    {lv.priceLabel}
                  </Text>
                </View>
              </View>
            );
          })}

          {/* Trigger */}
          {group.trigger ? (
            <TriggerInvalidationSection
              label="Trigger"
              text={group.trigger}
              labelColor={colors.breachAccent}
            />
          ) : null}

          {/* Invalidation */}
          {group.invalidation ? (
            <TriggerInvalidationSection
              label="Invalidation"
              text={group.invalidation}
              labelColor={colors.safe}
            />
          ) : null}

          {/* Shared note */}
          {group.note ? (
            <View
              style={{
                marginTop: 10,
                paddingTop: 10,
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              <Text
                style={{
                  fontSize: typography.fontSize.micro,
                  color: colors.textMuted,
                  lineHeight: 16,
                }}
              >
                {group.note}
              </Text>
            </View>
          ) : null}

          {/* Metadata footer */}
          {(group.source || group.timeframe || group.setupType) ? (
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: '4px 14px',
                marginTop: 10,
                paddingTop: 10,
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              {group.source ? (
                <Text
                  style={{
                    fontSize: typography.fontSize.micro,
                    color: colors.textMuted,
                    textTransform: 'uppercase',
                    letterSpacing: 0.04,
                  }}
                >
                  Source ·{' '}
                  <Text style={{ color: colors.textSecondary }}>
                    {group.source}
                  </Text>
                </Text>
              ) : null}
              {group.timeframe ? (
                <Text
                  style={{
                    fontSize: typography.fontSize.micro,
                    color: colors.textMuted,
                    textTransform: 'uppercase',
                    letterSpacing: 0.04,
                  }}
                >
                  TF ·{' '}
                  <Text style={{ color: colors.textSecondary }}>
                    {group.timeframe}
                  </Text>
                </Text>
              ) : null}
              {group.setupType ? (
                <Text
                  style={{
                    fontSize: typography.fontSize.micro,
                    color: colors.textMuted,
                    textTransform: 'uppercase',
                    letterSpacing: 0.04,
                  }}
                >
                  Setup ·{' '}
                  <Text style={{ color: colors.textSecondary }}>
                    {group.setupType}
                  </Text>
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}
