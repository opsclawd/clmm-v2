import type { RegimeBlock, ClmmSuitabilityStatus } from '@clmm/application/public';

export type RegimeViewModelBlock = {
  regimeLabel: string;
  trendLabel: string;
  volLabel: string;
  suitabilityLabel: string;
  suitabilityStatus: ClmmSuitabilityStatus;
  marketReasonSummary: string;
  freshnessLabel: string;
  isStale: boolean;
};

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const STALE_THRESHOLD_MS = 48 * MS_PER_HOUR;

function computeFreshness(
  capturedAtUnixMs: number,
  now: number,
  source?: string,
): { freshnessLabel: string; isStale: boolean } {
  const prefix = source ?? 'MCO';
  const ageMs = Math.max(0, now - capturedAtUnixMs);
  if (ageMs < MS_PER_HOUR) {
    const minutes = Math.max(1, Math.round(ageMs / MS_PER_MINUTE));
    return { freshnessLabel: `${prefix} · ${minutes}m ago`, isStale: false };
  }
  const hours = Math.round(ageMs / MS_PER_HOUR);
  if (ageMs < STALE_THRESHOLD_MS) {
    return { freshnessLabel: `${prefix} · ${hours}h ago`, isStale: false };
  }
  return { freshnessLabel: `${prefix} · ${hours}h ago · stale`, isStale: true };
}

function mapRegimeLabel(regime: string): string {
  switch (regime) {
    case 'UP':
      return '▲ Uptrend';
    case 'DOWN':
      return '▼ Downtrend';
    case 'CHOP':
      return '◆ Choppy';
    default:
      return regime;
  }
}

function mapSuitabilityLabel(status: ClmmSuitabilityStatus): string {
  switch (status) {
    case 'ALLOWED':
      return '✓ Suitable for CLMM';
    case 'CAUTION':
      return '⚠ Caution';
    case 'BLOCKED':
      return '✗ Not recommended';
    case 'UNKNOWN':
      return '? Unknown';
    default:
      return status;
  }
}

export function buildRegimeViewModelBlock(block: RegimeBlock, now: number): RegimeViewModelBlock {
  const { freshnessLabel, isStale } = computeFreshness(
    block.freshness.capturedAtUnixMs,
    now,
    block.metadata?.source,
  );

  const marketReasonSummary =
    block.marketReasons.length > 0 ? block.marketReasons.map((r) => r.text).join('; ') : '—';

  return {
    regimeLabel: mapRegimeLabel(block.regime),
    trendLabel: `Trend: ${block.trendStrength.toFixed(2)}`,
    volLabel: `Vol: ${block.volRatio.toFixed(2)}`,
    suitabilityLabel: mapSuitabilityLabel(block.clmmSuitability.status),
    suitabilityStatus: block.clmmSuitability.status,
    marketReasonSummary,
    freshnessLabel,
    isStale,
  };
}
