import { describe, it, expect } from 'vitest';
import { buildRegimePlanRequest } from './buildRegimePlanRequest.js';
import type { PositionDetail, HistoryEvent } from '@clmm/domain';
import {
  makePositionId,
  makeWalletId,
  makePoolId,
  makeClockTimestamp,
  LOWER_BOUND_BREACH,
} from '@clmm/domain';
import type { RegimePlanRequestConfig } from '../../dto/regimePlan.js';
import inRangeFixture from '../../../../../schemas/regime-engine/plan-request.v1/fixtures/valid/in-range.json';

const VALID_CONFIG: RegimePlanRequestConfig = inRangeFixture.config;

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

function createFixtureDetail(overrides?: Partial<PositionDetail>): PositionDetail {
  return {
    position: {
      positionId: makePositionId('pos-1'),
      walletId: makeWalletId('wallet-1'),
      poolId: makePoolId('pool-1'),
      bounds: { lowerBound: 140, upperBound: 160 },
      lastObservedAt: makeClockTimestamp(1776272593000),
      rangeState: { kind: 'in-range', currentPrice: 150 },
      monitoringReadiness: { kind: 'active' },
    },
    poolData: {
      poolId: makePoolId('pool-1'),
      tokenPair: {
        mintA: SOL_MINT,
        mintB: USDC_MINT,
        symbolA: 'SOL',
        symbolB: 'USDC',
        decimalsA: 9,
        decimalsB: 6,
      },
      sqrtPrice: 0n,
      feeRate: 0,
      tickSpacing: 64,
      liquidity: 1000n,
      tickCurrentIndex: 0,
    },
    fees: { feeOwedA: 0n, feeOwedB: 0n, rewardInfos: [] },
    positionLiquidity: 1000n,
    principalTokenAmounts: {
      amountA: 33333333000n, // 33.333333 SOL
      amountB: 5000000000n, // 5000 USDC
      observedAt: makeClockTimestamp(1776272593000),
    },
    ...overrides,
  };
}

describe('buildRegimePlanRequest', () => {
  it('maps SOL and USDC principal units regardless of pool token order', () => {
    const detailNormal = createFixtureDetail();
    const reqNormal = buildRegimePlanRequest({
      positionDetail: detailNormal,
      config: VALID_CONFIG,
      asOfUnixMs: 1776272593000,
      supportedPositionsCount: 1,
      qualifiedTrigger: null,
      walletHistory: [],
    });

    expect(reqNormal).not.toBeNull();
    expect(reqNormal?.portfolio.solUnits).toBeCloseTo(33.333333);
    expect(reqNormal?.portfolio.usdcUnits).toBeCloseTo(5000);

    // Reversed token pair: token A is USDC, token B is SOL
    const detailReversed = createFixtureDetail({
      poolData: {
        ...createFixtureDetail().poolData,
        tokenPair: {
          mintA: USDC_MINT,
          mintB: SOL_MINT,
          symbolA: 'USDC',
          symbolB: 'SOL',
          decimalsA: 6,
          decimalsB: 9,
        },
      },
      principalTokenAmounts: {
        amountA: 5000000000n, // 5000 USDC
        amountB: 33333333000n, // 33.333333 SOL
        observedAt: makeClockTimestamp(1776272593000),
      },
    });

    const reqReversed = buildRegimePlanRequest({
      positionDetail: detailReversed,
      config: VALID_CONFIG,
      asOfUnixMs: 1776272593000,
      supportedPositionsCount: 1,
      qualifiedTrigger: null,
      walletHistory: [],
    });

    expect(reqReversed).not.toBeNull();
    expect(reqReversed?.portfolio.solUnits).toBeCloseTo(33.333333);
    expect(reqReversed?.portfolio.usdcUnits).toBeCloseTo(5000);
  });

  it('computes navUsd from principal units and current SOL price', () => {
    const detail = createFixtureDetail(); // 33.333333 SOL, 5000 USDC, currentPrice = 150
    const req = buildRegimePlanRequest({
      positionDetail: detail,
      config: VALID_CONFIG,
      asOfUnixMs: 1776272593000,
      supportedPositionsCount: 1,
      qualifiedTrigger: null,
      walletHistory: [],
    });

    expect(req).not.toBeNull();
    // navUsd = (33.333333 * 150) + 5000 = 4999.99995 + 5000 = 9999.99995
    const expectedNav = 33.333333 * 150 + 5000;
    expect(req?.portfolio.navUsd).toBeCloseTo(expectedNav);
  });

  it('uses geckoterminal solana one-hour market identity', () => {
    const detail = createFixtureDetail();
    const req = buildRegimePlanRequest({
      positionDetail: detail,
      config: VALID_CONFIG,
      asOfUnixMs: 1776272593000,
      supportedPositionsCount: 1,
      qualifiedTrigger: null,
      walletHistory: [],
    });

    expect(req).not.toBeNull();
    expect(req?.market).toEqual({
      symbol: 'SOL/USDC',
      source: 'geckoterminal',
      network: 'solana',
      poolAddress: 'pool-1',
      timeframe: '1h',
    });
  });

  it('derives autopilot counters only from authoritative local history', () => {
    const asOfUnixMs = 1000000000;
    const dayMs = 24 * 60 * 60 * 1000;

    const events: HistoryEvent[] = [
      {
        eventId: 'ev-1',
        positionId: makePositionId('pos-1'),
        eventType: 'confirmed',
        origin: { kind: 'qualified-breach', breachDirection: LOWER_BOUND_BREACH },
        occurredAt: makeClockTimestamp(asOfUnixMs - 1000), // within 24h
      },
      {
        eventId: 'ev-2',
        positionId: makePositionId('pos-1'),
        eventType: 'confirmed',
        origin: { kind: 'qualified-breach', breachDirection: LOWER_BOUND_BREACH },
        occurredAt: makeClockTimestamp(asOfUnixMs - dayMs - 5000), // older than 24h
      },
      {
        eventId: 'ev-3',
        positionId: makePositionId('pos-1'),
        eventType: 'confirmed',
        origin: {
          kind: 'regime-plan',
          planId: 'p-1' as unknown as import('@clmm/domain').PlanId,
          canonicalHash: 'h-1' as unknown as import('@clmm/domain').CanonicalHash,
          canonicalExitIntent: 'exit-to-usdc',
        },
        occurredAt: makeClockTimestamp(asOfUnixMs - 2000), // not qualified-breach
      },
    ];

    const detail = createFixtureDetail();
    const req = buildRegimePlanRequest({
      positionDetail: detail,
      config: VALID_CONFIG,
      asOfUnixMs,
      supportedPositionsCount: 1,
      qualifiedTrigger: null,
      walletHistory: events,
    });

    expect(req).not.toBeNull();
    expect(req?.autopilotState.stopouts24h).toBe(1);
  });

  it('uses zero redeploys because redeployment is unsupported', () => {
    const detail = createFixtureDetail();
    const req = buildRegimePlanRequest({
      positionDetail: detail,
      config: VALID_CONFIG,
      asOfUnixMs: 1776272593000,
      supportedPositionsCount: 1,
      qualifiedTrigger: null,
      walletHistory: [],
    });

    expect(req).not.toBeNull();
    expect(req?.autopilotState.redeploys24h).toBe(0);
  });

  it('rejects missing principal inventory', () => {
    const detailMissingInventory = createFixtureDetail({
      principalTokenAmounts: null,
    });

    const req = buildRegimePlanRequest({
      positionDetail: detailMissingInventory,
      config: VALID_CONFIG,
      asOfUnixMs: 1776272593000,
      supportedPositionsCount: 1,
      qualifiedTrigger: null,
      walletHistory: [],
    });

    expect(req).toBeNull();
  });

  it('rejects unknown token pairs', () => {
    const detailUnknownTokens = createFixtureDetail({
      poolData: {
        ...createFixtureDetail().poolData,
        tokenPair: {
          mintA: 'UnknownMint11111111111111111111111111111111',
          mintB: 'UnknownMint22222222222222222222222222222222',
          symbolA: 'FOO',
          symbolB: 'BAR',
          decimalsA: 6,
          decimalsB: 6,
        },
      },
    });

    const req = buildRegimePlanRequest({
      positionDetail: detailUnknownTokens,
      config: VALID_CONFIG,
      asOfUnixMs: 1776272593000,
      supportedPositionsCount: 1,
      qualifiedTrigger: null,
      walletHistory: [],
    });

    expect(req).toBeNull();
  });

  it('rejects configuration that fails the vendored schema', () => {
    const invalidConfig = {
      ...VALID_CONFIG,
      regime: { ...VALID_CONFIG.regime, confirmBars: 0 }, // min 1
    };

    const detail = createFixtureDetail();
    const req = buildRegimePlanRequest({
      positionDetail: detail,
      config: invalidConfig as RegimePlanRequestConfig,
      asOfUnixMs: 1776272593000,
      supportedPositionsCount: 1,
      qualifiedTrigger: null,
      walletHistory: [],
    });

    expect(req).toBeNull();
  });
});
