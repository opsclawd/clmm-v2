import type {
  RegimeBlock,
  RegimeReasonSeverity,
  ClmmSuitabilityStatus,
} from '@clmm/application/public';

export type RegimeViewModelBlock = {
  regimeLabel: string;
  trendLabel: string;
  volLabel: string;
  suitabilityLabel: string;
  suitabilityStatus: ClmmSuitabilityStatus;
  suitabilityReason: string | null;
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

const SEVERITY_ORDER: Record<RegimeReasonSeverity, number> = { ERROR: 0, WARN: 1, INFO: 2 };

export function buildRegimeViewModelBlock(block: RegimeBlock, now: number): RegimeViewModelBlock {
  const ageStale = computeFreshness(block.freshness.capturedAtUnixMs, now, block.metadata?.source);
  const isStale = block.freshness.hardStale || ageStale.isStale;
  const freshnessLabel =
    isStale && !ageStale.isStale
      ? ageStale.freshnessLabel.replace(/( · stale)?$/, ' · stale')
      : ageStale.freshnessLabel;

  const marketReasonSummary =
    block.marketReasons.length > 0
      ? [...block.marketReasons].sort(
          (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
        )[0]!.text
      : '—';

  const suitabilityReasons = block.clmmSuitability.reasons;
  const topSuitabilityReason =
    suitabilityReasons.length > 0 &&
    (block.clmmSuitability.status === 'CAUTION' || block.clmmSuitability.status === 'BLOCKED')
      ? [...suitabilityReasons].sort(
          (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
        )[0]!.text
      : null;

  return {
    regimeLabel: mapRegimeLabel(block.regime),
    trendLabel: `Trend: ${block.trendStrength.toFixed(2)}`,
    volLabel: `Vol: ${block.volRatio.toFixed(2)}`,
    suitabilityLabel: mapSuitabilityLabel(block.clmmSuitability.status),
    suitabilityStatus: block.clmmSuitability.status,
    suitabilityReason: topSuitabilityReason,
    marketReasonSummary,
    freshnessLabel,
    isStale,
  };
}
