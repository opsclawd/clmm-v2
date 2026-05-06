export type RegimePoolEntry = {
  symbol: string;
  source: string;
  network: string;
  poolAddress: string;
  timeframe: string;
};

export type RegimeFeedConfig = {
  symbol: string;
  source: string;
  network: string;
  poolAddress: string;
  timeframe: string;
};

export function resolveRegimeFeedConfig(entry: RegimePoolEntry): RegimeFeedConfig {
  return {
    symbol: entry.symbol,
    source: entry.source,
    network: entry.network,
    poolAddress: entry.poolAddress,
    timeframe: entry.timeframe,
  };
}
