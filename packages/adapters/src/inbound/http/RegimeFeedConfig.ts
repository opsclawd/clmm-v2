export type RegimePoolEntry = {
  symbol: string;
};

export type RegimeFeedConfig = {
  symbol: string;
  source: string;
  network: string;
  poolAddress: string;
  timeframe: string;
};

export type RegimeFeedConfigResult =
  | { kind: 'ok'; config: RegimeFeedConfig }
  | { kind: 'missing'; missing: string[] };

const REQUIRED_VARS: ReadonlyArray<{ env: string; field: keyof Omit<RegimeFeedConfig, 'symbol'> }> =
  [
    { env: 'REGIME_ENGINE_SOURCE', field: 'source' },
    { env: 'REGIME_ENGINE_NETWORK', field: 'network' },
    { env: 'REGIME_ENGINE_POOL_ADDRESS', field: 'poolAddress' },
    { env: 'REGIME_ENGINE_TIMEFRAME', field: 'timeframe' },
  ];

export function resolveRegimeFeedConfig(
  env: Record<string, string | undefined>,
  symbol: string,
): RegimeFeedConfigResult {
  const missing: string[] = [];
  const partial: Partial<RegimeFeedConfig> = { symbol };
  for (const { env: name, field } of REQUIRED_VARS) {
    const raw = env[name];
    if (typeof raw !== 'string' || raw.length === 0) {
      missing.push(name);
      continue;
    }
    partial[field] = raw;
  }
  if (missing.length > 0) {
    return { kind: 'missing', missing };
  }
  return { kind: 'ok', config: partial as RegimeFeedConfig };
}
