# Position Detail S/R Section Redesign v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Support & Resistance section to match the updated `ScreenRegime` design: Market Thesis card above, grouped S/R levels with trigger/invalidation sections, parsed shared notes, and resistance=red/support=green colors.

**Architecture:** The S/R view-model parses notes into structured fields (source, timeframe, bias, setupType, trigger, invalidation) and groups levels by identical metadata. A new `MarketThesisCard` renders above `SrLevelsCard`. Each group shows levels, trigger/invalidation with prices, shared notes, and metadata footer.

**Tech Stack:** React Native, TypeScript, Vitest, existing design system tokens.

---

## Note Format (Real Example)

```
"morecryptoonline swing, bearish. trend continuation | Trigger: break below 85 signals wave three down is underway | Invalidation: break above 88.30, shifting probabilities toward orange C-wave scenario | Support parsed from: \"79–81 (blue zone)\" | Raw support: 83 (Sunday low), 79–81 (blue zone) | Raw resistance: 86.37–88.30, 89.40 (green line)"
```

**Parsing rules:**
1. Split by `|`
2. First section: `source timeframe, bias. setupType`
   - Split by last `.` → setupType after dot, rest before dot
   - Before dot split by `,` → first part is `source timeframe` (split by space), second part is `bias`
3. Other sections starting with `Trigger:` → trigger text (after colon)
4. Other sections starting with `Invalidation:` → invalidation text (after colon)
5. Remaining sections → joined with newlines as note body

---

## File Structure

| File | Responsibility |
|------|---------------|
| `packages/ui/src/view-models/PositionDetailViewModel.ts` | Parse notes with trigger/invalidation, group levels, tone override |
| `packages/ui/src/view-models/PositionDetailViewModel.test.ts` | Tests for parsing, grouping, tones |
| `packages/ui/src/components/MarketThesisCard.tsx` | NEW — renders summary with info icon |
| `packages/ui/src/components/SrLevelsCard.tsx` | Redesign — groups with headers, triggers, invalidations, metadata |
| `packages/ui/src/screens/PositionDetailScreen.tsx` | Render MarketThesisCard above SrLevelsCard |
| `packages/ui/src/screens/PositionDetailScreen.test.tsx` | Update for new card structure |

---

## Task 1: Restructure S/R View-Model with Robust Note Parsing

**Files:**
- Modify: `packages/ui/src/view-models/PositionDetailViewModel.ts`
- Modify: `packages/ui/src/view-models/PositionDetailViewModel.test.ts`

- [ ] **Step 1: Update SrLevelViewModel type**

Remove `note` from `SrLevelViewModel`:

```typescript
export type SrLevelViewModel = {
  kind: 'support' | 'resistance';
  rawPrice: number;
  priceLabel: string;
  tone: 'safe' | 'warn' | 'breach';
};
```

- [ ] **Step 2: Add group and view-model types**

```typescript
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
  summary?: string;
  groups: SrLevelGroupViewModel[];
  freshnessLabel: string;
  isStale: boolean;
};
```

- [ ] **Step 3: Add robust note parsing helper**

```typescript
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
    return { remaining: parts[0] };
  }

  // Parse metadata from first section
  const firstSection = parts[0];
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
    // No dot — treat as raw string
    return { remaining: notes.trim() };
  }

  // Parse trigger and invalidation from remaining sections
  let trigger: string | undefined;
  let invalidation: string | undefined;
  const noteParts: string[] = [];

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (part.toLowerCase().startsWith('trigger:')) {
      trigger = part.slice('trigger:'.length).trim();
    } else if (part.toLowerCase().startsWith('invalidation:')) {
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
```

- [ ] **Step 4: Update grouping and tone logic**

Replace `toSrLevelsViewModelBlock`:

```typescript
function toSrLevelsViewModelBlock(
  block: NonNullable<PositionDetailDto['srLevels']>,
  _currentPrice: number,
  _lowerBound: number,
  _upperBound: number,
  now: number,
): SrLevelsViewModelBlock {
  const { freshnessLabel, isStale } = computeFreshness(block.capturedAtUnixMs, now);

  // Group raw levels by identical metadata (rank + timeframe + notes)
  type RawItem = typeof block.supports[number] & { kind: 'support' | 'resistance' };
  const rawGroups = new Map<string, RawItem[]>();

  const addItems = (kind: 'support' | 'resistance', items: typeof block.supports) => {
    for (const item of items) {
      const key = `${item.rank ?? ''}:${item.timeframe ?? ''}:${item.notes ?? ''}`;
      const existing = rawGroups.get(key);
      const itemWithKind = { ...item, kind };
      if (existing) {
        existing.push(itemWithKind);
      } else {
        rawGroups.set(key, [itemWithKind]);
      }
    }
  };

  addItems('support', block.supports);
  addItems('resistance', block.resistances);

  const groups: SrLevelGroupViewModel[] = [];

  for (const [, items] of rawGroups) {
    const first = items[0];
    const parsed = parseNotes(first.notes);

    const levels = items.map((item) => ({
      kind: item.kind,
      rawPrice: item.price,
      priceLabel: `$${item.price.toFixed(2)}`,
      tone: item.kind === 'resistance' ? ('breach' as const) : ('safe' as const),
    }));

    levels.sort((a, b) => a.rawPrice - b.rawPrice);

    groups.push({
      levels,
      note: parsed.remaining,
      ...(parsed.source ? { source: parsed.source } : {}),
      ...(parsed.timeframe ? { timeframe: parsed.timeframe } : {}),
      ...(parsed.bias ? { bias: parsed.bias } : {}),
      ...(parsed.setupType ? { setupType: parsed.setupType } : {}),
      ...(parsed.trigger ? { trigger: parsed.trigger } : {}),
      ...(parsed.invalidation ? { invalidation: parsed.invalidation } : {}),
    });
  }

  groups.sort((a, b) => a.levels[0].rawPrice - b.levels[0].rawPrice);

  return {
    summary: block.summary ?? undefined,
    groups,
    freshnessLabel,
    isStale,
  };
}
```

- [ ] **Step 5: Remove unused helpers**

Delete: `computeLevelTone`, `computeLevelNote`, `isNearBound`, `isWithinProximity`, `BOUND_EPSILON`, `PROXIMITY_THRESHOLD`.

- [ ] **Step 6: Update tests**

```typescript
// Add test for real notes format
it('parses real notes format with trigger and invalidation', () => {
  const now = 200_000_000;
  const vm = buildPositionDetailViewModel(
    makeDto({
      srLevels: makeSrBlock({
        capturedAtUnixMs: now,
        supports: [{
          price: 90,
          notes: 'morecryptoonline swing, bearish. trend continuation | Trigger: break below 85 signals wave three down is underway | Invalidation: break above 88.30, shifting probabilities toward orange C-wave scenario | Support parsed from: "79–81 (blue zone)" | Raw support: 83 (Sunday low), 79–81 (blue zone)',
        }],
        resistances: [],
      }),
    }),
    now,
  );
  const group = vm.srLevels!.groups[0]!;
  expect(group.source).toBe('morecryptoonline');
  expect(group.timeframe).toBe('swing');
  expect(group.bias).toBe('bearish');
  expect(group.setupType).toBe('trend continuation');
  expect(group.trigger).toBe('break below 85 signals wave three down is underway');
  expect(group.invalidation).toBe('break above 88.30, shifting probabilities toward orange C-wave scenario');
  expect(group.note).toContain('Support parsed from:');
  expect(group.note).toContain('Raw support:');
});
```

- [ ] **Step 7: Run tests**

```bash
cd /home/gpoontip/clmm-v2/packages/ui && npx vitest run src/view-models/PositionDetailViewModel.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/view-models/PositionDetailViewModel.ts packages/ui/src/view-models/PositionDetailViewModel.test.ts
git commit -m "feat: parse notes with trigger/invalidation, group levels"
```

---

## Task 2: Create MarketThesisCard

**Files:**
- Create: `packages/ui/src/components/MarketThesisCard.tsx`

```typescript
import { View, Text } from 'react-native';
import { colors, typography } from '../design-system/index.js';

function InfoIcon(): JSX.Element {
  return (
    <View style={{
      width: 16, height: 16, borderRadius: 8,
      borderWidth: 1, borderColor: colors.textMuted,
      justifyContent: 'center', alignItems: 'center',
    }}>
      <Text style={{
        fontSize: 10, color: colors.textMuted,
        fontWeight: typography.fontWeight.semibold, lineHeight: 14,
      }}>i</Text>
    </View>
  );
}

type Props = { summary: string };

export function MarketThesisCard({ summary }: Props): JSX.Element {
  return (
    <View style={{
      marginTop: 14, padding: 16,
      backgroundColor: colors.surface,
      borderRadius: 8, borderWidth: 1, borderColor: colors.border,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <InfoIcon />
        <Text style={{
          color: colors.textSecondary, fontSize: typography.fontSize.micro,
          fontWeight: typography.fontWeight.semibold,
          letterSpacing: 0.08, textTransform: 'uppercase',
        }}>Market Thesis</Text>
      </View>
      <Text style={{
        color: colors.text, fontSize: typography.fontSize.sm,
        lineHeight: typography.lineHeight.normal * typography.fontSize.sm,
        fontWeight: typography.fontWeight.medium,
      }}>{summary}</Text>
    </View>
  );
}
```

Commit: `feat: add MarketThesisCard component`

---

## Task 3: Redesign SrLevelsCard

**Files:**
- Modify: `packages/ui/src/components/SrLevelsCard.tsx`

**Design per updated screens-b.jsx:**

```typescript
import { View, Text } from 'react-native';
import { colors, typography } from '../design-system/index.js';
import type { SrLevelsViewModelBlock } from '../view-models/PositionDetailViewModel.js';

const toneColors = {
  safe: { text: colors.safe, border: 'rgba(158,236,209,0.30)', bg: 'rgba(158,236,209,0.08)' },
  warn: { text: colors.warn, border: 'rgba(244,201,122,0.30)', bg: 'rgba(244,201,122,0.08)' },
  breach: { text: colors.breachAccent, border: 'rgba(245,148,132,0.30)', bg: 'rgba(245,148,132,0.08)' },
} as const;

function TriggerInvalidationSection({ label, text, labelColor }: { label: string; text: string; labelColor: string }): JSX.Element {
  return (
    <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
      <Text style={{ fontSize: typography.fontSize.micro, color: labelColor, fontWeight: typography.fontWeight.semibold }}>
        {label}
      </Text>
      <Text style={{ fontSize: typography.fontSize.micro, color: colors.textMuted, lineHeight: 16, marginTop: 2 }}>
        {text}
      </Text>
    </View>
  );
}

type Props = { srLevels?: SrLevelsViewModelBlock | undefined };

export function SrLevelsCard({ srLevels }: Props): JSX.Element {
  if (!srLevels) {
    return (
      <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: 16 }}>
        No current MCO levels available
      </Text>
    );
  }

  return (
    <View style={{
      marginTop: 14, padding: 16,
      backgroundColor: colors.surface,
      borderRadius: 8, borderWidth: 1, borderColor: colors.border,
    }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium }}>
          Support & Resistance
        </Text>
        <Text style={{ fontSize: typography.fontSize.micro, color: colors.textMuted }}>
          {srLevels.freshnessLabel}
        </Text>
      </View>

      {/* Groups */}
      {srLevels.groups.map((group, gi) => (
        <View key={`sr-group-${gi}`} testID={`sr-group-${gi}`} style={{
          backgroundColor: colors.surfaceRecessed,
          borderRadius: 10, padding: 14,
          marginTop: gi === 0 ? 0 : 10,
          borderWidth: 1, borderColor: colors.border,
        }}>
          {/* Group header: bias pill + cluster label */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            {group.bias ? (
              <View style={{
                height: 22, paddingHorizontal: 10,
                borderRadius: 999, borderWidth: 1,
                borderColor: 'rgba(244,201,122,0.30)',
                justifyContent: 'center', alignItems: 'center',
              }}>
                <Text style={{
                  fontSize: typography.fontSize.micro, color: colors.warn,
                  fontWeight: typography.fontWeight.semibold,
                }}>{group.bias}</Text>
              </View>
            ) : <View />}
            <Text style={{
              fontSize: typography.fontSize.micro, color: colors.textMuted,
              textTransform: 'uppercase', letterSpacing: 0.06,
            }}>
              {group.levels[0]?.kind === 'resistance' ? 'Resistance Cluster' : 'Support Cluster'}
            </Text>
          </View>

          {/* Levels */}
          {group.levels.map((lv, li) => {
            const tone = toneColors[lv.tone];
            return (
              <View key={`sr-level-${gi}-${li}`} testID={`sr-level-${gi}-${li}`} style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingVertical: li === 0 ? 0 : 8,
                borderTopWidth: li === 0 ? 0 : 1,
                borderTopColor: colors.border,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{
                    height: 22, paddingHorizontal: 8,
                    borderRadius: 999, borderWidth: 1,
                    borderColor: tone.border, backgroundColor: tone.bg,
                    justifyContent: 'center', alignItems: 'center',
                  }}>
                    <Text style={{
                      fontSize: typography.fontSize.micro, color: tone.text,
                      fontWeight: typography.fontWeight.semibold,
                    }}>{lv.kind === 'resistance' ? 'Resist' : 'Support'}</Text>
                  </View>
                  <Text style={{
                    fontFamily: typography.fontFamily.mono, fontSize: typography.fontSize.sm,
                    fontWeight: typography.fontWeight.semibold, color: colors.text,
                  }}>{lv.priceLabel}</Text>
                </View>
              </View>
            );
          })}

          {/* Trigger / Invalidation */}
          {group.trigger ? (
            <TriggerInvalidationSection label="Trigger" text={group.trigger} labelColor={colors.breachAccent} />
          ) : null}
          {group.invalidation ? (
            <TriggerInvalidationSection label="Invalidation" text={group.invalidation} labelColor={colors.safe} />
          ) : null}

          {/* Shared note */}
          {group.note ? (
            <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Text style={{ fontSize: typography.fontSize.micro, color: colors.textMuted, lineHeight: 16 }}>
                {group.note}
              </Text>
            </View>
          ) : null}

          {/* Metadata footer */}
          {(group.source || group.timeframe || group.setupType) ? (
            <View style={{
              flexDirection: 'row', flexWrap: 'wrap', gap: '4px 14px',
              marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border,
            }}>
              {group.source ? (
                <Text style={{ fontSize: typography.fontSize.micro, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.04 }}>
                  Source · <Text style={{ color: colors.textSecondary }}>{group.source}</Text>
                </Text>
              ) : null}
              {group.timeframe ? (
                <Text style={{ fontSize: typography.fontSize.micro, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.04 }}>
                  TF · <Text style={{ color: colors.textSecondary }}>{group.timeframe}</Text>
                </Text>
              ) : null}
              {group.setupType ? (
                <Text style={{ fontSize: typography.fontSize.micro, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.04 }}>
                  Setup · <Text style={{ color: colors.textSecondary }}>{group.setupType}</Text>
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}
```

Commit: `feat: redesign SrLevelsCard with groups, triggers, invalidations`

---

## Task 4: Update Screen and Tests

**Files:**
- Modify: `packages/ui/src/screens/PositionDetailScreen.tsx`
- Modify: `packages/ui/src/screens/PositionDetailScreen.test.tsx`

**Screen changes:**
- Import `MarketThesisCard`
- Render `<MarketThesisCard summary={vm.srLevels.summary} />` when summary present
- Keep `<SrLevelsCard srLevels={vm.srLevels} />`

**Test updates:** Update assertions to match new structure (testIDs, group rendering, etc.)

---

## Task 5: Verify

- `pnpm --filter @clmm/ui build`
- `pnpm --filter @clmm/ui test`
- `pnpm boundaries`

---

## Spec Coverage

| Design Element | Location |
|---------------|----------|
| Market Thesis card | `MarketThesisCard.tsx` |
| Info icon (circle with i) | `MarketThesisCard.tsx` |
| Group header: bias chip + cluster label | `SrLevelsCard.tsx` |
| Trigger section with red label | `SrLevelsCard.tsx` |
| Invalidation section with green label | `SrLevelsCard.tsx` |
| Shared note at bottom of group | `SrLevelsCard.tsx` |
| Metadata footer (source/TF/setup) | `SrLevelsCard.tsx` |
| Resistance = red, Support = green | `PositionDetailViewModel.ts` tone override |
| Note parsing: source/timeframe/bias/setupType | `PositionDetailViewModel.ts` |
| Note parsing: trigger/invalidation | `PositionDetailViewModel.ts` |
| Level grouping by identical metadata | `PositionDetailViewModel.ts` |
