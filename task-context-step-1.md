# Task Context: Task 1

Title: Make alert-first status presentation exhaustive

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

- Modify: `packages/ui/src/components/PositionCardUtils.test.ts` (`getStatusChipProps` and `getBreachSide` describe blocks only)
- Modify: `packages/ui/src/components/PositionCardUtils.ts` (`StatusChipInput`, status derivation, and alert inconsistency helper only)

**Invariants to test first:**

- `returns Action needed for hasAlert + in-range even when nearEdge is true`
- `classifies only hasAlert + in-range as position_alert_in_range`
- `keeps alert + in-range directionless`
- `preserves the complete alert and non-alert status matrix`

- [ ] **Step 1: Add failing matrix and diagnostic tests.** Extend only the existing status and breach-side sections with table-driven cases. Introduce an expectation for a pure helper named `getStatusDiagnosticCode`:

```ts
it.each([
  ['below-range', true, false, 'Breach · below', 'breach'],
  ['above-range', true, false, 'Breach · above', 'breach'],
  ['in-range', true, false, 'Action needed', 'warn'],
  ['in-range', true, true, 'Action needed', 'warn'],
  ['below-range', false, true, 'Below range', 'warn'],
  ['above-range', false, true, 'Above range', 'warn'],
  ['in-range', false, true, 'Near edge', 'warn'],
  ['in-range', false, false, 'In range', 'safe'],
] as const)(
  'maps %s alert=%s nearEdge=%s to %s',
  (rangeStatusKind, hasAlert, nearEdge, label, tone) => {
    expect(getStatusChipProps({ rangeStatusKind, hasAlert, nearEdge })).toEqual({ label, tone });
  },
);

it('classifies only hasAlert + in-range as position_alert_in_range', () => {
  expect(
    getStatusDiagnosticCode({ rangeStatusKind: 'in-range', hasAlert: true, nearEdge: true }),
  ).toBe('position_alert_in_range');
  expect(
    getStatusDiagnosticCode({ rangeStatusKind: 'below-range', hasAlert: true, nearEdge: false }),
  ).toBeUndefined();
  expect(
    getStatusDiagnosticCode({ rangeStatusKind: 'in-range', hasAlert: false, nearEdge: true }),
  ).toBeUndefined();
});
```

- [ ] **Step 2: Run the focused test and confirm it fails because the in-range alert still falls through and the diagnostic helper is absent.**

Run: `pnpm --filter @clmm/ui exec vitest run src/components/PositionCardUtils.test.ts`

Expected: FAIL in the new `Action needed` cases and for missing `getStatusDiagnosticCode`.

- [ ] **Step 3: Add the minimal alert-first branch and pure diagnostic helper.** Evaluate all alert branches before ordinary range/near-edge branches and do not alter `getBreachSide`:

```ts
export type StatusDiagnosticCode = 'position_alert_in_range';

export function getStatusDiagnosticCode({
  rangeStatusKind,
  hasAlert,
}: StatusChipInput): StatusDiagnosticCode | undefined {
  return hasAlert && rangeStatusKind === 'in-range' ? 'position_alert_in_range' : undefined;
}

export function getStatusChipProps(input: StatusChipInput): StatusChipProps {
  const { rangeStatusKind, hasAlert, nearEdge } = input;
  if (hasAlert && rangeStatusKind === 'below-range') {
    return { tone: 'breach', label: 'Breach · below' };
  }
  if (hasAlert && rangeStatusKind === 'above-range') {
    return { tone: 'breach', label: 'Breach · above' };
  }
  if (hasAlert) return { tone: 'warn', label: 'Action needed' };
  if (rangeStatusKind === 'in-range') {
    return nearEdge ? { tone: 'warn', label: 'Near edge' } : { tone: 'safe', label: 'In range' };
  }
  return rangeStatusKind === 'below-range'
    ? { tone: 'warn', label: 'Below range' }
    : { tone: 'warn', label: 'Above range' };
}
```

- [ ] **Step 4: Verify the scoped helper behavior and lint only the changed files.**

Run: `pnpm --filter @clmm/ui exec vitest run src/components/PositionCardUtils.test.ts`

Expected: PASS with every matrix row and the directionless alert test green.

Run: `pnpm --filter @clmm/ui exec eslint src/components/PositionCardUtils.ts src/components/PositionCardUtils.test.ts`

Expected: PASS with no lint errors.

- [ ] **Step 5: Commit the independently usable status derivation.**

```bash
git add packages/ui/src/components/PositionCardUtils.ts packages/ui/src/components/PositionCardUtils.test.ts
git commit -m "fix(ui): preserve in-range alert visibility"
```

## Repository Targets

### Expected Files

- packages/ui/src/components/PositionCardUtils.test.ts
- packages/ui/src/components/PositionCardUtils.ts

## Validation Commands

```bash
pnpm --filter @clmm/ui exec vitest run src/components/PositionCardUtils.test.ts
pnpm --filter @clmm/ui exec eslint src/components/PositionCardUtils.ts src/components/PositionCardUtils.test.ts
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **alert precedence**: Every alert-visible combination wins over near-edge and ordinary range presentation, with in-range alerts using the neutral Action needed state. (Test: `returns Action needed for hasAlert + in-range even when nearEdge is true`)
- **inconsistent alert classification**: Only hasAlert=true with rangeStatusKind=in-range produces the stable position_alert_in_range diagnostic code. (Test: `classifies only hasAlert + in-range as position_alert_in_range`)
- **directionless in-range alert**: An in-range actionable alert never invents a below or above breach side. (Test: `keeps alert + in-range directionless`)
- **complete status matrix**: Directional alerts, non-alert out-of-range states, near-edge, and ordinary in-range states preserve their approved labels and tones. (Test: `preserves the complete alert and non-alert status matrix`)
