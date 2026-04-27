# Position Detail S/R Section Redesign v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Support & Resistance section with a separate Market Thesis card, grouped S/R levels with parsed shared notes, and resistance=red/support=green color scheme.

**Architecture:** The S/R view-model is restructured to parse notes into structured fields (source, timeframe, bias, setupType) and group levels by identical metadata. A new `MarketThesisCard` component renders above `SrLevelsCard`. The S/R card now shows grouped levels with subtle background containers and shared notes at the bottom of each group.

**Tech Stack:** React Native, TypeScript, Vitest, existing design system tokens.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `packages/ui/src/view-models/PositionDetailViewModel.ts` | Parse notes, group levels, tone override, expose summary |
| `packages/ui/src/view-models/PositionDetailViewModel.test.ts` | Tests for parsing, grouping, tones |
| `packages/ui/src/components/MarketThesisCard.tsx` | NEW — renders summary with info icon and metadata |
| `packages/ui/src/components/SrLevelsCard.tsx` | Redesign — groups, no per-row notes, red resistance |
| `packages/ui/src/screens/PositionDetailScreen.tsx` | Render MarketThesisCard above SrLevelsCard |
| `packages/ui/src/screens/PositionDetailScreen.test.tsx` | Update for new card structure |

---

## Task 1: Restructure S/R View-Model with Note Parsing and Grouping

**Files:**
- Modify: `packages/ui/src/view-models/PositionDetailViewModel.ts`
- Modify: `packages/ui/src/view-models/PositionDetailViewModel.test.ts`

- [ ] **Step 1: Update the SrLevelViewModel type**

Remove `note` from `SrLevelViewModel`:

```typescript
export type SrLevelViewModel = {
  kind: 'support' | 'resistance';
  rawPrice: number;
  priceLabel: string;
  tone: 'safe' | 'warn' | 'breach';
};
```

- [ ] **Step 2: Add new group and view-model types**

Add these types after `SrLevelViewModel`:

```typescript
export type SrLevelGroupViewModel = {
  levels: SrLevelViewModel[];
  note: string;
  source?: string;
  timeframe?: string;
  bias?: string;
  setupType?: string;
};

export type SrLevelsViewModelBlock = {
  summary?: string;
  groups: SrLevelGroupViewModel[];
  freshnessLabel: string;
  isStale: boolean;
};
```

- [ ] **Step 3: Add note parsing helper**

Add this function above `toSrLevelsViewModelBlock`:

```typescript
function parseNotes(notes: string | undefined): {
  source?: string;
  timeframe?: string;
  bias?: string;
  setupType?: string;
  remaining: string;
} {
  if (!notes) {
    return { remaining: '' };
  }

  const parts = notes.split('|');
  if (parts.length === 1) {
    return { remaining: notes.trim() };
  }

  const firstSection = parts[0].trim();
  const remaining = parts.slice(1).join('\n').trim();

  // Parse: "source, timeframe, bias. setupType"
  const commaParts = firstSection.split(',').map((s) => s.trim());
  const source = commaParts[0];
  const timeframe = commaParts[1];

  // Bias and setupType are separated by period
  const biasSetupPart = commaParts.slice(2).join(',').trim();
  const dotIndex = biasSetupPart.indexOf('.');
  const bias = dotIndex > -1 ? biasSetupPart.slice(0, dotIndex).trim() : biasSetupPart;
  const setupType = dotIndex > -1 ? biasSetupPart.slice(dotIndex + 1).trim() : undefined;

  return {
    ...(source ? { source } : {}),
    ...(timeframe ? { timeframe } : {}),
    ...(bias ? { bias } : {}),
    ...(setupType ? { setupType } : {}),
    remaining,
  };
}
```

- [ ] **Step 4: Add grouping helper**

Add this function above `toSrLevelsViewModelBlock`:

```typescript
type GroupKey = string;

function makeGroupKey(level: { rank?: string; timeframe?: string; notes?: string }): GroupKey {
  return `${level.rank ?? ''}:${level.timeframe ?? ''}:${level.notes ?? ''}`;
}
```

- [ ] **Step 5: Rewrite toSrLevelsViewModelBlock with grouping**

Replace the existing `toSrLevelsViewModelBlock`:

```typescript
function toSrLevelsViewModelBlock(
  block: NonNullable<PositionDetailDto['srLevels']>,
  currentPrice: number,
  lowerBound: number,
  upperBound: number,
  now: number,
): SrLevelsViewModelBlock {
  const { freshnessLabel, isStale } = computeFreshness(block.capturedAtUnixMs, now);

  // Group raw levels by identical metadata
  const rawGroups = new Map<string, { kind: 'support' | 'resistance'; items: typeof block.supports }>();

  const addToGroup = (kind: 'support' | 'resistance', items: typeof block.supports) => {
    for (const item of items) {
      const key = makeGroupKey(item);
      const existing = rawGroups.get(key);
      if (existing) {
        existing.items.push(item);
      } else {
        rawGroups.set(key, { kind, items: [item] });
      }
    }
  };

  addToGroup('support', block.supports);
  addToGroup('resistance', block.resistances);

  const groups: SrLevelGroupViewModel[] = [];

  for (const [key, { kind, items }] of rawGroups) {
    const first = items[0];
    const parsed = parseNotes(first.notes);

    const levels = items.map((item) => ({
      kind,
      rawPrice: item.price,
      priceLabel: `$${item.price.toFixed(2)}`,
      tone: kind === 'resistance' ? ('breach' as const) : ('safe' as const),
    }));

    // Sort levels within group by price ascending
    levels.sort((a, b) => a.rawPrice - b.rawPrice);

    groups.push({
      levels,
      note: parsed.remaining,
      ...(parsed.source ? { source: parsed.source } : {}),
      ...(parsed.timeframe ? { timeframe: parsed.timeframe } : {}),
      ...(parsed.bias ? { bias: parsed.bias } : {}),
      ...(parsed.setupType ? { setupType: parsed.setupType } : {}),
    });
  }

  // Sort groups by lowest price in each group
  groups.sort((a, b) => a.levels[0].rawPrice - b.levels[0].rawPrice);

  return {
    summary: block.summary ?? undefined,
    groups,
    freshnessLabel,
    isStale,
  };
}
```

- [ ] **Step 6: Remove old computeLevelTone and computeLevelNote**

These are no longer needed. Delete them.

- [ ] **Step 7: Remove isNearBound and isWithinProximity**

These are no longer needed. Delete them.

- [ ] **Step 8: Remove BOUND_EPSILON and PROXIMITY_THRESHOLD**

These constants are no longer needed. Delete them.

- [ ] **Step 9: Update view-model tests**

Replace the test file contents:

```typescript
import { describe, expect, it } from 'vitest';
import type { PositionDetailDto } from '@clmm/application/public';
import { buildPositionDetailViewModel } from './PositionDetailViewModel.js';

function makeDto(overrides: Partial<PositionDetailDto> = {}): PositionDetailDto {
  return {
    positionId: 'position-1' as PositionDetailDto['positionId'],
    poolId: 'pool-1' as PositionDetailDto['poolId'],
    tokenPairLabel: 'SOL / USDC',
    currentPrice: 150,
    currentPriceLabel: 'USDC 150.00',
    feeRateLabel: '10 bps',
    rangeState: 'in-range',
    rangeDistance: { belowLowerPercent: 0, aboveUpperPercent: 0 },
    hasActionableTrigger: false,
    monitoringStatus: 'active',
    lowerBound: 100,
    upperBound: 200,
    lowerBoundLabel: 'USDC 100.00',
    upperBoundLabel: 'USDC 200.00',
    sqrtPrice: '123456',
    unclaimedFees: {
      feeOwedA: { raw: '100000000', decimals: 9, symbol: 'SOL', usdValue: 15 },
      feeOwedB: { raw: '30000000', decimals: 6, symbol: 'USDC', usdValue: 30 },
      totalUsd: 45,
    },
    unclaimedRewards: {
      rewards: [],
      totalUsd: 0,
    },
    positionLiquidity: '5000000000',
    poolLiquidity: '2400000000',
    poolDepthLabel: 'depth unavailable',
    ...overrides,
  };
}

function makeSrBlock(overrides: Partial<NonNullable<PositionDetailDto['srLevels']>> = {}): NonNullable<PositionDetailDto['srLevels']> {
  return {
    briefId: 'brief-1',
    sourceRecordedAtIso: null,
    summary: null,
    capturedAtUnixMs: 1_000_000_000,
    supports: [{ price: 90 }, { price: 110 }],
    resistances: [{ price: 180 }, { price: 210 }],
    ...overrides,
  };
}

describe('buildPositionDetailViewModel srLevels', () => {
  it('returns srLevels undefined when dto has no srLevels', () => {
    const vm = buildPositionDetailViewModel(makeDto(), Date.now());
    expect(vm.srLevels).toBeUndefined();
  });

  it('returns a populated srLevels block when dto.srLevels is present', () => {
    const now = 2_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({ srLevels: makeSrBlock({ capturedAtUnixMs: 1_700_000 }) }),
      now,
    );
    expect(vm.srLevels).toBeDefined();
    expect(vm.srLevels!.groups.length).toBeGreaterThan(0);
  });

  it('computes freshness for 5 minutes ago', () => {
    const now = 2_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({ srLevels: makeSrBlock({ capturedAtUnixMs: 1_700_000 }) }),
      now,
    );
    expect(vm.srLevels?.freshnessLabel).toBe('AI · MCO · 5m ago');
    expect(vm.srLevels?.isStale).toBe(false);
  });

  it('parses notes with pipe separator', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [
            { price: 90, notes: 'morecryptoonline, 4h, Bearish. swing | Break below $85 signals C-wave down.' },
          ],
          resistances: [],
        }),
      }),
      now,
    );
    const group = vm.srLevels!.groups[0]!;
    expect(group.source).toBe('morecryptoonline');
    expect(group.timeframe).toBe('4h');
    expect(group.bias).toBe('Bearish');
    expect(group.setupType).toBe('swing');
    expect(group.note).toBe('Break below $85 signals C-wave down.');
  });

  it('returns raw notes when no pipe separator', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [{ price: 90, notes: 'Primary support zone' }],
          resistances: [],
        }),
      }),
      now,
    );
    const group = vm.srLevels!.groups[0]!;
    expect(group.note).toBe('Primary support zone');
    expect(group.source).toBeUndefined();
  });

  it('groups levels with identical metadata', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [
            { price: 90, rank: 'S1', notes: 'source, 1h, Bullish. test | note body' },
            { price: 110, rank: 'S1', notes: 'source, 1h, Bullish. test | note body' },
          ],
          resistances: [],
        }),
      }),
      now,
    );
    expect(vm.srLevels!.groups.length).toBe(1);
    expect(vm.srLevels!.groups[0]!.levels.length).toBe(2);
  });

  it('creates separate groups for different metadata', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [
            { price: 90, rank: 'S1', notes: 'note A' },
            { price: 110, rank: 'S2', notes: 'note B' },
          ],
          resistances: [],
        }),
      }),
      now,
    );
    expect(vm.srLevels!.groups.length).toBe(2);
  });

  it('marks resistance as breach tone (red)', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [],
          resistances: [{ price: 180 }],
        }),
      }),
      now,
    );
    expect(vm.srLevels!.groups[0]!.levels[0]!.tone).toBe('breach');
  });

  it('marks support as safe tone (green)', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [{ price: 90 }],
          resistances: [],
        }),
      }),
      now,
    );
    expect(vm.srLevels!.groups[0]!.levels[0]!.tone).toBe('safe');
  });

  it('passes summary through to view-model', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          summary: 'Bearish swing, trend continuation.',
        }),
      }),
      now,
    );
    expect(vm.srLevels!.summary).toBe('Bearish swing, trend continuation.');
  });

  it('sorts groups by lowest price ascending', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [{ price: 130, notes: 'high' }],
          resistances: [{ price: 80, notes: 'low' }],
        }),
      }),
      now,
    );
    // Resistance at 80 should come before support at 130
    expect(vm.srLevels!.groups[0]!.levels[0]!.priceLabel).toBe('$80.00');
    expect(vm.srLevels!.groups[1]!.levels[0]!.priceLabel).toBe('$130.00');
  });
});
```

- [ ] **Step 10: Run view-model tests**

```bash
cd /home/gpoontip/clmm-v2/packages/ui && npx vitest run src/view-models/PositionDetailViewModel.test.ts
```

Expected: All tests pass.

- [ ] **Step 11: Commit view-model changes**

```bash
git add packages/ui/src/view-models/PositionDetailViewModel.ts packages/ui/src/view-models/PositionDetailViewModel.test.ts
git commit -m "feat: parse notes, group levels, add summary to S/R view-model"
```

---

## Task 2: Create MarketThesisCard Component

**Files:**
- Create: `packages/ui/src/components/MarketThesisCard.tsx`
- Modify: `packages/ui/src/screens/PositionDetailScreen.tsx`
- Modify: `packages/ui/src/screens/PositionDetailScreen.test.tsx`

- [ ] **Step 1: Create MarketThesisCard.tsx**

```typescript
import { View, Text } from 'react-native';
import { colors, typography } from '../design-system/index.js';

function InfoIcon(): JSX.Element {
  return (
    <View style={{
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.textMuted,
      justifyContent: 'center',
      alignItems: 'center',
    }}>
      <Text style={{
        fontSize: 10,
        color: colors.textMuted,
        fontWeight: typography.fontWeight.semibold,
        lineHeight: 14,
      }}>
        i
      </Text>
    </View>
  );
}

type Props = {
  summary: string;
  source?: string;
  timeframe?: string;
  bias?: string;
  setupType?: string;
};

export function MarketThesisCard({ summary, source, timeframe, bias, setupType }: Props): JSX.Element {
  return (
    <View style={{
      marginTop: 14,
      padding: 16,
      backgroundColor: colors.surface,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
      }}>
        <InfoIcon />
        <Text style={{
          color: colors.textSecondary,
          fontSize: typography.fontSize.micro,
          fontWeight: typography.fontWeight.semibold,
          letterSpacing: 0.08,
          textTransform: 'uppercase',
        }}>
          Market Thesis
        </Text>
        {bias ? (
          <View style={{
            height: 22,
            paddingHorizontal: 8,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: 'rgba(244,201,122,0.30)',
            justifyContent: 'center',
            alignItems: 'center',
          }}>
            <Text style={{
              fontSize: typography.fontSize.micro,
              color: colors.warn,
              fontWeight: typography.fontWeight.semibold,
            }}>
              {bias}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Summary text */}
      <Text style={{
        color: colors.text,
        fontSize: typography.fontSize.sm,
        lineHeight: typography.lineHeight.normal * typography.fontSize.sm,
      }}>
        {summary}
      </Text>

      {/* Metadata */}
      <View style={{ marginTop: 12 }}>
        {source ? (
          <Text style={{
            fontSize: typography.fontSize.micro,
            color: colors.textMuted,
          }}>
            Source · {source}
          </Text>
        ) : null}
        {timeframe ? (
          <Text style={{
            fontSize: typography.fontSize.micro,
            color: colors.textMuted,
          }}>
            Timeframe · {timeframe}
          </Text>
        ) : null}
        {setupType ? (
          <Text style={{
            fontSize: typography.fontSize.micro,
            color: colors.textMuted,
          }}>
            Setup · {setupType}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Update PositionDetailScreen to render MarketThesisCard**

Find where `SrLevelsCard` is rendered and add `MarketThesisCard` above it:

```typescript
import { MarketThesisCard } from '../components/MarketThesisCard.js';
```

Then in the JSX, replace:
```tsx
<SrLevelsCard srLevels={vm.srLevels} />
```

With:
```tsx
{vm.srLevels?.summary ? (
  <MarketThesisCard
    summary={vm.srLevels.summary}
    source={vm.srLevels.groups[0]?.source}
    timeframe={vm.srLevels.groups[0]?.timeframe}
    bias={vm.srLevels.groups[0]?.bias}
    setupType={vm.srLevels.groups[0]?.setupType}
  />
) : null}
<SrLevelsCard srLevels={vm.srLevels} />
```

- [ ] **Step 3: Add MarketThesisCard test**

In `PositionDetailScreen.test.tsx`, add:

```typescript
  it('renders Market Thesis card when summary is present', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    render(
      <PositionDetailScreen
        position={makePosition({
          srLevels: {
            briefId: 'brief-1',
            sourceRecordedAtIso: null,
            summary: 'Bearish swing, trend continuation.',
            capturedAtUnixMs: now,
            supports: [{ price: 90 }],
            resistances: [],
          },
        })}
      />,
    );

    expect(screen.getByText('Market Thesis')).toBeTruthy();
    expect(screen.getByText('Bearish swing, trend continuation.')).toBeTruthy();

    vi.restoreAllMocks();
  });

  it('does not render Market Thesis card when summary is absent', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    render(
      <PositionDetailScreen
        position={makePosition({
          srLevels: makeSrBlock(now),
        })}
      />,
    );

    expect(screen.queryByText('Market Thesis')).toBeNull();

    vi.restoreAllMocks();
  });
```

- [ ] **Step 4: Run screen tests**

```bash
cd /home/gpoontip/clmm-v2/packages/ui && npx vitest run src/screens/PositionDetailScreen.test.tsx
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/MarketThesisCard.tsx packages/ui/src/screens/PositionDetailScreen.tsx packages/ui/src/screens/PositionDetailScreen.test.tsx
git commit -m "feat: add MarketThesisCard component with summary and metadata"
```

---

## Task 3: Redesign SrLevelsCard with Groups and Colors

**Files:**
- Modify: `packages/ui/src/components/SrLevelsCard.tsx`
- Modify: `packages/ui/src/screens/PositionDetailScreen.test.tsx`

- [ ] **Step 1: Update toneColors mapping**

Keep the mapping but resistance will always use `breach`:

```typescript
const toneColors = {
  safe: { text: colors.safe, border: 'rgba(158,236,209,0.30)' },
  warn: { text: colors.warn, border: 'rgba(244,201,122,0.30)' },
  breach: { text: colors.breachAccent, border: 'rgba(245,148,132,0.30)' },
} as const;
```

- [ ] **Step 2: Replace SrLevelsCard with grouped design**

```typescript
import { View, Text } from 'react-native';
import { colors, typography } from '../design-system/index.js';
import type { SrLevelsViewModelBlock } from '../view-models/PositionDetailViewModel.js';

const toneColors = {
  safe: { text: colors.safe, border: 'rgba(158,236,209,0.30)' },
  warn: { text: colors.warn, border: 'rgba(244,201,122,0.30)' },
  breach: { text: colors.breachAccent, border: 'rgba(245,148,132,0.30)' },
} as const;

type Props = {
  srLevels?: SrLevelsViewModelBlock | undefined;
};

export function SrLevelsCard({ srLevels }: Props): JSX.Element {
  if (!srLevels) {
    return (
      <Text style={{
        color: colors.textSecondary,
        fontSize: typography.fontSize.sm,
        marginTop: 16,
      }}>
        No current MCO levels available
      </Text>
    );
  }

  return (
    <View style={{
      marginTop: 14,
      padding: 16,
      backgroundColor: colors.surface,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
      }}>
        <Text style={{
          color: colors.textSecondary,
          fontSize: typography.fontSize.sm,
          fontWeight: typography.fontWeight.medium,
        }}>
          Support & Resistance
        </Text>
        <Text style={{
          fontSize: typography.fontSize.micro,
          color: colors.textMuted,
        }}>
          {srLevels.freshnessLabel}
        </Text>
      </View>

      {/* Groups */}
      {srLevels.groups.map((group, groupIndex) => (
        <View
          key={`sr-group-${groupIndex}`}
          testID={`sr-group-${groupIndex}`}
          style={{
            backgroundColor: colors.surfaceRecessed,
            borderRadius: 6,
            padding: 12,
            marginBottom: groupIndex < srLevels.groups.length - 1 ? 8 : 0,
          }}
        >
          {/* Levels in group */}
          {group.levels.map((level, levelIndex) => {
            const tone = toneColors[level.tone];
            return (
              <View
                key={`sr-level-${groupIndex}-${levelIndex}`}
                testID={`sr-level-${groupIndex}-${levelIndex}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: levelIndex === 0 ? 0 : 8,
                  borderTopWidth: levelIndex === 0 ? 0 : 1,
                  borderTopColor: colors.border,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{
                    height: 22,
                    paddingHorizontal: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: tone.border,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}>
                    <Text style={{
                      fontSize: typography.fontSize.micro,
                      color: tone.text,
                      fontWeight: typography.fontWeight.semibold,
                    }}>
                      {level.kind === 'resistance' ? 'Resist' : 'Support'}
                    </Text>
                  </View>
                  <Text style={{
                    fontFamily: typography.fontFamily.mono,
                    fontSize: typography.fontSize.sm,
                    fontWeight: typography.fontWeight.semibold,
                    color: colors.text,
                  }}>
                    {level.priceLabel}
                  </Text>
                </View>
              </View>
            );
          })}

          {/* Group note */}
          {group.note ? (
            <Text style={{
              fontSize: typography.fontSize.micro,
              color: colors.textMuted,
              marginTop: 8,
              lineHeight: 16,
            }}>
              {group.note}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}
```

- [ ] **Step 3: Update screen tests for new structure**

Update existing tests in `PositionDetailScreen.test.tsx`:

Replace `renders support and resistance section as a card`:
```typescript
  it('renders support and resistance section as a card when srLevels is present', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    render(
      <PositionDetailScreen
        position={makePosition({
          srLevels: makeSrBlock(now),
        })}
      />,
    );

    expect(screen.getByText('Support & Resistance')).toBeTruthy();
    expect(screen.getByText('AI · MCO · 1m ago')).toBeTruthy();
    expect(screen.getByTestId('sr-group-0')).toBeTruthy();

    vi.restoreAllMocks();
  });
```

Replace `renders level chips with correct labels`:
```typescript
  it('renders level chips with correct labels and colors', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    render(
      <PositionDetailScreen
        position={makePosition({
          srLevels: {
            briefId: 'brief-1',
            sourceRecordedAtIso: null,
            summary: null,
            capturedAtUnixMs: now,
            supports: [{ price: 90 }],
            resistances: [{ price: 180 }],
          },
        })}
      />,
    );

    expect(screen.getByText('Support')).toBeTruthy();
    expect(screen.getByText('Resist')).toBeTruthy();
    expect(screen.getByText('$90.00')).toBeTruthy();
    expect(screen.getByText('$180.00')).toBeTruthy();

    vi.restoreAllMocks();
  });
```

Replace `renders resistance-only levels`:
```typescript
  it('renders resistance-only levels correctly', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    render(
      <PositionDetailScreen
        position={makePosition({
          srLevels: {
            briefId: 'brief-1',
            sourceRecordedAtIso: null,
            summary: null,
            capturedAtUnixMs: now,
            supports: [],
            resistances: [{ price: 180 }, { price: 210 }],
          },
        })}
      />,
    );

    expect(screen.getByText('Support & Resistance')).toBeTruthy();
    expect(screen.getAllByText('Resist')).toHaveLength(2);
    expect(screen.getByText('$180.00')).toBeTruthy();
    expect(screen.getByText('$210.00')).toBeTruthy();

    vi.restoreAllMocks();
  });
```

Replace `renders support-only levels`:
```typescript
  it('renders support-only levels correctly', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    render(
      <PositionDetailScreen
        position={makePosition({
          srLevels: {
            briefId: 'brief-1',
            sourceRecordedAtIso: null,
            summary: null,
            capturedAtUnixMs: now,
            supports: [{ price: 90 }, { price: 110 }],
            resistances: [],
          },
        })}
      />,
    );

    expect(screen.getByText('Support & Resistance')).toBeTruthy();
    expect(screen.getAllByText('Support')).toHaveLength(2);
    expect(screen.getByText('$90.00')).toBeTruthy();
    expect(screen.getByText('$110.00')).toBeTruthy();

    vi.restoreAllMocks();
  });
```

Replace `renders empty levels`:
```typescript
  it('renders empty groups message when both supports and resistances are empty', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    render(
      <PositionDetailScreen
        position={makePosition({
          srLevels: {
            briefId: 'brief-1',
            sourceRecordedAtIso: null,
            summary: null,
            capturedAtUnixMs: now,
            supports: [],
            resistances: [],
          },
        })}
      />,
    );

    expect(screen.getByText('Support & Resistance')).toBeTruthy();
    expect(screen.queryByTestId('sr-group-0')).toBeNull();

    vi.restoreAllMocks();
  });
```

- [ ] **Step 4: Run screen tests**

```bash
cd /home/gpoontip/clmm-v2/packages/ui && npx vitest run src/screens/PositionDetailScreen.test.tsx
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/SrLevelsCard.tsx packages/ui/src/screens/PositionDetailScreen.test.tsx
git commit -m "feat: redesign SrLevelsCard with groups, shared notes, resistance=red"
```

---

## Task 4: Verify Cross-Package Build and Boundaries

**Files:**
- (no file changes — verification only)

- [ ] **Step 1: Run UI package build**

```bash
cd /home/gpoontip/clmm-v2 && pnpm --filter @clmm/ui build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 2: Run UI package tests**

```bash
cd /home/gpoontip/clmm-v2 && pnpm --filter @clmm/ui test
```

Expected: All tests pass.

- [ ] **Step 3: Run boundary check**

```bash
cd /home/gpoontip/clmm-v2 && pnpm boundaries
```

Expected: No boundary violations introduced.

- [ ] **Step 4: Commit if clean**

If all checks pass, the work is complete.

---

## Spec Coverage Checklist

| Design Element | Implementation Location |
|---------------|------------------------|
| Market Thesis card above S/R card | `PositionDetailScreen.tsx` + `MarketThesisCard.tsx` |
| Info icon (circle with i) | `MarketThesisCard.tsx` |
| Bias as chip in Market Thesis | `MarketThesisCard.tsx` |
| Summary text rendering | `MarketThesisCard.tsx` |
| Source/timeframe/setupType metadata | `MarketThesisCard.tsx` |
| Notes parsed by pipe separator | `PositionDetailViewModel.ts` — `parseNotes` |
| First section: source, timeframe, bias, setupType | `PositionDetailViewModel.ts` — `parseNotes` |
| Remaining sections: line breaks | `PositionDetailViewModel.ts` — `parseNotes` |
| Raw notes when no pipe | `PositionDetailViewModel.ts` — `parseNotes` |
| Levels grouped by identical metadata | `PositionDetailViewModel.ts` — `makeGroupKey` + grouping |
| Group shared note at bottom | `SrLevelsCard.tsx` |
| Group subtle background (surfaceRecessed) | `SrLevelsCard.tsx` |
| Resistance = red (breach tone) | `PositionDetailViewModel.ts` — tone override |
| Support = green (safe tone) | `PositionDetailViewModel.ts` — tone override |
| Yellow (warn) exists but unused | `SrLevelsCard.tsx` — toneColors mapping |
| No per-row notes | Removed from `SrLevelsCard.tsx` |

## Placeholder Scan

- No "TBD", "TODO", or "implement later" strings.
- All helper functions have exact implementations.
- All test code is complete and runnable.
- All file paths are exact and repo-relative.
