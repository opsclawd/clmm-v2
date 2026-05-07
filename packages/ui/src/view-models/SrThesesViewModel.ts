import type { SrThesesBlock, SrThesisDto } from '@clmm/application/public';

export type SrThesisBiasTone = 'safe' | 'breach' | 'warn' | 'neutral';

export type SrThesisCardViewModel = {
  asset: string;
  timeframe: string;
  bias: string | null;
  biasTone: SrThesisBiasTone;
  setupType: string | null;
  supportLevels: string[];
  resistanceLevels: string[];
  entryZone: string | null;
  targets: string[];
  invalidation: string | null;
  trigger: string | null;
  sourceHandle: string;
  sourceKind: string;
  sourceReliability: string | null;
  sourceUrl: string | null;
  chartReference: string | null;
  rawThesisText: string | null;
  rawThesisCollapsedByDefault: true;
  timestampLabel: string | null;
  notes: string | null;
};

export type SrThesisOverlayInvalidation =
  | { kind: 'numeric'; value: number; raw: string }
  | { kind: 'text'; raw: string }
  | null;

export type SrThesisOverlayEntryZone =
  | { kind: 'range'; low: number; high: number; raw: string }
  | { kind: 'numeric'; value: number; raw: string }
  | { kind: 'text'; raw: string }
  | null;

export type SrThesisOverlayModel = {
  supports: number[];
  resistances: number[];
  targets: number[];
  invalidation: SrThesisOverlayInvalidation;
  entryZone: SrThesisOverlayEntryZone;
};

export type SrThesesViewModel = {
  briefSummary: string | null;
  sourceLabel: string;
  freshnessLabel: string;
  isStale: boolean;
  cards: SrThesisCardViewModel[];
  visibleCards: SrThesisCardViewModel[];
  remainingCount: number;
  selectedThesisIndex: number;
  selectedCard: SrThesisCardViewModel;
  overlay: SrThesisOverlayModel;
};

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const STALE_THRESHOLD_MS = 48 * MS_PER_HOUR;
const DEFAULT_VISIBLE_COUNT = 3;

const KNOWN_BULLISH = new Set(['bull', 'bullish', 'long']);
const KNOWN_BEARISH = new Set(['bear', 'bearish', 'short']);
const KNOWN_NEUTRAL_WARN = new Set(['range', 'neutral', 'chop', 'choppy']);

function biasToneOf(bias: string | null): SrThesisBiasTone {
  if (bias == null) return 'neutral';
  const key = bias.toLowerCase().trim();
  if (KNOWN_BULLISH.has(key)) return 'safe';
  if (KNOWN_BEARISH.has(key)) return 'breach';
  if (KNOWN_NEUTRAL_WARN.has(key)) return 'warn';
  return 'neutral';
}

function recencyTimestampMs(thesis: SrThesisDto, fallbackMs: number): number {
  const candidates: ReadonlyArray<string | null> = [thesis.publishedAt, thesis.collectedAt];
  for (const value of candidates) {
    if (value == null) continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallbackMs;
}

function isUnparseable(thesis: SrThesisDto): boolean {
  if (thesis.publishedAt == null && thesis.collectedAt == null) return false;
  const published = thesis.publishedAt != null ? Date.parse(thesis.publishedAt) : null;
  const collected = thesis.collectedAt != null ? Date.parse(thesis.collectedAt) : null;
  const publishedOk = published != null && Number.isFinite(published);
  const collectedOk = collected != null && Number.isFinite(collected);
  return !publishedOk && !collectedOk;
}

function computeFreshness(
  capturedAtUnixMs: number,
  now: number,
): { freshnessLabel: string; isStale: boolean } {
  const ageMs = Math.max(0, now - capturedAtUnixMs);
  if (ageMs < MS_PER_HOUR) {
    const minutes = Math.max(1, Math.round(ageMs / MS_PER_MINUTE));
    return { freshnessLabel: `${minutes}m ago`, isStale: false };
  }
  const hours = Math.round(ageMs / MS_PER_HOUR);
  if (ageMs < STALE_THRESHOLD_MS) {
    return { freshnessLabel: `${hours}h ago`, isStale: false };
  }
  return { freshnessLabel: `${hours}h ago · stale`, isStale: true };
}

function timestampLabelOf(thesis: SrThesisDto, capturedAtIso: string): string | null {
  return thesis.publishedAt ?? thesis.collectedAt ?? capturedAtIso;
}

function tryParseNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const numericPattern = /^-?\d+(?:\.\d+)?$/;
  if (!numericPattern.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function tryParseRange(value: string): { low: number; high: number } | null {
  const parts = value.split(/[-–—]/).map((p) => p.trim());
  if (parts.length !== 2) return null;
  const low = tryParseNumber(parts[0]!);
  const high = tryParseNumber(parts[1]!);
  if (low == null || high == null) return null;
  return { low: Math.min(low, high), high: Math.max(low, high) };
}

function parseEntryZone(value: string | null): SrThesisOverlayEntryZone {
  if (value == null) return null;
  const range = tryParseRange(value);
  if (range != null) return { kind: 'range', low: range.low, high: range.high, raw: value };
  const num = tryParseNumber(value);
  if (num != null) return { kind: 'numeric', value: num, raw: value };
  return { kind: 'text', raw: value };
}

function parseInvalidation(value: string | null): SrThesisOverlayInvalidation {
  if (value == null) return null;
  const num = tryParseNumber(value);
  if (num != null) return { kind: 'numeric', value: num, raw: value };
  return { kind: 'text', raw: value };
}

function parseNumericList(values: string[]): number[] {
  const out: number[] = [];
  for (const value of values) {
    const num = tryParseNumber(value);
    if (num != null) out.push(num);
  }
  return out;
}

function buildCard(thesis: SrThesisDto, capturedAtIso: string): SrThesisCardViewModel {
  return {
    asset: thesis.asset,
    timeframe: thesis.timeframe,
    bias: thesis.bias,
    biasTone: biasToneOf(thesis.bias),
    setupType: thesis.setupType,
    supportLevels: thesis.supportLevels,
    resistanceLevels: thesis.resistanceLevels,
    entryZone: thesis.entryZone,
    targets: thesis.targets,
    invalidation: thesis.invalidation,
    trigger: thesis.trigger,
    sourceHandle: thesis.sourceHandle,
    sourceKind: thesis.sourceKind,
    sourceReliability: thesis.sourceReliability,
    sourceUrl: thesis.sourceUrl,
    chartReference: thesis.chartReference,
    rawThesisText: thesis.rawThesisText,
    rawThesisCollapsedByDefault: true,
    timestampLabel: timestampLabelOf(thesis, capturedAtIso),
    notes: thesis.notes,
  };
}

function overlayFor(thesis: SrThesisDto): SrThesisOverlayModel {
  return {
    supports: parseNumericList(thesis.supportLevels),
    resistances: parseNumericList(thesis.resistanceLevels),
    targets: parseNumericList(thesis.targets),
    invalidation: parseInvalidation(thesis.invalidation),
    entryZone: parseEntryZone(thesis.entryZone),
  };
}

export function buildSrThesesViewModel(block: SrThesesBlock, now: number): SrThesesViewModel {
  const { freshnessLabel, isStale } = computeFreshness(block.capturedAtUnixMs, now);

  type Ranked = { thesis: SrThesisDto; tsMs: number; unparseable: boolean };
  const ranked: Ranked[] = block.theses.map((t) => ({
    thesis: t,
    tsMs: recencyTimestampMs(t, block.capturedAtUnixMs),
    unparseable: isUnparseable(t),
  }));

  ranked.sort((a, b) => {
    if (a.unparseable !== b.unparseable) return a.unparseable ? 1 : -1;
    return b.tsMs - a.tsMs;
  });

  const sortedTheses = ranked.map((r) => r.thesis);
  const cards = sortedTheses.map((t) => buildCard(t, block.capturedAtIso));
  const visibleCards = cards.slice(0, DEFAULT_VISIBLE_COUNT);
  const remainingCount = Math.max(0, cards.length - DEFAULT_VISIBLE_COUNT);

  const selectedThesisIndex = 0;
  const selectedCard =
    cards[selectedThesisIndex] ?? buildCard(sortedTheses[0]!, block.capturedAtIso);
  const overlay = overlayFor(sortedTheses[selectedThesisIndex] ?? sortedTheses[0]!);

  return {
    briefSummary: block.brief.summary,
    sourceLabel: block.source,
    freshnessLabel,
    isStale,
    cards,
    visibleCards,
    remainingCount,
    selectedThesisIndex,
    selectedCard,
    overlay,
  };
}
