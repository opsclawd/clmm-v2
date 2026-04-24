import React from 'react';
import Feather from '@expo/vector-icons/Feather';

export type IconName =
  | 'wallet'
  | 'check'
  | 'alert'
  | 'bell'
  | 'layers'
  | 'search'
  | 'gear'
  | 'chevronLeft'
  | 'chevronRight'
  | 'x'
  | 'lock'
  | 'swap'
  | 'arrowRight'
  | 'shield'
  | 'shieldCheck'
  | 'copy'
  | 'info'
  | 'trend'
  | 'radar'
  | 'dot';

const nameMap: Record<IconName, keyof typeof Feather.glyphMap> = {
  wallet: 'credit-card',
  check: 'check',
  alert: 'alert-triangle',
  bell: 'bell',
  layers: 'layers',
  search: 'search',
  gear: 'settings',
  chevronLeft: 'chevron-left',
  chevronRight: 'chevron-right',
  x: 'x',
  lock: 'lock',
  swap: 'repeat',
  arrowRight: 'arrow-right',
  shield: 'shield',
  shieldCheck: 'shield',
  copy: 'copy',
  info: 'info',
  trend: 'trending-up',
  radar: 'activity',
  dot: 'circle',
};

type Props = {
  name: IconName;
  size?: number;
  color?: string;
};

export function Icon({ name, size = 16, color = '#F4F6F8' }: Props): JSX.Element {
  const featherName = nameMap[name];
  return <Feather name={featherName} size={size} color={color} />;
}
