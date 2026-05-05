export type TokenPair = { a: string; b: string };

export function splitTokenPair(label: string): TokenPair {
  if (!label) return { a: '', b: '' };
  const parts = label.split('/');
  if (parts.length < 2) return { a: label.trim(), b: '' };
  return { a: (parts[0] ?? '').trim(), b: (parts[1] ?? '').trim() };
}

const POOL_ID_HEAD = 4;
const POOL_ID_TAIL = 4;

export function formatPoolId(poolId: string | undefined | null): string {
  if (!poolId) return '';
  if (poolId.length <= POOL_ID_HEAD + POOL_ID_TAIL) return poolId;
  return `${poolId.slice(0, POOL_ID_HEAD)}…${poolId.slice(-POOL_ID_TAIL)}`;
}

export type NearEdgeInput = {
  currentPrice: number;
  lowerBoundPrice: number;
  upperBoundPrice: number;
};

const NEAR_EDGE_FRACTION = 0.1;

export function isNearEdge({
  currentPrice,
  lowerBoundPrice,
  upperBoundPrice,
}: NearEdgeInput): boolean {
  if (
    !Number.isFinite(currentPrice) ||
    !Number.isFinite(lowerBoundPrice) ||
    !Number.isFinite(upperBoundPrice)
  ) {
    return false;
  }
  const width = upperBoundPrice - lowerBoundPrice;
  if (width <= 0) return false;
  const threshold = width * NEAR_EDGE_FRACTION;
  return currentPrice - lowerBoundPrice <= threshold || upperBoundPrice - currentPrice <= threshold;
}

export type StatusChipProps = {
  tone: 'safe' | 'warn' | 'breach';
  label: string;
};

export type StatusChipInput = {
  rangeStatusKind: 'in-range' | 'below-range' | 'above-range';
  hasAlert: boolean;
  nearEdge: boolean;
};

export function getStatusChipProps({
  rangeStatusKind,
  hasAlert,
  nearEdge,
}: StatusChipInput): StatusChipProps {
  if (hasAlert && rangeStatusKind === 'below-range') {
    return { tone: 'breach', label: 'Breach · below' };
  }
  if (hasAlert && rangeStatusKind === 'above-range') {
    return { tone: 'breach', label: 'Breach · above' };
  }
  if (rangeStatusKind === 'in-range') {
    return nearEdge ? { tone: 'warn', label: 'Near edge' } : { tone: 'safe', label: 'In range' };
  }
  if (rangeStatusKind === 'below-range') {
    return { tone: 'warn', label: 'Below range' };
  }
  return { tone: 'warn', label: 'Above range' };
}

export type MonitoringTone = 'safe' | 'warn' | 'faint';
export type MonitoringDisplay = { text: string; tone: MonitoringTone };

export function getMonitoringDisplay(monitoringLabel: string): MonitoringDisplay {
  if (monitoringLabel === 'Monitoring Active') return { text: 'Live', tone: 'safe' };
  if (monitoringLabel === 'Monitoring Degraded') return { text: 'Degraded', tone: 'warn' };
  return { text: 'Inactive', tone: 'faint' };
}

export type CardPlaceholderMetrics = { tvlLabel: string; fees24hLabel: string };

const CARD_PLACEHOLDER_FALLBACKS: ReadonlyArray<CardPlaceholderMetrics> = [
  { tvlLabel: '$8,420.19', fees24hLabel: '+$12.40' },
  { tvlLabel: '$6,220.00', fees24hLabel: '+$4.82' },
  { tvlLabel: '$3,105.77', fees24hLabel: '+$1.95' },
];

function hashStringToIndex(input: string, modulo: number): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h % modulo;
}

export function getCardPlaceholderMetrics(poolId: string): CardPlaceholderMetrics {
  const idx = hashStringToIndex(poolId || '', CARD_PLACEHOLDER_FALLBACKS.length);
  return CARD_PLACEHOLDER_FALLBACKS[idx]!;
}
