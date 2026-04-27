import type { PositionDetailDto } from '@clmm/application/public';
import { getRangeStatusBadgeProps } from '../components/RangeStatusBadgeUtils.js';

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
};


function formatTokenAmount(raw: string, decimals: number | null, symbol: string): string {
  if (decimals === null) return `${raw} (unknown decimals) ${symbol}`;
  if (decimals === 0) return `${raw} ${symbol}`;

  const fractionalDigits = decimals > 2 ? 4 : 2;

  const padded = raw.padStart(decimals + 1, '0');
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).slice(0, fractionalDigits);

  return `${whole}.${fraction.padEnd(fractionalDigits, '0')} ${symbol}`;
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

export function buildPositionDetailViewModel(dto: PositionDetailDto, _now: number): PositionDetailViewModel {
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
    rangeBoundsLabel: `${dto.lowerBoundLabel} — ${dto.upperBoundLabel}`,
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

  if (dto.breachDirection) {
    return {
      ...base,
      breachDirectionLabel: dto.breachDirection.kind === 'lower-bound-breach'
        ? 'Price dropped below lower bound'
        : 'Price rose above upper bound',
    };
  }

  return { ...base };
}
