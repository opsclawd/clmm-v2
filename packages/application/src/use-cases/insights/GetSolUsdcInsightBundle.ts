import type { PoolId, WalletId } from '@clmm/domain';
import type {
  SupportedPositionReadPort,
  TriggerRepository,
  PricePort,
  SrLevelsReadPort,
} from '../../ports/index.js';
import type { SolUsdcInsightInputBundleDto, InsightDataWarning } from '../../dto/index.js';
import { getSolUsdcInsightPoolSnapshot } from './GetSolUsdcInsightPoolSnapshot.js';
import { getSolUsdcInsightPositions } from './GetSolUsdcInsightPositions.js';

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

  const positionsResult = await getSolUsdcInsightPositions({
    walletId,
    poolId,
    positionReadPort,
    triggerRepo,
    pricePort,
    now,
  });
  if (positionsResult.kind === 'pool-unavailable') return { kind: 'pool-unavailable' };
  if (positionsResult.kind === 'position-list-unavailable')
    return { kind: 'position-list-unavailable' };
  if (positionsResult.kind === 'position-detail-unavailable') {
    return { kind: 'position-detail-unavailable', positionId: positionsResult.positionId };
  }

  const { snapshot, alerts } = positionsResult;
  const warnings: InsightDataWarning[] = [...snapshot.dataQuality.warnings];

  let srLevels = null;
  try {
    srLevels = await srLevelsReadPort.fetchCurrent(srLevelsLookup.symbol, srLevelsLookup.source);
    if (srLevels === null) {
      warnings.push({
        code: 'sr_levels_unavailable',
        message: 'S/R levels unavailable.',
      });
    }
  } catch {
    warnings.push({
      code: 'sr_levels_unavailable',
      message: 'S/R levels unavailable.',
    });
  }

  return {
    kind: 'ok',
    bundle: {
      pair: 'SOL/USDC',
      source: 'orca',
      observedAtUnixMs:
        snapshot.positions.length > 0
          ? snapshot.positions[0]!.observedAtUnixMs
          : poolResult.pool.observedAtUnixMs,
      pool: poolResult.pool,
      srLevels,
      positions: snapshot.positions,
      alerts,
      dataQuality: {
        partial: warnings.length > 0,
        warnings,
      },
    },
  };
}
