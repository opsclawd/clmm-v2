import { useState } from 'react';
import { Pressable, View, Text, Linking } from 'react-native';
import { colors, typography } from '../design-system/index.js';
import type { SrThesisCardViewModel, SrThesisBiasTone } from '../view-models/SrThesesViewModel.js';

const toneColor = (tone: SrThesisBiasTone): string => {
  switch (tone) {
    case 'safe':
      return colors.safe;
    case 'breach':
      return colors.breachAccent;
    case 'warn':
      return colors.warn;
    case 'neutral':
      return colors.textSecondary;
  }
};

type Props = {
  card: SrThesisCardViewModel;
};

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function SrThesisCard({ card }: Props): JSX.Element {
  const [rawExpanded, setRawExpanded] = useState(false);
  const biasColor = toneColor(card.biasTone);

  return (
    <View
      style={{
        marginTop: 10,
        padding: 14,
        backgroundColor: colors.surfaceRecessed,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {card.bias ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              height: 22,
              paddingHorizontal: 10,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: 'rgba(244,201,122,0.30)',
            }}
          >
            <Text
              style={{
                fontSize: typography.fontSize.micro,
                color: biasColor,
                fontWeight: typography.fontWeight.semibold,
              }}
            >
              {card.bias}
            </Text>
          </View>
        ) : null}
        <Text style={{ color: colors.textMuted, fontSize: typography.fontSize.micro }}>
          {card.timeframe}
        </Text>
        {card.setupType ? (
          <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.micro }}>
            {card.setupType}
          </Text>
        ) : null}
      </View>

      {card.supportLevels.length > 0 ? (
        <LabelledList label="Support" items={card.supportLevels} accent={colors.safe} />
      ) : null}
      {card.resistanceLevels.length > 0 ? (
        <LabelledList label="Resist" items={card.resistanceLevels} accent={colors.breachAccent} />
      ) : null}
      {card.entryZone ? <KeyValue label="Entry" value={card.entryZone} /> : null}
      {card.targets.length > 0 ? (
        <LabelledList label="Targets" items={card.targets} accent={colors.safe} />
      ) : null}
      {card.invalidation ? (
        <KeyValue label="Invalidation" value={card.invalidation} accent={colors.safe} />
      ) : null}
      {card.trigger ? (
        <KeyValue label="Trigger" value={card.trigger} accent={colors.breachAccent} />
      ) : null}

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
        <Text style={{ fontSize: typography.fontSize.micro, color: colors.textMuted }}>
          {card.sourceHandle}
        </Text>
        <Text style={{ fontSize: typography.fontSize.micro, color: colors.textSecondary }}>
          {card.sourceKind}
        </Text>
        {card.sourceReliability ? (
          <Text style={{ fontSize: typography.fontSize.micro, color: colors.textSecondary }}>
            reliability · {card.sourceReliability}
          </Text>
        ) : null}
        {card.timestampLabel ? (
          <Text style={{ fontSize: typography.fontSize.micro, color: colors.textMuted }}>
            {card.timestampLabel}
          </Text>
        ) : null}
        {card.sourceUrl && isSafeUrl(card.sourceUrl) ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => {
              void Linking.openURL(card.sourceUrl!);
            }}
          >
            <Text style={{ fontSize: typography.fontSize.micro, color: colors.safe }}>Source</Text>
          </Pressable>
        ) : null}
        {card.chartReference ? (
          <Text style={{ fontSize: typography.fontSize.micro, color: colors.textSecondary }}>
            chart · {card.chartReference}
          </Text>
        ) : null}
      </View>

      {card.rawThesisText ? (
        <View style={{ marginTop: 10 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show raw thesis"
            onPress={() => setRawExpanded((v) => !v)}
          >
            <Text style={{ fontSize: typography.fontSize.micro, color: colors.textSecondary }}>
              {rawExpanded ? 'Hide raw thesis' : 'Show raw thesis'}
            </Text>
          </Pressable>
          {rawExpanded ? (
            <Text style={{ fontSize: typography.fontSize.xs, color: colors.text, marginTop: 6 }}>
              {card.rawThesisText}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function LabelledList({
  label,
  items,
  accent,
}: {
  label: string;
  items: readonly string[];
  accent: string;
}): JSX.Element {
  return (
    <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text
        style={{
          fontSize: typography.fontSize.micro,
          color: accent,
          fontWeight: typography.fontWeight.semibold,
        }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '4px 8px' }}>
        {items.map((value, idx) => (
          <Text
            key={`${label}-${idx}`}
            style={{
              fontFamily: typography.fontFamily.mono,
              fontSize: typography.fontSize.xs,
              color: colors.text,
            }}
          >
            {value}
          </Text>
        ))}
      </View>
    </View>
  );
}

function KeyValue({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}): JSX.Element {
  return (
    <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text
        style={{
          fontSize: typography.fontSize.micro,
          color: accent ?? colors.textSecondary,
          fontWeight: typography.fontWeight.semibold,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: typography.fontFamily.mono,
          fontSize: typography.fontSize.xs,
          color: colors.text,
        }}
      >
        {value}
      </Text>
    </View>
  );
}
