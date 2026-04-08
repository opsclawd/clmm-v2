import type { BreachDirection } from '@clmm/application/public';
import { buildPreviewStepLabels } from './PreviewStepSequenceUtils.js';
import { View, Text } from 'react-native';
import { colors } from '../design-system/index.js';

type Props = { direction: BreachDirection; estimatedAmounts?: Record<number, string> };

export function PreviewStepSequence({ direction, estimatedAmounts }: Props): JSX.Element {
  const steps = buildPreviewStepLabels(direction);
  return (
    <View>
      {steps.map((step) => (
        <View
          key={step.step}
          style={{ flexDirection: 'row', padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}
        >
          <Text style={{ color: colors.textSecondary, width: 24 }}>{step.step}.</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '600' }}>{step.label}</Text>
            {step.sublabel && (
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{step.sublabel}</Text>
            )}
            {estimatedAmounts?.[step.step] && (
              <Text style={{ color: colors.primary, fontSize: 12 }}>
                {estimatedAmounts[step.step]}
              </Text>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}
