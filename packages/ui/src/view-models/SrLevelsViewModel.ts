import type { SrLevelsBlock } from '@clmm/application/public';

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

export function buildSrLevelsViewModelBlock(block: SrLevelsBlock, now: number): SrLevelsViewModelBlock {
  const { freshnessLabel, isStale } = computeFreshness(block.capturedAtUnixMs, now);

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

    levels.sort((a, b) => b.rawPrice - a.rawPrice);

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
    return bPrice - aPrice;
  });

  return {
    summary: block.summary ?? undefined,
    groups,
    freshnessLabel,
    isStale,
  };
}