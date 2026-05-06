import type { MarketRegime, ClmmSuitabilityStatus } from '@clmm/domain';

export type RegimeReasonSeverity = 'ERROR' | 'WARN' | 'INFO';

export type RegimeReason = {
  severity: RegimeReasonSeverity;
  text: string;
  code?: string;
};

export type RegimeFreshness = {
  capturedAtUnixMs: number;
  softStale: boolean;
  hardStale: boolean;
};

export type RegimeClmmSuitability = {
  status: ClmmSuitabilityStatus;
  reasons: RegimeReason[];
};

export type RegimeMetadata = {
  source?: string;
  network?: string;
  symbol?: string;
  timeframe?: string;
};

export type RegimeBlock = {
  regime: MarketRegime;
  trendStrength: number;
  volRatio: number;
  clmmSuitability: RegimeClmmSuitability;
  marketReasons: RegimeReason[];
  freshness: RegimeFreshness;
  metadata?: RegimeMetadata;
};
