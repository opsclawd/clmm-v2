import { useState } from 'react';
import { Pressable, View, Text } from 'react-native';
import { colors, typography } from '../design-system/index.js';
import type { SrThesesViewModel } from '../view-models/SrThesesViewModel.js';
import { SrThesisCard } from './SrThesisCard.js';

type Props = {
  vm: SrThesesViewModel;
};

export function SrThesesPanel({ vm }: Props): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const cardsToRender = expanded ? vm.cards : vm.visibleCards;

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
            color: colors.textSecondary,
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.medium,
          }}
        >
          S/R Theses · {vm.sourceLabel}
        </Text>
        <Text style={{ fontSize: typography.fontSize.micro, color: colors.textMuted }}>
          {vm.freshnessLabel}
        </Text>
      </View>

      {vm.briefSummary ? (
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: typography.fontSize.xs,
            marginBottom: 4,
          }}
        >
          {vm.briefSummary}
        </Text>
      ) : null}

      {cardsToRender.map((card, idx) => (
        <SrThesisCard key={`${card.sourceHandle}-${card.timestampLabel ?? idx}`} card={card} />
      ))}

      {!expanded && vm.remainingCount > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show more"
          onPress={() => setExpanded(true)}
        >
          <Text
            style={{
              marginTop: 10,
              fontSize: typography.fontSize.xs,
              color: colors.safe,
              fontWeight: typography.fontWeight.semibold,
            }}
          >
            Show more ({vm.remainingCount})
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
