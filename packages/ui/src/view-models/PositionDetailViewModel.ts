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
  rangeBoundsLabel: string;
  currentPriceLabel: string;
  rangeStatusLabel: string;
  rangeStatusColorKey: string;
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

export function buildPositionDetailViewModel(dto: PositionDetailDto, now: number): PositionDetailViewModel {
  const badge = getRangeStatusBadgeProps(dto.rangeState);

  const base = {
    positionId: dto.positionId,
    poolLabel: `Pool ${dto.poolId}`,
    rangeBoundsLabel: `${dto.lowerBound} — ${dto.upperBound}`,
    currentPriceLabel: `Current: ${dto.currentPrice}`,
    rangeStatusLabel: badge.label,
    rangeStatusColorKey: badge.colorKey,
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
