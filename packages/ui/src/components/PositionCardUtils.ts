import type { MonitoringStatus } from '../view-models/PositionListViewModel.js';

export type TokenPair = { a: string; b: string };

export function splitTokenPair(label: string): TokenPair {
  if (!label) return { a: '', b: '' };
  const parts = label.split('/');
  if (parts.length < 2) return { a: label.trim(), b: '' };
  return { a: (parts[0] ?? '').trim(), b: (parts[1] ?? '').trim() };
}

export type ParsedPairGlyph =
  | { kind: 'pair'; a: string; b: string }
  | { kind: 'single'; symbol: string };

const UNKNOWN_GLYPH_SYMBOL = '?';

export function parsePairGlyphLabel(label: string): ParsedPairGlyph {
  const trimmedLabel = label.trim();
  const parts = trimmedLabel.split('/');

  if (parts.length === 1) {
    return {
      kind: 'single',
      symbol: trimmedLabel || UNKNOWN_GLYPH_SYMBOL,
    };
  }

  if (parts.length !== 2) {
    return { kind: 'single', symbol: UNKNOWN_GLYPH_SYMBOL };
  }

  const a = (parts[0] ?? '').trim();
  const b = (parts[1] ?? '').trim();
  if (!a || !b) {
    return { kind: 'single', symbol: UNKNOWN_GLYPH_SYMBOL };
  }

  return { kind: 'pair', a, b };
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
  if (currentPrice < lowerBoundPrice || currentPrice > upperBoundPrice) return false;
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

export type StatusDiagnosticCode = 'position_alert_in_range';

export function getStatusDiagnosticCode({
  rangeStatusKind,
  hasAlert,
}: StatusChipInput): StatusDiagnosticCode | undefined {
  return hasAlert && rangeStatusKind === 'in-range' ? 'position_alert_in_range' : undefined;
}

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
  if (hasAlert) return { tone: 'warn', label: 'Action needed' };
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

export function getMonitoringDisplay(status: MonitoringStatus): MonitoringDisplay {
  switch (status) {
    case 'active':
      return { text: 'Live', tone: 'safe' };
    case 'degraded':
      return { text: 'Degraded', tone: 'warn' };
    case 'inactive':
      return { text: 'Inactive', tone: 'faint' };
    default: {
      const _exhaustive: never = status;
      throw new Error(`Unexpected monitoringStatus: ${String(_exhaustive)}`);
    }
  }
}

export type BreachSide = 'below' | 'above' | undefined;

export function getBreachSide(
  hasAlert: boolean,
  rangeStatusKind: 'in-range' | 'below-range' | 'above-range',
): BreachSide {
  if (!hasAlert) return undefined;
  if (rangeStatusKind === 'below-range') return 'below';
  if (rangeStatusKind === 'above-range') return 'above';
  return undefined;
}
