import type {
  RegimeBlock,
  RegimeReason,
  RegimeReasonSeverity,
  ClmmSuitabilityStatus,
  MarketRegime,
} from '@clmm/application/public';

export type RegimeDetailRow = {
  label: string;
  value: string;
  tone?: 'default' | 'muted' | 'warning' | 'danger' | 'success';
};

export type RegimeDataQualityTone = 'success' | 'warning' | 'danger';

export type RegimeViewModelBlock = {
  regimeLabel: string;
  suitabilityLabel: string;
  suitabilityStatus: ClmmSuitabilityStatus;
  suitabilityTone: RegimeDataQualityTone | 'muted';
  dataQualityLabel: string;
  dataQualityTone: RegimeDataQualityTone;
  generatedAgeLabel: string;
  latestCandleAgeLabel: string;
  sourceLabel: string;
  compactTelemetryLabel: string;
  primaryDisplayReason: RegimeReason | null;
  displayReasons: RegimeReason[];
  expandedTelemetryRows: RegimeDetailRow[];
  expandedSampleRows: RegimeDetailRow[];
  expandedFreshnessRows: RegimeDetailRow[];
};

const SEVERITY_ORDER: Record<RegimeReasonSeverity, number> = { ERROR: 0, WARN: 1, INFO: 2 };

const REGIME_LABELS: Record<MarketRegime, string> = {
  UP: '▲ Uptrend regime',
  DOWN: '▼ Downtrend regime',
  CHOP: '◆ Choppy regime',
};

const SUITABILITY_LABELS: Record<ClmmSuitabilityStatus, string> = {
  ALLOWED: 'CLMM suitable',
  CAUTION: 'CLMM caution',
  BLOCKED: 'CLMM not recommended',
  UNKNOWN: 'CLMM suitability unknown',
};

const SOURCE_DISPLAY: Record<string, string> = {
  geckoterminal: 'GeckoTerminal',
};

function classifyDataQuality(
  softStale: boolean,
  hardStale: boolean,
): { label: string; tone: RegimeDataQualityTone } {
  if (hardStale) return { label: 'Hard-stale', tone: 'danger' };
  if (softStale) return { label: 'Soft-stale', tone: 'warning' };
  return { label: 'Fresh', tone: 'success' };
}

function suitabilityTone(status: ClmmSuitabilityStatus): RegimeDataQualityTone | 'muted' {
  switch (status) {
    case 'ALLOWED':
      return 'success';
    case 'CAUTION':
      return 'warning';
    case 'BLOCKED':
      return 'danger';
    default:
      return 'muted';
  }
}

function formatMinutesAgo(elapsedMs: number): string {
  const minutes = Math.max(0, Math.round(elapsedMs / 60_000));
  return `${minutes}m`;
}

function formatFreshnessThresholdSeconds(seconds: number): string {
  return `${Math.round(seconds / 60)}m`;
}

function trendQualitative(strength: number): string {
  const abs = Math.abs(strength);
  if (abs < 0.001) return 'Trend flat';
  if (strength > 0) return 'Trend up';
  return 'Trend down';
}

function displaySource(source: string): string {
  const lower = source.toLowerCase();
  return SOURCE_DISPLAY[lower] ?? source;
}

function normalizeText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function dedupeKey(reason: RegimeReason): string {
  if (reason.code && reason.code.toUpperCase().includes('STALE')) return 'stale-category';
  if (normalizeText(reason.text).includes('stale')) return 'stale-category';
  if (reason.code) return `code:${reason.code}`;
  return `text:${normalizeText(reason.text)}`;
}

function buildDisplayReasons(block: RegimeBlock): RegimeReason[] {
  const merged: { reason: RegimeReason; sourceIndex: number }[] = [];
  for (const r of block.clmmSuitability.reasons) {
    merged.push({ reason: r, sourceIndex: merged.length });
  }
  for (const r of block.marketReasons) {
    merged.push({ reason: r, sourceIndex: merged.length });
  }
  merged.sort((a, b) => {
    const sev = (SEVERITY_ORDER[a.reason.severity] ?? 9) - (SEVERITY_ORDER[b.reason.severity] ?? 9);
    if (sev !== 0) return sev;
    return a.sourceIndex - b.sourceIndex;
  });
  const seen = new Set<string>();
  const out: RegimeReason[] = [];
  for (const { reason } of merged) {
    const key = dedupeKey(reason);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(reason);
  }
  return out;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatRatio(value: number): string {
  return `${value.toFixed(2)}x`;
}

function buildTelemetryRows(block: RegimeBlock): RegimeDetailRow[] {
  return [
    { label: 'Trend strength', value: block.telemetry.trendStrength.toFixed(5) },
    { label: 'Realized vol short', value: formatPercent(block.telemetry.realizedVolShort) },
    { label: 'Realized vol long', value: formatPercent(block.telemetry.realizedVolLong) },
    { label: 'Volatility ratio', value: formatRatio(block.telemetry.volRatio) },
    { label: 'Compression', value: formatPercent(block.telemetry.compression) },
  ];
}

function buildSampleRows(block: RegimeBlock): RegimeDetailRow[] {
  const rows: RegimeDetailRow[] = [];
  if (block.metadata.candleCount !== undefined) {
    rows.push({ label: 'Samples', value: `${block.metadata.candleCount} closed candles` });
  }
  if (block.metadata.sourceCandleCount !== undefined && block.metadata.sourceTimeframe) {
    rows.push({
      label: 'Source candles',
      value: `${block.metadata.sourceCandleCount} x ${block.metadata.sourceTimeframe}`,
    });
  }
  if (block.metadata.derivedTimeframe) {
    rows.push({ label: 'Derived timeframe', value: block.metadata.derivedTimeframe });
  }
  if (block.metadata.aggregationVersion) {
    rows.push({ label: 'Aggregation', value: block.metadata.aggregationVersion });
  }
  if (block.metadata.engineVersion) {
    rows.push({ label: 'Engine', value: block.metadata.engineVersion });
  }
  if (block.metadata.configVersion) {
    rows.push({ label: 'Config', value: block.metadata.configVersion });
  }
  return rows;
}

export type ClockFormatOptions = { locale?: string; timeZone?: string };

export function formatCandleClockTime(
  unixMs: number,
  now: number,
  opts?: ClockFormatOptions,
): string {
  const locale = opts?.locale;
  const timeZone = opts?.timeZone;
  const dayKey = (ms: number): string =>
    new Intl.DateTimeFormat(locale, {
      ...(timeZone ? { timeZone } : {}),
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).format(new Date(ms));
  const time = new Intl.DateTimeFormat(locale, {
    ...(timeZone ? { timeZone } : {}),
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(unixMs));
  if (dayKey(unixMs) === dayKey(now)) return time;
  const datePrefix = new Intl.DateTimeFormat(locale, {
    ...(timeZone ? { timeZone } : {}),
    month: 'short',
    day: 'numeric',
  }).format(new Date(unixMs));
  return `${datePrefix}, ${time}`;
}

function computeDisplayAgeSeconds(block: RegimeBlock, now: number): number {
  const elapsedSinceGenerated = Math.max(
    0,
    Math.floor((now - block.freshness.generatedAtUnixMs) / 1000),
  );
  return block.freshness.ageSeconds + elapsedSinceGenerated;
}

function buildFreshnessRows(block: RegimeBlock, now: number): RegimeDetailRow[] {
  const displayAgeSeconds = computeDisplayAgeSeconds(block, now);
  return [
    {
      label: 'Latest candle',
      value: `${formatMinutesAgo(displayAgeSeconds * 1000)} old`,
      tone: block.freshness.hardStale
        ? 'danger'
        : block.freshness.softStale
          ? 'warning'
          : 'default',
    },
    {
      label: 'Soft stale threshold',
      value: formatFreshnessThresholdSeconds(block.freshness.softStaleSeconds),
      tone: 'muted',
    },
    {
      label: 'Hard stale threshold',
      value: formatFreshnessThresholdSeconds(block.freshness.hardStaleSeconds),
      tone: 'muted',
    },
  ];
}

export function buildRegimeViewModelBlock(block: RegimeBlock, now: number): RegimeViewModelBlock {
  const dataQuality = classifyDataQuality(block.freshness.softStale, block.freshness.hardStale);
  const generatedElapsedMs = Math.max(0, now - block.freshness.generatedAtUnixMs);
  const generatedAgeLabel = `Generated ${formatMinutesAgo(generatedElapsedMs)} ago`;
  const displayAgeSeconds = computeDisplayAgeSeconds(block, now);
  const latestCandleAgeLabel = `Latest closed candle is ${formatMinutesAgo(displayAgeSeconds * 1000)} old`;
  const sourceLabel = `${displaySource(block.metadata.source)} · ${block.metadata.symbol} · ${block.metadata.timeframe}`;
  const compactTelemetryLabel = `${trendQualitative(block.telemetry.trendStrength)} · Vol ratio ${formatRatio(
    block.telemetry.volRatio,
  )}`;

  const displayReasons = buildDisplayReasons(block);

  return {
    regimeLabel: REGIME_LABELS[block.regime] ?? block.regime,
    suitabilityLabel: SUITABILITY_LABELS[block.clmmSuitability.status],
    suitabilityStatus: block.clmmSuitability.status,
    suitabilityTone: suitabilityTone(block.clmmSuitability.status),
    dataQualityLabel: dataQuality.label,
    dataQualityTone: dataQuality.tone,
    generatedAgeLabel,
    latestCandleAgeLabel,
    sourceLabel,
    compactTelemetryLabel,
    primaryDisplayReason: displayReasons[0] ?? null,
    displayReasons,
    expandedTelemetryRows: buildTelemetryRows(block),
    expandedSampleRows: buildSampleRows(block),
    expandedFreshnessRows: buildFreshnessRows(block, now),
  };
}
