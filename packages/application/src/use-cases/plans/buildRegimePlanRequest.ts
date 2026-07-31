import type { PositionDetail, HistoryEvent, ExitTrigger } from '@clmm/domain';
import type { RegimePlanRequest, RegimePlanRequestConfig } from '../../dto/regimePlan.js';
import { parseRegimePlanRequest } from '../../dto/regimePlanValidator.js';

export type BuildRegimePlanRequestParams = {
  positionDetail: PositionDetail;
  config: RegimePlanRequestConfig;
  asOfUnixMs: number;
  supportedPositionsCount: number;
  qualifiedTrigger?: ExitTrigger | null;
  walletHistory: readonly HistoryEvent[];
};

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

function isSol(symbol: string, mint: string): boolean {
  const sym = symbol.toUpperCase();
  return sym === 'SOL' || sym === 'WSOL' || mint === SOL_MINT;
}

function isUsdc(symbol: string, mint: string): boolean {
  return symbol.toUpperCase() === 'USDC' || mint === USDC_MINT;
}

export function buildRegimePlanRequest(
  params: BuildRegimePlanRequestParams,
): RegimePlanRequest | null {
  const {
    positionDetail,
    config,
    asOfUnixMs,
    supportedPositionsCount,
    qualifiedTrigger,
    walletHistory,
  } = params;

  if (!positionDetail.principalTokenAmounts) {
    return null;
  }

  const { decimalsA, decimalsB, symbolA, symbolB, mintA, mintB } =
    positionDetail.poolData.tokenPair;
  if (decimalsA === null || decimalsB === null) {
    return null;
  }

  const isA_Sol = isSol(symbolA, mintA);
  const isA_Usdc = isUsdc(symbolA, mintA);
  const isB_Sol = isSol(symbolB, mintB);
  const isB_Usdc = isUsdc(symbolB, mintB);

  let solAmount: bigint;
  let solDecimals: number;
  let usdcAmount: bigint;
  let usdcDecimals: number;

  if (isA_Sol && isB_Usdc) {
    solAmount = positionDetail.principalTokenAmounts.amountA;
    solDecimals = decimalsA;
    usdcAmount = positionDetail.principalTokenAmounts.amountB;
    usdcDecimals = decimalsB;
  } else if (isA_Usdc && isB_Sol) {
    solAmount = positionDetail.principalTokenAmounts.amountB;
    solDecimals = decimalsB;
    usdcAmount = positionDetail.principalTokenAmounts.amountA;
    usdcDecimals = decimalsA;
  } else {
    return null;
  }

  const solUnits = Number(solAmount) / Math.pow(10, solDecimals);
  const usdcUnits = Number(usdcAmount) / Math.pow(10, usdcDecimals);

  if (!Number.isFinite(solUnits) || solUnits < 0 || !Number.isFinite(usdcUnits) || usdcUnits < 0) {
    return null;
  }

  const currentPrice = positionDetail.position.rangeState.currentPrice;
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    return null;
  }

  const navUsd = solUnits * currentPrice + usdcUnits;
  if (!Number.isFinite(navUsd) || navUsd < 0) {
    return null;
  }

  const DAY_MS = 24 * 60 * 60 * 1000;
  const stopouts24h = walletHistory.filter(
    (e) =>
      e.eventType === 'confirmed' &&
      e.origin?.kind === 'qualified-breach' &&
      asOfUnixMs - e.occurredAt <= DAY_MS &&
      asOfUnixMs >= e.occurredAt,
  ).length;

  const autopilotState = {
    activeClmm: supportedPositionsCount > 0,
    stopouts24h,
    redeploys24h: 0,
    cooldownUntilUnixMs: 0,
    standDownUntilUnixMs: 0,
    strikeCount: 0,
  };

  const market = {
    symbol: 'SOL/USDC',
    source: 'geckoterminal',
    network: 'solana',
    poolAddress: positionDetail.position.poolId as string,
    timeframe: '1h' as const,
  };

  const breachQualified = Boolean(qualifiedTrigger);
  const breachQualifiedAtUnixMs = qualifiedTrigger
    ? Number(qualifiedTrigger.triggeredAt)
    : undefined;

  const candidate: RegimePlanRequest = {
    schemaVersion: 'plan-request.v1',
    asOfUnixMs,
    market,
    position: {
      positionId: positionDetail.position.positionId as string,
      walletId: positionDetail.position.walletId as string,
      observedAtUnixMs: positionDetail.position.lastObservedAt as number,
      lowerBoundPrice: positionDetail.position.bounds.lowerBound,
      upperBoundPrice: positionDetail.position.bounds.upperBound,
      currentPrice,
      rangeState: positionDetail.position.rangeState.kind,
      breachQualified,
      ...(breachQualifiedAtUnixMs !== undefined && { breachQualifiedAtUnixMs }),
    },
    portfolio: {
      navUsd,
      solUnits,
      usdcUnits,
    },
    autopilotState,
    config,
  };

  return parseRegimePlanRequest(candidate);
}
