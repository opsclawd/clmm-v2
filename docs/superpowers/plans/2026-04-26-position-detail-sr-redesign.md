# Position Detail S/R Section Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Support & Resistance section on the Position Detail screen to match the `ScreenRegime` design from `design/screens-b.jsx`, with unified level rows, tone-colored chips, contextual notes, and a card-based layout.

**Architecture:** The S/R view-model currently splits supports and resistances into separate sorted arrays with simple price labels. We will restructure it into a single unified `levels` array where each level carries its rendered `kind` (Support/Resist), `priceLabel`, contextual `note`, and semantic `tone` (safe/warn/breach). The screen will render these as a card with a header and per-row chip+price+note layout. Tone and notes are computed in the view-model builder from the position's current price, range bounds, and level metadata.

**Tech Stack:** React Native (via React DOM renderer in tests), TypeScript, Vitest, `@testing-library/react`, existing design system tokens (`colors`, `typography`).

---

## File Structure

| File | Responsibility |
|------|---------------|
| `packages/ui/src/view-models/PositionDetailViewModel.ts` | Build the S/R view-model block: compute tones, notes, freshness, and sort levels into a unified array. |
| `packages/ui/src/view-models/PositionDetailViewModel.test.ts` | Unit tests for the view-model builder, including tone and note logic. |
| `packages/ui/src/screens/PositionDetailScreen.tsx` | Render the redesigned S/R card section with chips, prices, notes, and freshness header. |
| `packages/ui/src/screens/PositionDetailScreen.test.tsx` | Screen tests asserting the new S/R card structure and content. |

---

## Task 1: Restructure S/R View-Model with Tone, Notes, and Unified Levels

**Files:**
- Modify: `packages/ui/src/view-models/PositionDetailViewModel.ts`
- Modify: `packages/ui/src/view-models/PositionDetailViewModel.test.ts`

- [ ] **Step 1: Update the `SrLevelsViewModelBlock` type**

Replace the existing type with the new unified structure:

```typescript
export type SrLevelViewModel = {
  kind: 'support' | 'resistance';
  priceLabel: string;
  note: string;
  tone: 'safe' | 'warn' | 'breach';
};

export type SrLevelsViewModelBlock = {
  levels: SrLevelViewModel[];
  freshnessLabel: string;
  isStale: boolean;
};
```

- [ ] **Step 2: Add helper functions for tone and note computation**

Add these helpers above `toSrLevelsViewModelBlock`:

```typescript
const BOUND_EPSILON = 0.01;
const PROXIMITY_THRESHOLD = 0.05; // 5%

function isNearBound(price: number, bound: number): boolean {
  return Math.abs(price - bound) <= BOUND_EPSILON;
}

function isWithinProximity(currentPrice: number, levelPrice: number): boolean {
  if (levelPrice === 0) return false;
  return Math.abs(currentPrice - levelPrice) / levelPrice <= PROXIMITY_THRESHOLD;
}

function computeLevelTone(
  kind: 'support' | 'resistance',
  levelPrice: number,
  currentPrice: number,
  lowerBound: number,
  upperBound: number,
): 'safe' | 'warn' | 'breach' {
  if (kind === 'resistance') {
    if (currentPrice > levelPrice) return 'breach';
    if (isNearBound(levelPrice, upperBound)) return 'warn';
    if (isWithinProximity(currentPrice, levelPrice)) return 'warn';
    return 'safe';
  }
  // support
  if (currentPrice < levelPrice) return 'breach';
  if (isNearBound(levelPrice, lowerBound)) return 'warn';
  if (isWithinProximity(currentPrice, levelPrice)) return 'warn';
  return 'safe';
}

function computeLevelNote(
  level: { price: number; rank?: string; notes?: string },
  lowerBound: number,
  upperBound: number,
): string {
  if (level.notes) return level.notes;
  if (isNearBound(level.price, lowerBound)) return 'Range lower · your position';
  if (isNearBound(level.price, upperBound)) return 'Range upper · your position';
  if (level.rank) return level.rank;
  return '';
}
```

- [ ] **Step 3: Rewrite `toSrLevelsViewModelBlock`**

Replace the existing `toSrLevelsViewModelBlock` function with:

```typescript
function toSrLevelsViewModelBlock(
  block: NonNullable<PositionDetailDto['srLevels']>,
  currentPrice: number,
  lowerBound: number,
  upperBound: number,
  now: number,
): SrLevelsViewModelBlock {
  const { freshnessLabel, isStale } = computeFreshness(block.capturedAtUnixMs, now);

  const supportLevels: SrLevelViewModel[] = block.supports.map((s) => ({
    kind: 'support',
    priceLabel: `$${s.price.toFixed(2)}`,
    note: computeLevelNote(s, lowerBound, upperBound),
    tone: computeLevelTone('support', s.price, currentPrice, lowerBound, upperBound),
  }));

  const resistanceLevels: SrLevelViewModel[] = block.resistances.map((r) => ({
    kind: 'resistance',
    priceLabel: `$${r.price.toFixed(2)}`,
    note: computeLevelNote(r, lowerBound, upperBound),
    tone: computeLevelTone('resistance', r.price, currentPrice, lowerBound, upperBound),
  }));

  // Sort all levels by price ascending
  const levels = [...supportLevels, ...resistanceLevels].sort(
    (a, b) => parseFloat(a.priceLabel.slice(1)) - parseFloat(b.priceLabel.slice(1)),
  );

  return { levels, freshnessLabel, isStale };
}
```

- [ ] **Step 4: Update `computeFreshness` to match design label format**

Replace the `computeFreshness` function:

```typescript
function computeFreshness(capturedAtUnixMs: number, now: number): { freshnessLabel: string; isStale: boolean } {
  const ageMs = now - capturedAtUnixMs;
  if (ageMs < 3600000) {
    const minutes = Math.max(1, Math.round(ageMs / 60000));
    return { freshnessLabel: `AI · MCO · ${minutes}m ago`, isStale: false };
  }
  const hours = Math.round(ageMs / 3600000);
  if (ageMs < 172800000) {
    return { freshnessLabel: `AI · MCO · ${hours}h ago`, isStale: false };
  }
  return { freshnessLabel: `AI · MCO · ${hours}h ago · stale`, isStale: true };
}
```

- [ ] **Step 5: Update the `buildPositionDetailViewModel` call site**

Find the line:
```typescript
const srLevelsVm = dto.srLevels
  ? toSrLevelsViewModelBlock(dto.srLevels, now)
  : undefined;
```

Replace with:
```typescript
const srLevelsVm = dto.srLevels
  ? toSrLevelsViewModelBlock(dto.srLevels, dto.currentPrice, dto.lowerBound, dto.upperBound, now)
  : undefined;
```

- [ ] **Step 6: Update view-model tests**

Replace the contents of `packages/ui/src/view-models/PositionDetailViewModel.test.ts` (from line 50 onwards) with updated tests for the new shape:

```typescript
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
    expect(vm.srLevels!.levels.length).toBeGreaterThan(0);
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

  it('computes freshness for 3 hours ago', () => {
    const now = 20_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({ srLevels: makeSrBlock({ capturedAtUnixMs: 9_200_000 }) }),
      now,
    );
    expect(vm.srLevels?.freshnessLabel).toBe('AI · MCO · 3h ago');
    expect(vm.srLevels?.isStale).toBe(false);
  });

  it('computes freshness for 49 hours ago (stale)', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({ srLevels: makeSrBlock({ capturedAtUnixMs: 23_600_000 }) }),
      now,
    );
    expect(vm.srLevels?.freshnessLabel).toBe('AI · MCO · 49h ago · stale');
    expect(vm.srLevels?.isStale).toBe(true);
  });

  it('sorts all levels ascending by price', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        currentPrice: 150,
        lowerBound: 100,
        upperBound: 200,
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [{ price: 130 }, { price: 90 }],
          resistances: [{ price: 180 }, { price: 210 }],
        }),
      }),
      now,
    );
    const prices = vm.srLevels!.levels.map((l) => l.priceLabel);
    expect(prices).toEqual(['$90.00', '$130.00', '$180.00', '$210.00']);
  });

  it('assigns support and resistance kinds correctly', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        currentPrice: 150,
        lowerBound: 100,
        upperBound: 200,
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [{ price: 110 }],
          resistances: [{ price: 190 }],
        }),
      }),
      now,
    );
    expect(vm.srLevels!.levels[0]!.kind).toBe('support');
    expect(vm.srLevels!.levels[1]!.kind).toBe('resistance');
  });

  it('uses DTO notes when available', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        currentPrice: 150,
        lowerBound: 100,
        upperBound: 200,
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [{ price: 110, notes: 'Primary · 30d pivot' }],
          resistances: [],
        }),
      }),
      now,
    );
    expect(vm.srLevels!.levels[0]!.note).toBe('Primary · 30d pivot');
  });

  it('falls back to range-bound note for lower bound match', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        currentPrice: 150,
        lowerBound: 110,
        upperBound: 200,
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [{ price: 110 }],
          resistances: [],
        }),
      }),
      now,
    );
    expect(vm.srLevels!.levels[0]!.note).toBe('Range lower · your position');
  });

  it('falls back to range-bound note for upper bound match', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        currentPrice: 150,
        lowerBound: 100,
        upperBound: 190,
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [],
          resistances: [{ price: 190 }],
        }),
      }),
      now,
    );
    expect(vm.srLevels!.levels[0]!.note).toBe('Range upper · your position');
  });

  it('falls back to rank label when no notes or bound match', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        currentPrice: 150,
        lowerBound: 100,
        upperBound: 200,
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [{ price: 110, rank: 'S1' }],
          resistances: [],
        }),
      }),
      now,
    );
    expect(vm.srLevels!.levels[0]!.note).toBe('S1');
  });

  it('marks breached resistance as breach tone when price is above it', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        currentPrice: 220,
        lowerBound: 100,
        upperBound: 200,
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [],
          resistances: [{ price: 210 }],
        }),
      }),
      now,
    );
    expect(vm.srLevels!.levels[0]!.tone).toBe('breach');
  });

  it('marks unbreached resistance near upper bound as warn tone', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        currentPrice: 150,
        lowerBound: 100,
        upperBound: 200,
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [],
          resistances: [{ price: 200 }],
        }),
      }),
      now,
    );
    expect(vm.srLevels!.levels[0]!.tone).toBe('warn');
  });

  it('marks distant safe resistance as safe tone', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        currentPrice: 150,
        lowerBound: 100,
        upperBound: 200,
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [],
          resistances: [{ price: 500 }],
        }),
      }),
      now,
    );
    expect(vm.srLevels!.levels[0]!.tone).toBe('safe');
  });
});
```

- [ ] **Step 7: Run view-model tests**

Run:
```bash
cd /home/gpoontip/clmm-v2/packages/ui && npx vitest run src/view-models/PositionDetailViewModel.test.ts
```

Expected: All tests pass.

- [ ] **Step 8: Commit view-model changes**

```bash
git add packages/ui/src/view-models/PositionDetailViewModel.ts packages/ui/src/view-models/PositionDetailViewModel.test.ts
git commit -m "feat: restructure S/R view-model with tone, notes, and unified levels"
```

---

## Task 2: Redesign S/R Card in PositionDetailScreen

**Files:**
- Modify: `packages/ui/src/screens/PositionDetailScreen.tsx`
- Modify: `packages/ui/src/screens/PositionDetailScreen.test.tsx`

- [ ] **Step 1: Add tone-to-color mapping helper in the screen file**

At the top of `PositionDetailScreen.tsx`, after the imports, add:

```typescript
const toneColors = {
  safe: { text: colors.safe, border: 'rgba(158,236,209,0.30)' },
  warn: { text: colors.warn, border: 'rgba(244,201,122,0.30)' },
  breach: { text: colors.breachAccent, border: 'rgba(245,148,132,0.30)' },
} as const;
```

- [ ] **Step 2: Replace the old S/R section rendering**

Find and remove the entire old S/R block (lines 297–320 in the current file):

```tsx
{vm.srLevels ? (
  <View style={{ marginTop: 4 }}>
    <Text style={srStyles.sectionTitle}>
      Support & Resistance (MCO)
    </Text>
    <Text style={srStyles.subsectionTitle}>Support</Text>
    {vm.srLevels.supportsSorted.map((s, i) => (
      <Text key={`s-${i}`} testID={`sr-support-${i}`} style={srStyles.levelRow}>
        {s.priceLabel}{s.rankLabel ? ` (${s.rankLabel})` : ''}
      </Text>
    ))}
    <Text style={srStyles.subsectionTitle}>Resistance</Text>
    {vm.srLevels.resistancesSorted.map((r, i) => (
      <Text key={`r-${i}`} testID={`sr-resistance-${i}`} style={srStyles.levelRow}>
        {r.priceLabel}{r.rankLabel ? ` (${r.rankLabel})` : ''}
      </Text>
    ))}
    <Text testID="sr-freshness" style={vm.srLevels.isStale ? srStyles.staleLabel : srStyles.freshnessLabel}>
      {vm.srLevels.freshnessLabel}
    </Text>
  </View>
) : (
  <Text style={srStyles.muted}>No current MCO levels available</Text>
)}
```

Replace it with the new card-based S/R section:

```tsx
{vm.srLevels ? (
  <View style={{
    marginTop: 14,
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  }}>
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
        {vm.srLevels.freshnessLabel}
      </Text>
    </View>

    {vm.srLevels.levels.map((level, i) => {
      const tone = toneColors[level.tone];
      return (
        <View
          key={`sr-level-${i}`}
          testID={`sr-level-${i}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 10,
            borderTopWidth: i === 0 ? 0 : 1,
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
          {level.note ? (
            <Text style={{
              fontSize: typography.fontSize.micro,
              color: colors.textMuted,
              textAlign: 'right',
              maxWidth: 150,
            }}>
              {level.note}
            </Text>
          ) : null}
        </View>
      );
    })}
  </View>
) : (
  <Text style={{
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginTop: 16,
  }}>
    No current MCO levels available
  </Text>
)}
```

- [ ] **Step 3: Remove the old `srStyles` object**

Since the new section uses inline styles, delete the entire `srStyles` object (lines 16–51 in the current file).

- [ ] **Step 4: Update screen tests**

Replace the S/R-related tests in `packages/ui/src/screens/PositionDetailScreen.test.tsx` with tests matching the new structure.

Replace the test block from line 76 to 116 with:

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
    expect(screen.getByText('AI · MCO · 0m ago')).toBeTruthy();
    expect(screen.getByTestId('sr-level-0')).toBeTruthy();
    expect(screen.getByTestId('sr-level-1')).toBeTruthy();

    vi.restoreAllMocks();
  });

  it('renders level chips with correct labels', () => {
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

Replace the stale test (lines 100–116) with:

```typescript
  it('renders stale freshness label in the card header when isStale is true', () => {
    const now = 200_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    render(
      <PositionDetailScreen
        position={makePosition({
          srLevels: makeSrBlock(now - 200_000_000),
        })}
      />,
    );

    expect(screen.getByText(/stale/)).toBeTruthy();

    vi.restoreAllMocks();
  });
```

Update the test at line 143 ("renders resistance section when supports is empty"):

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
    expect(screen.getByText('Resist')).toBeTruthy();
    expect(screen.getByText('$180.00')).toBeTruthy();
    expect(screen.getByText('$210.00')).toBeTruthy();

    vi.restoreAllMocks();
  });
```

- [ ] **Step 5: Run screen tests**

Run:
```bash
cd /home/gpoontip/clmm-v2/packages/ui && npx vitest run src/screens/PositionDetailScreen.test.tsx
```

Expected: All tests pass.

- [ ] **Step 6: Commit screen changes**

```bash
git add packages/ui/src/screens/PositionDetailScreen.tsx packages/ui/src/screens/PositionDetailScreen.test.tsx
git commit -m "feat: redesign S/R section with chips, tones, notes, and card layout"
```

---

## Task 3: Verify Cross-Package Build and Boundaries

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

If all checks pass, the work is complete. No additional commit needed unless fixes were required.

---

## Spec Coverage Checklist

| Design Element | Implementation Location |
|---------------|------------------------|
| Card container with border/background | `PositionDetailScreen.tsx` — View wrapper with `surface`, `border` |
| Header row: "Support & Resistance" left, freshness right | `PositionDetailScreen.tsx` — flex row with label and freshness text |
| Per-row chip: "Resist" / "Support" with tone-colored border/text | `PositionDetailScreen.tsx` — inner View with dynamic border/text color |
| Per-row price in monospace, semibold | `PositionDetailScreen.tsx` — Text with `fontFamily.mono` |
| Per-row contextual note on the right | `PositionDetailScreen.tsx` — conditional right-side Text |
| Unified ascending sort (supports + resistances mixed) | `PositionDetailViewModel.ts` — combined sort in `toSrLevelsViewModelBlock` |
| Tone computation (safe/warn/breach) from price proximity and range bounds | `PositionDetailViewModel.ts` — `computeLevelTone` helper |
| Note computation: DTO notes → bound match → rank fallback | `PositionDetailViewModel.ts` — `computeLevelNote` helper |
| Freshness format: "AI · MCO · Xh ago" | `PositionDetailViewModel.ts` — updated `computeFreshness` |
| No old "Support" / "Resistance" subsection titles | Removed from screen |

## Placeholder Scan

- No "TBD", "TODO", or "implement later" strings.
- All helper functions have exact implementations.
- All test code is complete and runnable.
- All file paths are exact and repo-relative.
