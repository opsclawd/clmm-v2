# Task Context: Task 2

Title: Add accessible per-feature derivation expansion and local warnings
## Workspace & Scope Constraints

## WORKSPACE CONSTRAINTS

Your working directory is a dedicated git worktree with the repository's complete history. Run all commands from it. Do NOT cd to or read paths outside this directory — external-directory access is automatically rejected. git log, git diff, etc. work here directly.

.ai-orchestrator.local.json, if one exists, lives only in the main checkout and is intentionally not copied into your worktree — it is operator-machine-specific and not part of your task. Do not search for it or read it outside this directory. Reason about configuration using only .ai-orchestrator.json in your own working directory; treat it as the effective config for your task.

Working Directory: /home/gary/.openclaw/workspace/clmm-superpowers-v2/.ai-worktrees/issue-150
Repository: opsclawd/clmm-v2
Branch: ai/issue-150
Start Commit: 9b07ffc44e500e4ab99f1c7f70fd0cd317fafc72

## Task Requirements

**Files:**

- Modify: `packages/ui/src/components/EvidenceFamilyCard.tsx`
- Modify: `packages/ui/src/components/EvidenceFamilyCard.test.tsx`
- Reference only: `packages/ui/src/view-models/EvidenceViewModel.ts`
- Reference only: `packages/ui/src/components/RawTelemetryAccordion.tsx`

- [ ] **Step 1: Write the four failing component tests named in the invariant table**

Extend the card fixtures with two derivation-capable rows, one family warning, and one row warning. Query toggles by button role and their exact labels, then assert `aria-expanded` transitions. The expected control contract is:

```tsx
accessibilityRole="button"
accessibilityLabel={`${isExpanded ? 'Collapse' : 'Expand'} derivation for ${row.label}`}
accessibilityState={{ expanded: isExpanded }}
aria-expanded={isExpanded}
testID={`evidence-derivation-toggle-${row.label}`}
```

Use a locator beginning with `https://` in the opaque-locator test to prove it is still plain text: assert the exact text exists and `screen.queryByRole('link')` is null. Assert family and feature warnings render before any expansion action. Add a test confirming that updating the `card` prop (simulating a bundle refresh) resets expanded rows back to initial collapsed state.

- [ ] **Step 2: Run only the card tests and confirm transition/content assertions fail**

Run:

```bash
pnpm --filter @clmm/ui exec vitest run src/components/EvidenceFamilyCard.test.tsx
```

Expected: new tests fail because rows are static and neither derivations nor localized warnings are rendered.

- [ ] **Step 3: Add independent local expansion state**

Import `useState` and `useEffect`, and track a `Record<string, boolean>` keyed by row label. Reset `expandedRows` whenever the `card` prop changes so evidence updates restore the initial collapsed state. Only rows with `row.derivation` are controls; contextual placeholder rows remain non-interactive. Toggle one key without replacing other keys:

```ts
const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

useEffect(() => {
  setExpandedRows({});
}, [card]);

function toggleRow(rowId: string): void {
  setExpandedRows((current) => ({ ...current, [rowId]: !current[rowId] }));
}
```

Use `TouchableOpacity` for derivation-capable rows and retain a plain `View` for other rows. Preserve the current label/value layout and 44-point minimum touch height.

- [ ] **Step 4: Render the explanation, freshness, and opaque inputs when expanded**

Render a deterministic narrative that uses only view-model strings:

```tsx
<Text>
  {`${row.label} = ${row.value}, from ${derivation.inputCount} ${derivation.inputCount === 1 ? 'observation' : 'observations'} spanning ${derivation.timeSpanLabel}, computed by ${derivation.calculatorLabel}, observed ${derivation.observedAtLabel}, fresh until ${derivation.freshUntilLabel}.`}
</Text>
<Text testID={`evidence-freshness-status-${row.label}`}>
  {`Status: ${derivation.isStale ? 'Stale' : 'Fresh'}`}
</Text>
```

Always render an explicit status text element (`Status: Fresh` when `derivation.isStale === false`, or `Status: Stale` when `derivation.isStale === true`) so stale status is clearly identified for every feature. Under an `Inputs` label, render each locator and its observation label as ordinary wrapping `Text` in a non-interactive `View`; use `fontFamily: 'monospace'`, `flexShrink: 1`, and no `Linking`, anchor, `onPress`, or accessibility link role. Use locator plus array index as the React key so repeated locators do not collide.

- [ ] **Step 5: Render warnings at their associated scope**

Render `card.warnings ?? []` below the card header in warning styling. Render `row.warnings ?? []` directly below that row's summary regardless of collapsed/expanded state, so missing-value explanations do not require opening derivation details. Do not reproduce those messages in any global collection inside the component.

- [ ] **Step 6: Run focused tests and lint the changed files**

Run:

```bash
pnpm --filter @clmm/ui exec vitest run src/components/EvidenceFamilyCard.test.tsx
pnpm --filter @clmm/ui exec eslint src/components/EvidenceFamilyCard.tsx src/components/EvidenceFamilyCard.test.tsx
```

Expected: the component tests pass and the changed files lint cleanly. The implement loop's automatic `pnpm -r typecheck` gate must also pass before this task is committed.

- [ ] **Step 7: Commit the interactive card slice**

```bash
git add packages/ui/src/components/EvidenceFamilyCard.tsx packages/ui/src/components/EvidenceFamilyCard.test.tsx
git commit -m "feat(ui): expand evidence feature derivations"
```

## Repository Targets

### Expected Files
- packages/ui/src/components/EvidenceFamilyCard.tsx
- packages/ui/src/components/EvidenceFamilyCard.test.tsx

### Reference Files
- packages/ui/src/view-models/EvidenceViewModel.ts
- packages/ui/src/components/RawTelemetryAccordion.tsx

## Validation Commands

```bash
["pnpm","--filter","@clmm/ui","exec","vitest","run","src/components/EvidenceFamilyCard.test.tsx"]
["pnpm","--filter","@clmm/ui","exec","eslint","src/components/EvidenceFamilyCard.tsx","src/components/EvidenceFamilyCard.test.tsx"]
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **initial collapsed state**: A derivation-capable row initially exposes a collapsed button state and mounts no detail content. (Test: `keeps feature derivation collapsed until its row is pressed`)
- **independent toggle transitions**: Pressing a row toggles only that row between collapsed and expanded without changing any other row. (Test: `expands and collapses derivation rows independently`)
- **opaque locator presentation**: Every locator is rendered exactly as wrapping text with no link role or navigation action regardless of string shape. (Test: `renders input locators as wrapping text rather than links`)
- **local warning visibility**: Family and row warnings remain visible at their associated scope without requiring derivation expansion. (Test: `renders family and feature warnings beside affected evidence`)

