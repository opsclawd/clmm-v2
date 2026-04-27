import type { PositionDetailDto } from '@clmm/application/public';
import { getRangeStatusBadgeProps } from '../components/RangeStatusBadgeUtils.js';

export type SrLevelViewModel = {
  kind: 'support' | 'resistance';
  rawPrice: number;
  priceLabel: string;
  tone: 'safe' | 'warn' | 'breach';
};

export type SrLevelGroupViewModel = {
  levels: SrLevelViewModel[];
  note: string;
  source?: string;
  timeframe?: string;
  bias?: string;
  setupType?: string;
  trigger?: string;
  invalidation?: string;
};

export type SrLevelsViewModelBlock = {
  summary?: string | undefined;
  groups: SrLevelGroupViewModel[];
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

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const STALE_THRESHOLD_MS = 48 * MS_PER_HOUR;

function computeFreshness(capturedAtUnixMs: number, now: number): { freshnessLabel: string; isStale: boolean } {
  const ageMs = now - capturedAtUnixMs;
  if (ageMs < MS_PER_HOUR) {
    const minutes = Math.max(1, Math.round(ageMs / MS_PER_MINUTE));
    return { freshnessLabel: `AI · MCO · ${minutes}m ago`, isStale: false };
  }
  const hours = Math.round(ageMs / MS_PER_HOUR);
  if (ageMs < STALE_THRESHOLD_MS) {
    return { freshnessLabel: `AI · MCO · ${hours}h ago`, isStale: false };
  }
  return { freshnessLabel: `AI · MCO · ${hours}h ago · stale`, isStale: true };
}

function parseNotes(notes: string | undefined): {
  source?: string;
  timeframe?: string;
  bias?: string;
  setupType?: string;
  trigger?: string;
  invalidation?: string;
  remaining: string;
} {
  if (!notes) {
    return { remaining: '' };
  }

  const parts = notes.split('|').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) {
    return { remaining: '' };
  }
  if (parts.length === 1) {
    return { remaining: parts[0] ?? '' };
  }

  // Parse metadata from first section
  const firstSection = parts[0]!;
  const lastDotIndex = firstSection.lastIndexOf('.');
  let source: string | undefined;
  let timeframe: string | undefined;
  let bias: string | undefined;
  let setupType: string | undefined;

  if (lastDotIndex > -1) {
    setupType = firstSection.slice(lastDotIndex + 1).trim();
    const beforeDot = firstSection.slice(0, lastDotIndex).trim();
    const commaParts = beforeDot.split(',').map((s) => s.trim());
    if (commaParts.length >= 2) {
      bias = commaParts[commaParts.length - 1];
      const sourceTimeframe = commaParts.slice(0, -1).join(',').trim();
      const spaceParts = sourceTimeframe.split(/\s+/);
      if (spaceParts.length >= 2) {
        source = spaceParts[0];
        timeframe = spaceParts.slice(1).join(' ');
      } else {
        source = sourceTimeframe;
      }
    } else {
      const spaceParts = beforeDot.split(/\s+/);
      if (spaceParts.length >= 2) {
        source = spaceParts[0];
        timeframe = spaceParts.slice(1).join(' ');
      } else {
        source = beforeDot;
      }
    }
  } else {
    return { remaining: notes.trim() };
  }

  // Parse trigger and invalidation from remaining sections
  let trigger: string | undefined;
  let invalidation: string | undefined;
  const noteParts: string[] = [];

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]!;
    const lower = part.toLowerCase();
    if (lower.startsWith('trigger:')) {
      trigger = part.slice('trigger:'.length).trim();
    } else if (lower.startsWith('invalidation:')) {
      invalidation = part.slice('invalidation:'.length).trim();
    } else {
      noteParts.push(part);
    }
  }

  return {
    ...(source ? { source } : {}),
    ...(timeframe ? { timeframe } : {}),
    ...(bias ? { bias } : {}),
    ...(setupType ? { setupType } : {}),
    ...(trigger ? { trigger } : {}),
    ...(invalidation ? { invalidation } : {}),
    remaining: noteParts.join('\n'),
  };
}

function toSrLevelsViewModelBlock(
  block: NonNullable<PositionDetailDto['srLevels']>,
  _currentPrice: number,
  _lowerBound: number,
  _upperBound: number,
  now: number,
): SrLevelsViewModelBlock {
  const { freshnessLabel, isStale } = computeFreshness(block.capturedAtUnixMs, now);

  // Collect all levels with parsed metadata
  type LevelWithMeta = {
    kind: 'support' | 'resistance';
    price: number;
    parsed: ReturnType<typeof parseNotes>;
  };

  const allLevels: LevelWithMeta[] = [];

  for (const item of block.supports) {
    allLevels.push({ kind: 'support', price: item.price, parsed: parseNotes(item.notes) });
  }
  for (const item of block.resistances) {
    allLevels.push({ kind: 'resistance', price: item.price, parsed: parseNotes(item.notes) });
  }

  // Group by identical parsed metadata (trigger + invalidation + bias + source + timeframe + setupType)
  const rawGroups = new Map<string, LevelWithMeta[]>();

  for (const level of allLevels) {
    const key = `${level.parsed.bias ?? ''}:${level.parsed.source ?? ''}:${level.parsed.timeframe ?? ''}:${level.parsed.setupType ?? ''}:${level.parsed.trigger ?? ''}:${level.parsed.invalidation ?? ''}`;
    const existing = rawGroups.get(key);
    if (existing) {
      existing.push(level);
    } else {
      rawGroups.set(key, [level]);
    }
  }

  const groups: SrLevelGroupViewModel[] = [];

  for (const [, items] of rawGroups) {
    if (items.length === 0) continue;
    const first = items[0]!;

    const levels = items.map((item) => ({
      kind: item.kind,
      rawPrice: item.price,
      priceLabel: `$${item.price.toFixed(2)}`,
      tone: item.kind === 'resistance' ? ('breach' as const) : ('safe' as const),
    }));

    levels.sort((a, b) => a.rawPrice - b.rawPrice);

    groups.push({
      levels,
      note: '',
      ...(first.parsed.source ? { source: first.parsed.source } : {}),
      ...(first.parsed.timeframe ? { timeframe: first.parsed.timeframe } : {}),
      ...(first.parsed.bias ? { bias: first.parsed.bias } : {}),
      ...(first.parsed.setupType ? { setupType: first.parsed.setupType } : {}),
      ...(first.parsed.trigger ? { trigger: first.parsed.trigger } : {}),
      ...(first.parsed.invalidation ? { invalidation: first.parsed.invalidation } : {}),
    });
  }

  groups.sort((a, b) => {
    const aPrice = a.levels[0]?.rawPrice ?? 0;
    const bPrice = b.levels[0]?.rawPrice ?? 0;
    return aPrice - bPrice;
  });

  return {
    summary: block.summary ?? undefined,
    groups,
    freshnessLabel,
    isStale,
  };
}

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

  const srLevelsVm = dto.srLevels
    ? toSrLevelsViewModelBlock(dto.srLevels, dto.currentPrice, dto.lowerBound, dto.upperBound, now)
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
