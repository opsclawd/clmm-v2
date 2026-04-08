import { colors } from '../design-system/index.js';

type RangeStateKind = 'in-range' | 'below-range' | 'above-range';

export type { RangeStateKind };

type BadgeProps = {
  label: string;
  colorKey: keyof typeof colors;
};

export function getRangeStatusBadgeProps(rangeStateKind: RangeStateKind): BadgeProps {
  switch (rangeStateKind) {
    case 'in-range':
      return { label: 'In Range', colorKey: 'primary' };
    case 'below-range':
      return { label: 'Below Range', colorKey: 'breach' };
    case 'above-range':
      return { label: 'Above Range', colorKey: 'breach' };
    default: {
      const _exhaustive: never = rangeStateKind;
      throw new Error(`Unhandled range state: ${String(_exhaustive)}`);
    }
  }
}
