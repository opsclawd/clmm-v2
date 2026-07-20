import type { PoolId, WalletId, PositionDetail } from '@clmm/domain';
import type { SupportedPositionReadPort, TriggerRepository, PricePort } from '../../ports/index.js';
import type {
  SolUsdcPositionSnapshotDto,
  SolUsdcPositionInsightDto,
  InsightDataWarning,
  ExternalBreachDirection,
} from '../../dto/index.js';
import { buildSolUsdcPositionInsight, type PriceMapEntry } from './buildSolUsdcPositionInsight.js';
import { getSolUsdcInsightPoolSnapshot } from './GetSolUsdcInsightPoolSnapshot.js';
import { toExternalBreachDirection } from './toExternalBreachDirection.js';

export type PositionInsightAlert = {
  triggerId: string;
  positionId: string;
  breachDirection: ExternalBreachDirection;
  triggeredAt: number;
};

export type GetSolUsdcInsightPositionsResult =
  | { kind: 'ok'; snapshot: SolUsdcPositionSnapshotDto; alerts: PositionInsightAlert[] }
  | { kind: 'pool-unavailable' }
  | { kind: 'position-list-unavailable' }
  | { kind: 'position-detail-unavailable'; positionId: string };

export async function getSolUsdcInsightPositions(params: {
  walletId: WalletId;
  poolId: PoolId;
  positionReadPort: SupportedPositionReadPort;
  triggerRepo: TriggerRepository;
  pricePort: PricePort;
  now: () => number;
}): Promise<GetSolUsdcInsightPositionsResult> {
  const { walletId, poolId, positionReadPort, triggerRepo, pricePort, now } = params;

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

  if (filtered.length === 0) {
    return {
      kind: 'ok',
      snapshot: {
        walletId,
        positions: [],
        dataQuality: { partial: false, warnings: [] },
      },
      alerts: [],
    };
  }

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

  const priceMap = await fetchPriceMap(details, pricePort);

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

  const alerts = triggerEnrichment.filteredTriggers as PositionInsightAlert[];

  return {
    kind: 'ok',
    snapshot: {
      walletId,
      positions: triggerEnrichment.insights,
      dataQuality: {
        partial: warnings.length > 0,
        warnings,
      },
    },
    alerts,
  };
}

async function fetchPriceMap(
  details: PositionDetail[],
  pricePort: PricePort,
): Promise<Map<string, PriceMapEntry>> {
  const mints = new Set<string>();
  for (const d of details) {
    mints.add(d.poolData.tokenPair.mintA);
    mints.add(d.poolData.tokenPair.mintB);
    for (const r of d.fees.rewardInfos) {
      if (r.mint !== '') mints.add(r.mint);
    }
  }
  const map = new Map<string, PriceMapEntry>();
  if (mints.size === 0) return map;
  try {
    const quotes = await pricePort.getPrices([...mints]);
    for (const q of quotes) {
      map.set(q.tokenMint, {
        usdValue: q.usdValue,
        symbol: q.symbol,
        quotedAt: q.quotedAt,
        source: q.source,
      });
    }
  } catch {
    // priceMap stays empty — buildSolUsdcPositionInsight will record warnings
  }
  return map;
}

export async function enrichWithTriggers(params: {
  walletId: WalletId;
  triggerRepo: TriggerRepository;
  insights: SolUsdcPositionInsightDto[];
  filteredPositionIds: ReadonlySet<string>;
}): Promise<{
  insights: SolUsdcPositionInsightDto[];
  warnings: InsightDataWarning[];
  filteredTriggers: Array<{
    triggerId: string;
    positionId: string;
    breachDirection: ExternalBreachDirection;
    triggeredAt: number;
  }>;
}> {
  const { walletId, triggerRepo, insights, filteredPositionIds } = params;
  let triggers;
  try {
    triggers = await triggerRepo.listActionableTriggers(walletId);
  } catch {
    return {
      insights,
      warnings: [
        {
          code: 'actionable_triggers_unavailable',
          message: 'Actionable triggers unavailable.',
        },
      ],
      filteredTriggers: [],
    };
  }

  const filteredTriggers = triggers
    .filter((t) => filteredPositionIds.has(t.positionId))
    .map((t) => ({
      triggerId: t.triggerId,
      positionId: t.positionId,
      breachDirection: toExternalBreachDirection(t.breachDirection),
      triggeredAt: t.triggeredAt,
    }));

  const triggerByPositionId = new Map<string, (typeof filteredTriggers)[number]>(
    filteredTriggers.map((t) => [t.positionId as string, t]),
  );

  const enriched = insights.map((p) => {
    const trig = triggerByPositionId.get(p.positionId);
    if (!trig) return p;
    return {
      ...p,
      hasActionableTrigger: true,
      triggerId: trig.triggerId,
      breachDirection: trig.breachDirection,
    };
  });

  return { insights: enriched, warnings: [], filteredTriggers };
}
