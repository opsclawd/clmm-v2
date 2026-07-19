# Task Context: Task 3

Title: Render RangeBar from the discriminated state

## Workspace & Scope Constraints

## WORKSPACE CONSTRAINTS

Your working directory is a dedicated git worktree with the repository's complete history. Run all commands from it. Do NOT cd to or read paths outside this directory — external-directory access is automatically rejected. git log, git diff, etc. work here directly.

.ai-orchestrator.local.json, if one exists, lives only in the main checkout and is intentionally not copied into your worktree — it is operator-machine-specific and not part of your task. Do not search for it or read it outside this directory. Reason about configuration using only .ai-orchestrator.json in your own working directory; treat it as the effective config for your task.

Working Directory: /home/gary/.openclaw/workspace/clmm-superpowers-v2/.ai-worktrees/issue-72
Repository: opsclawd/clmm-v2
Branch: ai/issue-72
Start Commit: 572b4b6664dc6ca14583b483060acbf48ef7c47e

## Task Requirements

**Files:**

- Modify: `packages/ui/src/components/RangeBar.test.tsx`
- Modify: `packages/ui/src/components/RangeBar.tsx`
- Modify: `packages/ui/src/components/PositionCard.tsx` (RangeBar caller migration only)

**Invariants to test first:**

- `renders Price unavailable with accessible unavailable text and no authoritative elements`
- `renders a genuine midpoint with a tick and without unavailable copy`
- `renders directional breach decoration only for available states`
- `renders provided numeric labels only for available states`

- [ ] **Step 1: Rewrite the existing RangeBar tests around `displayState`.** Preserve available below/above and clamping assertions, replace the former collapsed/NaN/Infinity midpoint-fallback expectations with one unavailable branch assertion, and name all authoritative elements with stable test IDs:

```tsx
render(
  <RangeBar
    displayState={{ kind: 'unavailable', reason: 'current_price_non_finite' }}
    lowerBoundLabel="USDC 100.00"
    upperBoundLabel="USDC 200.00"
    currentPriceLabel="∞"
    breachSide="above"
  />,
);
expect(screen.getByText('Price unavailable')).toBeTruthy();
expect(screen.getByLabelText('Price range unavailable')).toBeTruthy();
expect(screen.queryByTestId('range-bar-tick')).toBeNull();
expect(screen.queryByTestId('range-bar-active-band')).toBeNull();
expect(screen.queryByTestId('range-bar-breach-above')).toBeNull();
expect(screen.queryByText('∞')).toBeNull();
```

- [ ] **Step 2: Run the focused renderer test and confirm the old numeric-prop component fails the new contract.**

Run: `pnpm --filter @clmm/ui exec vitest run src/components/RangeBar.test.tsx`

Expected: FAIL because `displayState` is not accepted and unavailable output does not exist.

- [ ] **Step 3: Change `RangeBarProps` to accept `displayState: RangeBarDisplayState`, delete `pricePercent`, `clampPercent`, and price calculations, and return a fixed-height unavailable branch before rendering available coordinates.** Reuse existing colors and typography:

```tsx
export type RangeBarProps = {
  displayState: RangeBarDisplayState;
  lowerBoundLabel: string;
  upperBoundLabel: string;
  currentPriceLabel: string;
  breachSide?: 'below' | 'above';
};

if (displayState.kind === 'unavailable') {
  return (
    <View
      testID="range-bar-unavailable"
      accessibilityLabel="Price range unavailable"
      style={{ paddingTop: 8, paddingBottom: 32, paddingHorizontal: 4 }}
    >
      <View style={{ height: TRACK_HEIGHT, backgroundColor: colors.border, borderRadius: 999 }} />
      <Text style={{ marginTop: 12, height: 14, color: colors.textTertiary }}>
        Price unavailable
      </Text>
    </View>
  );
}

const { bandLeftPercent, bandRightPercent, markerPercent } = displayState;
```

Add `testID="range-bar-active-band"` to the available band and use only the union's percentages for positioning. The unavailable branch must not access or render the supplied labels or `breachSide`.

- [ ] **Step 4: Migrate the only production caller in the same signature-changing task.** In `PositionCard.tsx`, import the helper, derive the model from the three raw prices, and replace the three numeric RangeBar props with `displayState`. Do not add effects or observability yet:

```tsx
const rangeBarDisplayState = buildRangeBarDisplayState({
  currentPrice,
  lowerBoundPrice,
  upperBoundPrice,
});

<RangeBar
  displayState={rangeBarDisplayState}
  lowerBoundLabel={lowerBoundLabel}
  upperBoundLabel={upperBoundLabel}
  currentPriceLabel={currentPriceLabel}
  {...(breachSide ? { breachSide } : {})}
/>;
```

- [ ] **Step 5: Verify the renderer branches, caller regression, and lint only the changed component files.**

Run: `pnpm --filter @clmm/ui exec vitest run src/components/RangeBar.test.tsx src/components/PositionCard.test.tsx`

Expected: PASS; unavailable has no authoritative elements, and valid midpoint/directional render cases remain distinct.

Run: `pnpm --filter @clmm/ui exec eslint src/components/RangeBar.tsx src/components/RangeBar.test.tsx src/components/PositionCard.tsx`

Expected: PASS with no lint errors.

- [ ] **Step 6: Commit the fail-closed renderer and its caller migration.**

```bash
git add packages/ui/src/components/RangeBar.tsx packages/ui/src/components/RangeBar.test.tsx packages/ui/src/components/PositionCard.tsx
git commit -m "fix(ui): hide invalid range visualization"
```

## Repository Targets

### Expected Files

- packages/ui/src/components/RangeBar.test.tsx
- packages/ui/src/components/RangeBar.tsx
- packages/ui/src/components/PositionCard.tsx

## Validation Commands

```bash
pnpm --filter @clmm/ui exec vitest run src/components/RangeBar.test.tsx src/components/PositionCard.test.tsx
pnpm --filter @clmm/ui exec eslint src/components/RangeBar.tsx src/components/RangeBar.test.tsx src/components/PositionCard.tsx
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **unavailable rendering**: Unavailable state shows stable copy and accessibility text without a marker, current label, active band, or breach decoration. (Test: `renders Price unavailable with accessible unavailable text and no authoritative elements`)
- **midpoint rendering distinction**: An available midpoint renders a tick and never renders unavailable copy. (Test: `renders a genuine midpoint with a tick and without unavailable copy`)
- **available-only breach decoration**: Directional breach decoration can render only when the display model is available. (Test: `renders directional breach decoration only for available states`)
- **available-only labels**: Supplied current and bound numeric labels are rendered only for authoritative available states. (Test: `renders provided numeric labels only for available states`)
