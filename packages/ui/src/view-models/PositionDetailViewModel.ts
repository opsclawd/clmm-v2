import type { PositionDetailDto } from '@clmm/application/public';
import { getRangeStatusBadgeProps } from '../components/RangeStatusBadgeUtils.js';

export type SrLevelsViewModelBlock = {
  supportsSorted: Array<{ priceLabel: string; rankLabel?: string }>;
  resistancesSorted: Array<{ priceLabel: string; rankLabel?: string }>;
  freshnessLabel: string;
  isStale: boolean;
};

export type PositionDetailViewModel = {
  positionId: string;
  poolLabel: string;
  currentPriceLabel: string;
  feeRateLabel: string;
  rangeBoundsLabel: string;
  rangeStatusLabel: string;
  rangeStatusColorKey: string;
  rangeDistanceLabel: string;
  unclaimedFeesLabel: string;
  unclaimedFeesBreakdown: {
    feeA: string;
    feeB: string;
  };
  unclaimedRewardsLabel: string;
  positionSizeLabel: string;
  poolDepthLabel: string;
  hasAlert: boolean;
  alertLabel: string;
  breachDirectionLabel?: string;
  srLevels?: SrLevelsViewModelBlock;
};

function computeFreshness(capturedAtUnixMs: number, now: number): { freshnessLabel: string; isStale: boolean } {
  const ageMs = now - capturedAtUnixMs;
  if (ageMs < 3600000) {
    const minutes = Math.max(1, Math.round(ageMs / 60000));
    return { freshnessLabel: `captured ${minutes}m ago`, isStale: false };
  }
  const hours = Math.round(ageMs / 3600000);
  if (ageMs < 172800000) {
    return { freshnessLabel: `captured ${hours}h ago`, isStale: false };
  }
  return { freshnessLabel: `captured ${hours}h ago · stale`, isStale: true };
}

function toSrLevelsViewModelBlock(
  block: NonNullable<PositionDetailDto['srLevels']>,
  now: number,
): SrLevelsViewModelBlock {
  const { freshnessLabel, isStale } = computeFreshness(block.capturedAtUnixMs, now);

  const supportsSorted = [...block.supports]
    .sort((a, b) => a.price - b.price)
    .map((s) => ({
      priceLabel: `$${s.price.toFixed(2)}`,
      ...(s.rank ? { rankLabel: s.rank } : {}),
    }));

  const resistancesSorted = [...block.resistances]
    .sort((a, b) => a.price - b.price)
    .map((r) => ({
      priceLabel: `$${r.price.toFixed(2)}`,
      ...(r.rank ? { rankLabel: r.rank } : {}),
    }));

  return { supportsSorted, resistancesSorted, freshnessLabel, isStale };
}

function formatTokenAmount(raw: bigint, decimals: number, symbol: string): string {
  const humanReadable = Number(raw) / 10 ** decimals;
  return `${humanReadable.toFixed(decimals > 2 ? 4 : 2)} ${symbol}`;
}

function rangeDistanceLabel(distance: { belowLowerPercent: number; aboveUpperPercent: number }): string {
  if (distance.belowLowerPercent > 0) {
    return `${distance.belowLowerPercent.toFixed(1)}% below lower bound`;
  }
  if (distance.aboveUpperPercent > 0) {
    return `${distance.aboveUpperPercent.toFixed(1)}% above upper bound`;
  }
  return 'In range';
}

export function buildPositionDetailViewModel(dto: PositionDetailDto, now: number): PositionDetailViewModel {
  const badge = getRangeStatusBadgeProps(dto.rangeState);

  const unclaimedFeesLabel = dto.unclaimedFees.totalUsd > 0
    ? `$${dto.unclaimedFees.totalUsd.toFixed(2)} in unclaimed fees`
    : `${formatTokenAmount(dto.unclaimedFees.feeOwedA.raw, dto.unclaimedFees.feeOwedA.decimals, dto.unclaimedFees.feeOwedA.symbol)} + ${formatTokenAmount(dto.unclaimedFees.feeOwedB.raw, dto.unclaimedFees.feeOwedB.decimals, dto.unclaimedFees.feeOwedB.symbol)} unclaimed`;

  const unclaimedRewardsLabel = dto.unclaimedRewards.totalUsd > 0
    ? `$${dto.unclaimedRewards.totalUsd.toFixed(2)} in rewards`
    : dto.unclaimedRewards.rewards.length > 0
      ? dto.unclaimedRewards.rewards.map((r) => formatTokenAmount(r.amount, r.decimals, r.symbol)).join(', ') + ' rewards'
      : 'No rewards';

  const base = {
    positionId: dto.positionId,
    poolLabel: dto.tokenPairLabel,
    currentPriceLabel: dto.currentPriceLabel,
    feeRateLabel: dto.feeRateLabel,
    rangeBoundsLabel: `$${dto.lowerBound} — $${dto.upperBound}`,
    rangeStatusLabel: badge.label,
    rangeStatusColorKey: badge.colorKey,
    rangeDistanceLabel: rangeDistanceLabel(dto.rangeDistance),
    unclaimedFeesLabel,
    unclaimedFeesBreakdown: {
      feeA: formatTokenAmount(dto.unclaimedFees.feeOwedA.raw, dto.unclaimedFees.feeOwedA.decimals, dto.unclaimedFees.feeOwedA.symbol),
      feeB: formatTokenAmount(dto.unclaimedFees.feeOwedB.raw, dto.unclaimedFees.feeOwedB.decimals, dto.unclaimedFees.feeOwedB.symbol),
    },
    unclaimedRewardsLabel,
    positionSizeLabel: `${dto.positionLiquidity.toString()} liquidity units`,
    poolDepthLabel: dto.poolDepthLabel,
    hasAlert: dto.hasActionableTrigger,
    alertLabel: dto.hasActionableTrigger ? 'Action Required' : 'No Alerts',
  };

  const srLevelsVm = dto.srLevels
    ? toSrLevelsViewModelBlock(dto.srLevels, now)
    : undefined;

  if (dto.breachDirection) {
    return {
      ...base,
      breachDirectionLabel: dto.breachDirection.kind === 'lower-bound-breach'
        ? 'Price dropped below lower bound'
        : 'Price rose above upper bound',
      ...(srLevelsVm ? { srLevels: srLevelsVm } : {}),
    };
  }

  return { ...base, ...(srLevelsVm ? { srLevels: srLevelsVm } : {}) };
}