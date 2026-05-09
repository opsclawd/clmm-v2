import type { MarketRegime, ClmmSuitabilityStatus } from '@clmm/domain';

export type RegimeReasonSeverity = 'ERROR' | 'WARN' | 'INFO';

export type RegimeReason = {
  severity: RegimeReasonSeverity;
  text: string;
  code?: string;
};

export type RegimeFreshness = {
  generatedAtUnixMs: number;
  generatedAtIso: string;
  lastCandleOpenUnixMs: number;
  lastCandleOpenIso: string;
  lastCandleCloseUnixMs: number;
  lastCandleCloseIso: string;
  ageSeconds: number;
  softStale: boolean;
  hardStale: boolean;
  softStaleSeconds: number;
  hardStaleSeconds: number;
};

export type RegimeTelemetry = {
  realizedVolShort: number;
  realizedVolLong: number;
  volRatio: number;
  trendStrength: number;
  compression: number;
};

export type RegimeClmmSuitability = {
  status: ClmmSuitabilityStatus;
  reasons: RegimeReason[];
};

export type RegimeMetadata = {
  source: string;
  network: string;
  symbol: string;
  timeframe: string;
  sourceTimeframe?: string;
  sourceCandleCount?: number;
  candleCount?: number;
  derivedTimeframe?: string;
  aggregationVersion?: string;
  engineVersion?: string;
  configVersion?: string;
};

export type RegimeBlock = {
  regime: MarketRegime;
  telemetry: RegimeTelemetry;
  clmmSuitability: RegimeClmmSuitability;
  marketReasons: RegimeReason[];
  freshness: RegimeFreshness;
  metadata: RegimeMetadata;
};
