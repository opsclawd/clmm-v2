import { parseRegimePlanRequest } from '@clmm/application';
import type { RegimePlanRequestConfig, RegimePlanRequest } from '@clmm/application';

export type { RegimePlanRequestConfig };

export type ResolveRegimePlanRequestConfigResult =
  | { kind: 'configured'; config: RegimePlanRequestConfig }
  | { kind: 'missing' }
  | { kind: 'invalid'; error: string };

export function resolveRegimePlanRequestConfig(
  configJson: string | undefined | null,
): ResolveRegimePlanRequestConfigResult {
  if (!configJson || configJson.trim() === '') {
    return { kind: 'missing' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(configJson);
  } catch (err) {
    return { kind: 'invalid', error: err instanceof Error ? err.message : 'Invalid JSON' };
  }

  const dummyRequest: RegimePlanRequest = {
    schemaVersion: 'plan-request.v1',
    asOfUnixMs: 1776272593000,
    market: {
      symbol: 'SOL/USDC',
      source: 'geckoterminal',
      network: 'solana',
      poolAddress: 'pool-1',
      timeframe: '1h',
    },
    position: {
      positionId: 'pos-1',
      observedAtUnixMs: 1776272593000,
      lowerBoundPrice: 140,
      upperBoundPrice: 160,
      currentPrice: 150,
      rangeState: 'in-range',
      breachQualified: false,
    },
    portfolio: {
      navUsd: 10000,
      solUnits: 33.33,
      usdcUnits: 5000,
    },
    autopilotState: {
      activeClmm: true,
      stopouts24h: 0,
      redeploys24h: 0,
      cooldownUntilUnixMs: 0,
      standDownUntilUnixMs: 0,
      strikeCount: 0,
    },
    config: parsed as RegimePlanRequestConfig,
  };

  const validated = parseRegimePlanRequest(dummyRequest);
  if (!validated) {
    return { kind: 'invalid', error: 'Config failed plan-request.v1 schema validation' };
  }

  return { kind: 'configured', config: parsed as RegimePlanRequestConfig };
}
