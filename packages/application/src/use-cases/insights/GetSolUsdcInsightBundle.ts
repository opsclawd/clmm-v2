import type { PoolId, WalletId, PositionDetail } from '@clmm/domain';
import type {
  SupportedPositionReadPort,
  TriggerRepository,
  PricePort,
  SrLevelsReadPort,
} from '../../ports/index.js';
import type {
  SolUsdcInsightInputBundleDto,
  SolUsdcPositionInsightDto,
  InsightDataWarning,
  ExternalBreachDirection,
} from '../../dto/index.js';
import { getSolUsdcInsightPoolSnapshot } from './GetSolUsdcInsightPoolSnapshot.js';
import { buildSolUsdcPositionInsight } from './buildSolUsdcPositionInsight.js';
import { enrichWithTriggers } from './GetSolUsdcInsightPositions.js';

export type GetSolUsdcInsightBundleResult =
  | { kind: 'ok'; bundle: SolUsdcInsightInputBundleDto }
  | { kind: 'pool-unavailable' }
  | { kind: 'position-list-unavailable' }
  | { kind: 'position-detail-unavailable'; positionId: string };

export async function getSolUsdcInsightBundle(params: {
  walletId: WalletId;
  poolId: PoolId;
  srLevelsLookup: { symbol: string; source: string };
  positionReadPort: SupportedPositionReadPort;
  triggerRepo: TriggerRepository;
  pricePort: PricePort;
  srLevelsReadPort: SrLevelsReadPort;
  now: () => number;
}): Promise<GetSolUsdcInsightBundleResult> {
  const {
    walletId,
    poolId,
    srLevelsLookup,
    positionReadPort,
    triggerRepo,
    pricePort,
    srLevelsReadPort,
    now,
  } = params;

  const poolResult = await getSolUsdcInsightPoolSnapshot({ poolId, positionReadPort, now });
  if (poolResult.kind !== 'ok') return { kind: 'pool-unavailable' };

  let allPositions;
  try {
    allPositions = await positionReadPort.listSupportedPositions(walletId);
  } catch {
    return { kind: 'position-list-unavailable' };
  }

  const filtered = allPositions.filter((p) => p.poolId === poolId);
  const observedAtUnixMs = now();

  const details: PositionDetail[] = [];
  for (const p of filtered) {
    let detail: PositionDetail | null;
    try {
      detail = await positionReadPort.getPositionDetail(walletId, p.positionId);
    } catch {
      return { kind: 'position-detail-unavailable', positionId: p.positionId };
    }
    if (!detail) {
      return { kind: 'position-detail-unavailable', positionId: p.positionId };
    }
    details.push(detail);
  }

  const priceMap = new Map<string, { usdValue: number; symbol: string }>();
  if (details.length > 0) {
    const mints = new Set<string>();
    for (const d of details) {
      mints.add(d.poolData.tokenPair.mintA);
      mints.add(d.poolData.tokenPair.mintB);
      for (const r of d.fees.rewardInfos) {
        if (r.mint !== '') mints.add(r.mint);
      }
    }
    try {
      const quotes = await pricePort.getPrices([...mints]);
      for (const q of quotes) {
        priceMap.set(q.tokenMint, { usdValue: q.usdValue, symbol: q.symbol });
      }
    } catch {
      // priceMap stays empty — buildSolUsdcPositionInsight records warnings
    }
  }

  const warnings: InsightDataWarning[] = [];
  const insights: SolUsdcPositionInsightDto[] = [];
  for (const detail of details) {
    const built = buildSolUsdcPositionInsight({ detail, observedAtUnixMs, priceMap });
    insights.push(built.insight);
    warnings.push(...built.warnings);
  }

  const triggerEnrichment = await enrichWithTriggers({
    walletId,
    triggerRepo,
    insights,
    filteredPositionIds: new Set(insights.map((i) => i.positionId)),
  });
  warnings.push(...triggerEnrichment.warnings);

  let srLevels = null;
  try {
    srLevels = await srLevelsReadPort.fetchCurrent(srLevelsLookup.symbol, srLevelsLookup.source);
  } catch {
    warnings.push({
      code: 'sr_levels_unavailable',
      message: 'S/R levels unavailable.',
    });
  }

  const alerts = triggerEnrichment.filteredTriggers as Array<{
    triggerId: string;
    positionId: string;
    breachDirection: ExternalBreachDirection;
    triggeredAt: number;
  }>;

  return {
    kind: 'ok',
    bundle: {
      pair: 'SOL/USDC',
      source: 'orca',
      observedAtUnixMs,
      pool: poolResult.pool,
      srLevels,
      positions: triggerEnrichment.insights,
      alerts,
      dataQuality: {
        partial: warnings.length > 0,
        warnings,
      },
    },
  };
}