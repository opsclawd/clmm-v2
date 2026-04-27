# S/R Levels BFF Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract S/R market context out of the position-detail endpoint into a dedicated, pool-scoped BFF endpoint, render it once on the Positions page above the list, and remove all S/R surfaces from the position detail page.

**Architecture:** Two-commit sequence. Commit 1 is backend-additive: new `SrLevelsController` and a behavior-only cleanup of `PositionController` that stops fetching/attaching S/R while leaving the optional `srLevels` field on `PositionDetailDto` intact. Commit 2 atomically lifts S/R view-model logic to a shared module, removes the field from the application DTO, splits the API client, adds the `MarketContextPanel`, integrates it on the Positions page, and removes both S/R cards from the position detail screen. Both commits are independently typecheck/lint/test green.

**Tech Stack:** TypeScript, NestJS (BFF, hexagonal), Expo Router + React Native (apps/app), TanStack Query, Vitest. Source of truth: [`docs/superpowers/specs/2026-04-27-sr-levels-bff-extraction-design.md`](../specs/2026-04-27-sr-levels-bff-extraction-design.md).

---

## Pre-Flight

- [ ] **Step 1: Bootstrap the worktree if needed**

Per `AGENTS.md`, agents starting in a fresh worktree may need to install / build before testing.

```bash
[ -d node_modules ] || pnpm install --frozen-lockfile
[ -d packages/application/dist ] || pnpm build
```

Expected: dependencies and build outputs present. Skip if the workspace is already bootstrapped.

- [ ] **Step 2: Confirm baseline is green**

Run: `pnpm typecheck && pnpm lint && pnpm boundaries && pnpm test`
Expected: all pass. If anything fails before any change, stop and report — the plan assumes a green baseline.

---

## Phase 1 — Backend Additive (Commit 1)

End state: new `GET /sr-levels/pools/:poolId/current` endpoint live; `PositionController` no longer touches the S/R port; `srLevels?` field on `PositionDetailDto` still exists at the type level but is never populated at runtime.

### Task 1: Update `PositionController` tests to drop S/R assertions

**Files:**
- Modify: `packages/adapters/src/inbound/http/PositionController.test.ts`

The existing test file has six S/R-specific cases (visible at lines 250, 271, 290, 307, 352, 374) and constructs `PositionController` with `nullSrLevelsPort` and `emptyAllowlist` arguments. Both of those constructor arguments will be removed in Task 2. Update tests first so Task 2's compile error becomes a pure removal.

- [ ] **Step 1: Read the existing test file**

Read: `packages/adapters/src/inbound/http/PositionController.test.ts`
Identify: imports of `CurrentSrLevelsPort`, the `nullSrLevelsPort` and `emptyAllowlist` test doubles, every `it(...)` case that references `srLevels`, and the constructor call sites passing `nullSrLevelsPort, emptyAllowlist`.

- [ ] **Step 2: Remove the S/R import, the test doubles, and the S/R-specific cases**

Delete:
- The import `import type { CurrentSrLevelsPort } from '../../outbound/regime-engine/types.js';`
- The `nullSrLevelsPort` constant declaration block (`const nullSrLevelsPort: CurrentSrLevelsPort = { fetchCurrent: vi.fn().mockResolvedValue(null) };`)
- The `emptyAllowlist` constant declaration (`const emptyAllowlist = new Map<string, { symbol: string; source: string }>();`)
- All six `it(...)` cases that reference `srLevels` (the ones at the lines listed above; remove only the cases whose body mentions `srLevels` or `srLevelsAllowlist` or `srLevelsPort`).
- Any helper inside this file that exists solely to construct an SR fixture (e.g., a `makeSrBlock` helper, if present).

- [ ] **Step 3: Update every `new PositionController(...)` call site in this file**

Each surviving call currently looks like:

```ts
const controller = new PositionController(
  positionReadPort,
  triggerRepo,
  nullSrLevelsPort,
  emptyAllowlist,
  fakePricePort,
);
```

Change to:

```ts
const controller = new PositionController(
  positionReadPort,
  triggerRepo,
  fakePricePort,
);
```

This will fail the typechecker until Task 2 lands; that is intentional and the next task fixes it.

- [ ] **Step 4: Add a regression assertion that S/R is never present in the payload**

Add a single new case at the end of the `describe('PositionController', ...)` block:

```ts
it('never includes srLevels on the position detail payload (S/R lives behind a dedicated endpoint)', async () => {
  const positionReadPort = new FakeSupportedPositionReadPort(
    [FIXTURE_POSITION_IN_RANGE],
    fixturePoolDataMap,
    FIXTURE_POSITION_DETAIL,
  );
  const triggerRepo = new FakeTriggerRepository();
  const controller = new PositionController(positionReadPort, triggerRepo, fakePricePort);

  const result = await controller.getPosition(
    FIXTURE_POSITION_IN_RANGE.walletId,
    FIXTURE_POSITION_IN_RANGE.positionId,
  );

  expect((result.position as Record<string, unknown>)['srLevels']).toBeUndefined();
});
```

- [ ] **Step 5: Run the test file to confirm the expected failure mode**

Run: `pnpm --filter @clmm/adapters vitest run src/inbound/http/PositionController.test.ts`
Expected: TypeScript / build error from Vitest because `PositionController`'s constructor still requires five arguments. Do not commit yet — the next task fixes the constructor.

### Task 2: Strip S/R from `PositionController`

**Files:**
- Modify: `packages/adapters/src/inbound/http/PositionController.ts`

- [ ] **Step 1: Remove S/R imports**

Delete these lines from the file's imports:
- `import type { SrLevelsBlock as DtoSrLevelsBlock } from '@clmm/application';`
- `import type { CurrentSrLevelsPort } from '../../outbound/regime-engine/types.js';`
- The `CURRENT_SR_LEVELS_PORT` and `SR_LEVELS_POOL_ALLOWLIST` names from the `import { ... } from './tokens.js';` statement.

After: only `SUPPORTED_POSITION_READ_PORT, TRIGGER_REPOSITORY, PRICE_PORT` remain in that import.

- [ ] **Step 2: Remove the two injected dependencies from the constructor**

Replace the `constructor(...)` block:

```ts
constructor(
  @Inject(SUPPORTED_POSITION_READ_PORT)
  private readonly positionReadPort: SupportedPositionReadPort,
  @Inject(TRIGGER_REPOSITORY)
  private readonly triggerRepo: TriggerRepository,
  @Inject(PRICE_PORT)
  private readonly pricePort: PricePort,
) {}
```

- [ ] **Step 3: Collapse `getPosition` to a single trigger-fetch path**

Replace the entire body of `getPosition(...)` (everything between the `@Get(':walletId/:positionId')` decorator's method line and the matching closing brace) with this implementation:

```ts
@Get(':walletId/:positionId')
async getPosition(
  @Param('walletId') walletId: string,
  @Param('positionId') positionId: string,
) {
  const wallet = makeWalletId(walletId);
  const result = await getPositionDetail({
    walletId: wallet,
    positionId: makePositionId(positionId),
    positionReadPort: this.positionReadPort,
    pricePort: this.pricePort,
  });

  if (result.kind === 'not-found') {
    throw new NotFoundException(`Position not found: ${positionId}`);
  }

  if (result.position.walletId !== wallet) {
    throw new NotFoundException(`Position not found: ${positionId}`);
  }

  let trigger: import('@clmm/domain').ExitTrigger | null = null;
  let triggerError: string | undefined;

  try {
    const actionableTriggers = await this.triggerRepo.listActionableTriggers(wallet);
    trigger =
      actionableTriggers.find((candidate) => candidate.positionId === result.position.positionId) ?? null;
  } catch (error: unknown) {
    if (!isTransientPositionReadFailure(error)) {
      throw error;
    }
    triggerError = 'Unable to fetch trigger data. Position data temporarily unavailable.';
  }

  return {
    position: toPositionDetailDto(result.detailDto, trigger),
    ...(triggerError ? { error: triggerError } : {}),
  };
}
```

Notes:
- The `Promise.all([listActionableTriggers, srLevelsPort.fetchCurrent])` branch is gone.
- The `srLevels` field in the returned payload is gone.
- `toPositionDetailDto` no longer needs to be merged with a conditional `srLevels` object.

- [ ] **Step 4: Verify `listPositions` is unchanged**

Confirm by reading: the second `@Get(':walletId')` handler (`listPositions`) must be byte-identical to before. It never touched S/R.

- [ ] **Step 5: Run controller tests**

Run: `pnpm --filter @clmm/adapters vitest run src/inbound/http/PositionController.test.ts`
Expected: PASS. The S/R cases are gone, the regression assertion confirms the field never appears.

- [ ] **Step 6: Run typecheck for the adapters package**

Run: `pnpm --filter @clmm/adapters typecheck`
Expected: PASS.

### Task 3: Write `SrLevelsController` tests (TDD red phase)

**Files:**
- Create: `packages/adapters/src/inbound/http/SrLevelsController.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `packages/adapters/src/inbound/http/SrLevelsController.test.ts` with this content:

```ts
import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { SrLevelsController } from './SrLevelsController.js';
import type { CurrentSrLevelsPort, SrLevelsBlock } from '../../outbound/regime-engine/types.js';

const SOL_USDC_POOL_ID = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';
const UNSUPPORTED_POOL_ID = 'Pool111111111111111111111111111111111111111';

function fixtureBlock(): SrLevelsBlock {
  return {
    briefId: 'brief-1',
    sourceRecordedAtIso: '2026-04-27T00:00:00Z',
    summary: 'Bullish continuation.',
    capturedAtUnixMs: 1_745_712_000_000,
    supports: [{ price: 132.4 }, { price: 128 }],
    resistances: [{ price: 148.2 }, { price: 152 }],
  };
}

function makeAllowlist(entries: Array<[string, { symbol: string; source: string }]> = [
  [SOL_USDC_POOL_ID, { symbol: 'SOL/USDC', source: 'mco' }],
]): Map<string, { symbol: string; source: string }> {
  return new Map(entries);
}

describe('SrLevelsController', () => {
  it('returns srLevels for an allowlisted pool when the port resolves a block', async () => {
    const block = fixtureBlock();
    const port: CurrentSrLevelsPort = { fetchCurrent: vi.fn().mockResolvedValue(block) };
    const controller = new SrLevelsController(port, makeAllowlist());

    const result = await controller.getCurrent(SOL_USDC_POOL_ID);

    expect(result).toEqual({ srLevels: block });
    expect(port.fetchCurrent).toHaveBeenCalledWith('SOL/USDC', 'mco');
  });

  it('returns srLevels: null for an allowlisted pool when the port resolves null', async () => {
    const port: CurrentSrLevelsPort = { fetchCurrent: vi.fn().mockResolvedValue(null) };
    const controller = new SrLevelsController(port, makeAllowlist());

    const result = await controller.getCurrent(SOL_USDC_POOL_ID);

    expect(result).toEqual({ srLevels: null });
  });

  it('throws NotFoundException for a pool that is not in the allowlist', async () => {
    const port: CurrentSrLevelsPort = { fetchCurrent: vi.fn() };
    const controller = new SrLevelsController(port, makeAllowlist());

    await expect(controller.getCurrent(UNSUPPORTED_POOL_ID)).rejects.toBeInstanceOf(NotFoundException);
    expect(port.fetchCurrent).not.toHaveBeenCalled();
  });

  it('resolves the (symbol, source) pair from the allowlist entry', async () => {
    const port: CurrentSrLevelsPort = { fetchCurrent: vi.fn().mockResolvedValue(null) };
    const customAllowlist = makeAllowlist([
      ['CustomPool11111111111111111111111111111111', { symbol: 'BTC/USDC', source: 'custom' }],
    ]);
    const controller = new SrLevelsController(port, customAllowlist);

    await controller.getCurrent('CustomPool11111111111111111111111111111111');

    expect(port.fetchCurrent).toHaveBeenCalledWith('BTC/USDC', 'custom');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails for the right reason**

Run: `pnpm --filter @clmm/adapters vitest run src/inbound/http/SrLevelsController.test.ts`
Expected: FAIL with module-not-found / cannot-find `./SrLevelsController.js`.

### Task 4: Implement `SrLevelsController`

**Files:**
- Create: `packages/adapters/src/inbound/http/SrLevelsController.ts`

- [ ] **Step 1: Write the controller**

Create `packages/adapters/src/inbound/http/SrLevelsController.ts`:

```ts
import { Controller, Get, Inject, NotFoundException, Param } from '@nestjs/common';
import type { CurrentSrLevelsPort } from '../../outbound/regime-engine/types.js';
import { CURRENT_SR_LEVELS_PORT, SR_LEVELS_POOL_ALLOWLIST } from './tokens.js';

@Controller('sr-levels')
export class SrLevelsController {
  constructor(
    @Inject(CURRENT_SR_LEVELS_PORT)
    private readonly srLevelsPort: CurrentSrLevelsPort,
    @Inject(SR_LEVELS_POOL_ALLOWLIST)
    private readonly srLevelsAllowlist: Map<string, { symbol: string; source: string }>,
  ) {}

  @Get('pools/:poolId/current')
  async getCurrent(@Param('poolId') poolId: string) {
    const entry = this.srLevelsAllowlist.get(poolId);
    if (!entry) {
      throw new NotFoundException(`Pool not supported: ${poolId}`);
    }

    const srLevels = await this.srLevelsPort.fetchCurrent(entry.symbol, entry.source);
    return { srLevels };
  }
}
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `pnpm --filter @clmm/adapters vitest run src/inbound/http/SrLevelsController.test.ts`
Expected: PASS — all four cases.

### Task 5: Register `SrLevelsController` in `AppModule`

**Files:**
- Modify: `packages/adapters/src/inbound/http/AppModule.ts`

- [ ] **Step 1: Add the import**

Add after the existing `import { PositionController } ...` line:

```ts
import { SrLevelsController } from './SrLevelsController.js';
```

- [ ] **Step 2: Register in the controllers array**

Replace:

```ts
controllers: [HealthController, PositionController, AlertController, PreviewController, ExecutionController, WalletController],
```

With:

```ts
controllers: [HealthController, PositionController, SrLevelsController, AlertController, PreviewController, ExecutionController, WalletController],
```

The provider list is unchanged — `CURRENT_SR_LEVELS_PORT` and `SR_LEVELS_POOL_ALLOWLIST` are already registered for the (now-removed) `PositionController` consumer; they continue to serve `SrLevelsController`.

- [ ] **Step 3: Typecheck the adapters package**

Run: `pnpm --filter @clmm/adapters typecheck`
Expected: PASS.

### Task 6: Phase 1 verification + commit

- [ ] **Step 1: Run the full repo checks**

Run, in this order, stopping at the first failure:

```bash
pnpm typecheck
pnpm lint
pnpm boundaries
pnpm test
pnpm build
```

Expected: all pass.

- [ ] **Step 2: Sanity-grep that `srLevels` no longer appears in `PositionController.ts`**

Run: `grep -n "srLevels" packages/adapters/src/inbound/http/PositionController.ts`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add \
  packages/adapters/src/inbound/http/SrLevelsController.ts \
  packages/adapters/src/inbound/http/SrLevelsController.test.ts \
  packages/adapters/src/inbound/http/PositionController.ts \
  packages/adapters/src/inbound/http/PositionController.test.ts \
  packages/adapters/src/inbound/http/AppModule.ts
git commit -m "$(cat <<'EOF'
feat(adapters): add /sr-levels/pools/:poolId/current and stop attaching S/R to position detail

PositionController no longer fetches CURRENT_SR_LEVELS_PORT or branches
on the SR_LEVELS_POOL_ALLOWLIST; the constructor drops both injected
dependencies and the parallel S/R/trigger fetch collapses to a plain
trigger lookup. New SrLevelsController owns the pool-scoped endpoint.
The optional `srLevels?` field on PositionDetailDto stays in place; the
runtime payload simply never sets it. Frontend cleanup follows.
EOF
)"
```

End of Phase 1.

---

## Phase 2 — Frontend Split + DTO Field Removal (Commit 2)

End state: `MarketContextPanel` lives above the positions list on the Positions page; position detail has no S/R surfaces; `srLevels?` field is removed from `PositionDetailDto`; view-model logic lives in a dedicated module reused by the panel.

The intra-task ordering matters: lift the view-model first, retire it from the detail surface, retire it from the API client, then remove the DTO field, then add the new fetcher and panel, then wire the route. Every checkpoint is typecheck-green.

### Task 7: Create `SrLevelsViewModel.ts` test (TDD red phase)

**Files:**
- Create: `packages/ui/src/view-models/SrLevelsViewModel.test.ts`

This new test file exercises a `buildSrLevelsViewModelBlock(block, now)` builder that takes the raw `SrLevelsBlock` and produces the `SrLevelsViewModelBlock` shape `SrLevelsCard` already consumes. The test cases are derived from the surviving S/R cases inside the existing `PositionDetailViewModel.test.ts`.

- [ ] **Step 1: Write the failing test file**

Create `packages/ui/src/view-models/SrLevelsViewModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { SrLevelsBlock } from '@clmm/application/public';
import { buildSrLevelsViewModelBlock } from './SrLevelsViewModel.js';

function makeBlock(overrides: Partial<SrLevelsBlock> = {}): SrLevelsBlock {
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

describe('buildSrLevelsViewModelBlock', () => {
  it('produces groups when given a populated block', () => {
    const vm = buildSrLevelsViewModelBlock(
      makeBlock({ capturedAtUnixMs: 1_700_000 }),
      1_700_000 + 5 * 60_000,
    );

    expect(vm.groups.length).toBeGreaterThan(0);
  });

  it('renders fresh freshness label when the block is recent', () => {
    const vm = buildSrLevelsViewModelBlock(
      makeBlock({ capturedAtUnixMs: 1_700_000 }),
      1_700_000 + 5 * 60_000,
    );

    expect(vm.freshnessLabel).toBe('AI · MCO · 5m ago');
    expect(vm.isStale).toBe(false);
  });

  it('marks the block stale when older than 48 hours', () => {
    const captured = 1_700_000_000_000;
    const now = captured + 49 * 3_600_000;
    const vm = buildSrLevelsViewModelBlock(makeBlock({ capturedAtUnixMs: captured }), now);

    expect(vm.isStale).toBe(true);
    expect(vm.freshnessLabel).toContain('stale');
  });

  it('parses metadata from the `notes` field of the first level in a group', () => {
    const vm = buildSrLevelsViewModelBlock(
      makeBlock({
        supports: [{ price: 90, notes: 'mco 1h, bullish.swing | trigger: above 95' }],
        resistances: [],
      }),
      1_700_000_000,
    );

    const group = vm.groups[0]!;
    expect(group.source).toBe('mco');
    expect(group.timeframe).toBe('1h');
    expect(group.bias).toBe('bullish');
    expect(group.setupType).toBe('swing');
    expect(group.trigger).toBe('above 95');
  });

  it('groups levels with identical metadata together', () => {
    const sharedNotes = 'mco 1h, neutral.range';
    const vm = buildSrLevelsViewModelBlock(
      makeBlock({
        supports: [
          { price: 90, notes: sharedNotes },
          { price: 88, notes: sharedNotes },
        ],
        resistances: [],
      }),
      1_700_000_000,
    );

    expect(vm.groups.length).toBe(1);
    expect(vm.groups[0]!.levels.length).toBe(2);
  });

  it('separates levels with different metadata into different groups', () => {
    const vm = buildSrLevelsViewModelBlock(
      makeBlock({
        supports: [{ price: 90, notes: 'mco 1h, neutral.range' }],
        resistances: [{ price: 150, notes: 'mco 4h, bearish.trend' }],
      }),
      1_700_000_000,
    );

    expect(vm.groups.length).toBe(2);
  });

  it('assigns breach tone to resistance levels and safe tone to support levels', () => {
    const vmResistance = buildSrLevelsViewModelBlock(
      makeBlock({ supports: [], resistances: [{ price: 150 }] }),
      1_700_000_000,
    );
    expect(vmResistance.groups[0]!.levels[0]!.tone).toBe('breach');

    const vmSupport = buildSrLevelsViewModelBlock(
      makeBlock({ supports: [{ price: 90 }], resistances: [] }),
      1_700_000_000,
    );
    expect(vmSupport.groups[0]!.levels[0]!.tone).toBe('safe');
  });

  it('surfaces the block summary when present', () => {
    const vm = buildSrLevelsViewModelBlock(
      makeBlock({ summary: 'Bearish swing, trend continuation.' }),
      1_700_000_000,
    );
    expect(vm.summary).toBe('Bearish swing, trend continuation.');
  });

  it('renders price labels with two decimal places', () => {
    const vm = buildSrLevelsViewModelBlock(
      makeBlock({ supports: [{ price: 80 }], resistances: [{ price: 130 }] }),
      1_700_000_000,
    );

    const allLabels = vm.groups.flatMap((g) => g.levels.map((l) => l.priceLabel));
    expect(allLabels).toContain('$130.00');
    expect(allLabels).toContain('$80.00');
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @clmm/ui vitest run src/view-models/SrLevelsViewModel.test.ts`
Expected: FAIL with cannot-find `./SrLevelsViewModel.js`.

### Task 8: Lift the S/R view-model implementation

**Files:**
- Create: `packages/ui/src/view-models/SrLevelsViewModel.ts`
- (No edits to `PositionDetailViewModel.ts` yet — that's Task 9.)

- [ ] **Step 1: Write the new module**

Create `packages/ui/src/view-models/SrLevelsViewModel.ts`. Lift the helpers from `PositionDetailViewModel.ts` verbatim (no behavior changes); the only changes are: (a) the input type widens from `NonNullable<PositionDetailDto['srLevels']>` to `SrLevelsBlock`, and (b) the exported builder is now public:

```ts
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
  if (parts.length === 1) {
    return { remaining: parts[0] ?? '' };
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
```

- [ ] **Step 2: Run the new tests to verify they pass**

Run: `pnpm --filter @clmm/ui vitest run src/view-models/SrLevelsViewModel.test.ts`
Expected: PASS — all nine cases.

- [ ] **Step 3: Confirm the existing `PositionDetailViewModel` tests still pass**

Run: `pnpm --filter @clmm/ui vitest run src/view-models/PositionDetailViewModel.test.ts`
Expected: PASS. The old logic is still in place inside `PositionDetailViewModel.ts`; both copies coexist for now.

### Task 9: Strip S/R from `PositionDetailScreen`

**Files:**
- Modify: `packages/ui/src/screens/PositionDetailScreen.tsx`
- Modify: `packages/ui/src/screens/PositionDetailScreen.test.tsx`

This task runs **before** the `PositionDetailViewModel` cleanup because the screen reads `vm.srLevels?.summary` and `vm.srLevels`. If we removed the field from the view-model first, the screen would fail typecheck until this task lands.

- [ ] **Step 1: Remove S/R imports and renders from the screen**

Make the following edits to `packages/ui/src/screens/PositionDetailScreen.tsx`:

- Delete the imports: `import { SrLevelsCard } from '../components/SrLevelsCard.js';` and `import { MarketThesisCard } from '../components/MarketThesisCard.js';`.
- Delete the trailing JSX block at the bottom of the outer `<View>` (the two card renders that depend on `vm.srLevels`):
  ```tsx
  {vm.srLevels?.summary ? (
    <MarketThesisCard summary={vm.srLevels.summary} />
  ) : null}
  <SrLevelsCard srLevels={vm.srLevels} />
  ```
  The screen now ends after the alert/no-alerts pill `<View>`.

- [ ] **Step 2: Remove S/R cases from `PositionDetailScreen.test.tsx`**

Open `packages/ui/src/screens/PositionDetailScreen.test.tsx` and:

- Delete the `makeSrBlock` helper at the top of the file.
- Delete every `it(...)` case whose body references `srLevels`, `MarketThesisCard`, `SrLevelsCard`, or "Support & Resistance" (around lines 83, 108, 118, 125, 144, 171, 196, 213, 240, 267 — verify by grep before deleting).
- If any surviving case happens to pass `srLevels: ...` inside its DTO override, remove that key.

Add a single regression case at the bottom of the existing top-level `describe(...)` block. The file already exports a `makePosition(overrides)` helper at the top — reuse it:

```tsx
it('renders no S/R surfaces (market context lives on the Positions page)', () => {
  render(<PositionDetailScreen now={1_000_000_000} position={makePosition()} />);

  expect(screen.queryByText('Market Thesis')).toBeNull();
  expect(screen.queryByText('Support & Resistance')).toBeNull();
  expect(screen.queryByText('No current MCO levels available')).toBeNull();
});
```

After deleting `makeSrBlock`, the `makePosition` helper will no longer have any caller passing `srLevels` in its overrides — that's expected.

- [ ] **Step 3: Run the screen tests**

Run: `pnpm --filter @clmm/ui vitest run src/screens/PositionDetailScreen.test.tsx`
Expected: PASS, all S/R cases removed, regression assertion green.

- [ ] **Step 4: Typecheck the UI package**

Run: `pnpm --filter @clmm/ui typecheck`
Expected: PASS. The screen no longer reads `vm.srLevels`; `PositionDetailViewModel` still produces the field but nothing consumes it. That's cleaned up next.

### Task 10: Strip S/R from `PositionDetailViewModel`

**Files:**
- Modify: `packages/ui/src/view-models/PositionDetailViewModel.ts`
- Modify: `packages/ui/src/view-models/PositionDetailViewModel.test.ts`

This task runs after Task 9 because once the field comes off the view-model, the only consumer (the detail screen) must already have stopped reading it.

- [ ] **Step 1: Remove S/R-related lines from `PositionDetailViewModel.ts`**

Make the following edits to `packages/ui/src/view-models/PositionDetailViewModel.ts`:

- Delete the `SrLevelViewModel`, `SrLevelGroupViewModel`, and `SrLevelsViewModelBlock` exported types.
- Delete the `srLevels?: SrLevelsViewModelBlock;` field from the `PositionDetailViewModel` type.
- Delete the `MS_PER_MINUTE`, `MS_PER_HOUR`, `STALE_THRESHOLD_MS` constants.
- Delete the `computeFreshness`, `parseNotes`, and `toSrLevelsViewModelBlock` functions.
- Inside `buildPositionDetailViewModel`, delete the `const srLevelsVm = ...` declaration and remove `...(srLevelsVm ? { srLevels: srLevelsVm } : {})` from both return statements.

After the edit, the function reads:

```ts
export function buildPositionDetailViewModel(dto: PositionDetailDto, _now: number): PositionDetailViewModel {
  // ...existing badge/labels/base block unchanged...

  if (dto.breachDirection) {
    return {
      ...base,
      breachDirectionLabel: dto.breachDirection.kind === 'lower-bound-breach'
        ? 'Price dropped below lower bound'
        : 'Price rose above upper bound',
    };
  }

  return base;
}
```

The `now` parameter stays in the public signature (callers still pass it; renaming would ripple unnecessarily). Underscore-prefix it to mark it unused so lint stays quiet.

- [ ] **Step 2: Remove S/R cases from `PositionDetailViewModel.test.ts`**

Open `packages/ui/src/view-models/PositionDetailViewModel.test.ts` and:

- Delete the `makeSrBlock` helper.
- Delete the entire `describe('buildPositionDetailViewModel srLevels', () => { ... })` block.
- If any non-S/R test in this file still passes `srLevels: ...` to `makeDto(...)`, remove that key from the override object.

Verify with: `grep -n "srLevels" packages/ui/src/view-models/PositionDetailViewModel.test.ts` — expected: no output.

- [ ] **Step 3: Run the test file**

Run: `pnpm --filter @clmm/ui vitest run src/view-models/PositionDetailViewModel.test.ts`
Expected: PASS. All non-S/R cases survive.

- [ ] **Step 4: Typecheck the UI package**

Run: `pnpm --filter @clmm/ui typecheck`
Expected: PASS — `dto.srLevels` references in `PositionDetailViewModel.ts` are gone, and the screen (cleaned up in Task 9) no longer consumes the removed field. `PositionDetailDto.srLevels` is still optional in the application DTO; the field gets removed in Task 12.

### Task 11: Strip the S/R validator branch from `apps/app/src/api/positions.ts`

**Files:**
- Modify: `apps/app/src/api/positions.ts`
- Modify: `apps/app/src/api/positions.test.ts`

- [ ] **Step 1: Remove S/R from the validator**

In `apps/app/src/api/positions.ts`:

- Delete the `isSrLevel` function.
- Delete the `isSrLevelsBlock` function.
- Inside `isPositionDetailDto`, delete the trailing block:
  ```ts
  const srLevels = value['srLevels'];
  if (srLevels == null) {
    delete value['srLevels'];
  } else if (!isSrLevelsBlock(srLevels)) {
    delete value['srLevels'];
  }
  ```
  The validator should `return true;` immediately after the `if (!baseValid) return false;` guard. The forward-compat behavior (silently ignoring an `srLevels` field a stale server might still send) is preserved because the validator never inspects extra keys.

- [ ] **Step 2: Remove S/R cases from the test file**

In `apps/app/src/api/positions.test.ts`, delete every `it(...)` case whose name mentions `srLevels` (the six cases at lines 292, 334, 361, 389, 418 — verify by grep).

Add a single forward-compat regression case at the end of the same describe block:

```ts
it('forward-compat: ignores srLevels if a stale server still attaches it', async () => {
  env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

  const detail = {
    positionId: 'Position1111111111111111111111111111111111',
    poolId: 'Pool111111111111111111111111111111111111111',
    rangeState: 'in-range',
    hasActionableTrigger: false,
    monitoringStatus: 'active',
    lowerBound: 100,
    upperBound: 200,
    currentPrice: 150,
    srLevels: {
      briefId: 'brief-1',
      sourceRecordedAtIso: null,
      summary: null,
      capturedAtUnixMs: 1_000_000,
      supports: [{ price: 90 }],
      resistances: [{ price: 210 }],
    },
  };

  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ position: detail }),
  }) as typeof fetch;

  const result = await fetchPositionDetail(
    'DemoWallet1111111111111111111111111111111111',
    'Position1111111111111111111111111111111111',
  );

  expect(result.positionId).toBe('Position1111111111111111111111111111111111');
});
```

- [ ] **Step 3: Run the test file**

Run: `pnpm --filter @clmm/app vitest run src/api/positions.test.ts`
Expected: PASS.

### Task 12: Remove `srLevels` from the application DTO

**Files:**
- Modify: `packages/application/src/dto/index.ts`
- Modify: `packages/application/src/public/index.ts` (verify export, no edits expected)

At this point: no consumer of `PositionDetailDto.srLevels` remains. Removing the field is safe.

- [ ] **Step 1: Remove the field**

In `packages/application/src/dto/index.ts`, delete the line:

```ts
srLevels?: SrLevelsBlock;
```

from the `PositionDetailDto` type definition.

The standalone `SrLevel` and `SrLevelsBlock` exports (above the comment "// Position DTOs") stay — they're still the response shape of the new endpoint.

- [ ] **Step 2: Verify the public re-exports still surface `SrLevel` and `SrLevelsBlock`**

Run: `grep -n "SrLevel" packages/application/src/public/index.ts`
Expected: shows `SrLevel,` and `SrLevelsBlock,` in the export list. No edits needed.

- [ ] **Step 3: Typecheck the whole repo**

Run: `pnpm typecheck`
Expected: PASS. If any consumer still references `dto.srLevels`, the typechecker will flag it now — fix that consumer (this should not happen if Tasks 9–11 were complete).

### Task 13: Add `apps/app/src/api/srLevels.ts` (TDD)

**Files:**
- Create: `apps/app/src/api/srLevels.test.ts`
- Create: `apps/app/src/api/srLevels.ts`

`fetchJson` (in `apps/app/src/api/http.ts`) throws on non-OK without exposing the status code, so the new fetcher uses `fetch` directly via `getBffBaseUrl()` so it can detect 404 and translate it into a typed `SrLevelsUnsupportedPoolError`.

- [ ] **Step 1: Write the failing tests**

Create `apps/app/src/api/srLevels.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCurrentSrLevels, SrLevelsUnsupportedPoolError } from './srLevels';

type ExpoPublicEnv = NodeJS.ProcessEnv & {
  EXPO_PUBLIC_BFF_BASE_URL?: string;
};

const ORIGINAL_FETCH = globalThis.fetch;
const env = process.env as ExpoPublicEnv;
const ORIGINAL_BFF_BASE_URL = env.EXPO_PUBLIC_BFF_BASE_URL;

function restoreBffBaseUrl(): void {
  if (ORIGINAL_BFF_BASE_URL == null) {
    delete env.EXPO_PUBLIC_BFF_BASE_URL;
    return;
  }
  env.EXPO_PUBLIC_BFF_BASE_URL = ORIGINAL_BFF_BASE_URL;
}

function fixtureBlock() {
  return {
    briefId: 'brief-1',
    sourceRecordedAtIso: '2026-04-27T00:00:00Z',
    summary: 'Bullish continuation.',
    capturedAtUnixMs: 1_745_712_000_000,
    supports: [{ price: 132.4 }],
    resistances: [{ price: 148.2 }],
  };
}

describe('fetchCurrentSrLevels', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    restoreBffBaseUrl();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns { srLevels } when the BFF responds with a populated block', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    const block = fixtureBlock();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ srLevels: block }),
    }) as typeof fetch;

    const result = await fetchCurrentSrLevels('Pool111111111111111111111111111111111111111');

    expect(result).toEqual({ srLevels: block });
  });

  it('returns { srLevels: null } when the BFF responds with null (transient unavailability)', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ srLevels: null }),
    }) as typeof fetch;

    const result = await fetchCurrentSrLevels('Pool111111111111111111111111111111111111111');

    expect(result).toEqual({ srLevels: null });
  });

  it('throws SrLevelsUnsupportedPoolError on 404 (pool not in allowlist)', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve('Not Found'),
    }) as typeof fetch;

    const error = await fetchCurrentSrLevels('Unsupported11111111111111111111111111111111')
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(SrLevelsUnsupportedPoolError);
  });

  it('throws a generic transient error on 5xx', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve('Service Unavailable'),
    }) as typeof fetch;

    const error = await fetchCurrentSrLevels('Pool111111111111111111111111111111111111111')
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(SrLevelsUnsupportedPoolError);
  });

  it('throws a generic error when the payload is malformed', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ srLevels: { briefId: 'b', supports: 'not-an-array', resistances: [] } }),
    }) as typeof fetch;

    const error = await fetchCurrentSrLevels('Pool111111111111111111111111111111111111111')
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(SrLevelsUnsupportedPoolError);
  });
});
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `pnpm --filter @clmm/app vitest run src/api/srLevels.test.ts`
Expected: FAIL with module-not-found `./srLevels`.

- [ ] **Step 3: Implement the module**

Create `apps/app/src/api/srLevels.ts`:

```ts
import type { SrLevelsBlock, SrLevel } from '@clmm/application/public';
import { getBffBaseUrl } from './http';

export class SrLevelsUnsupportedPoolError extends Error {
  constructor(poolId: string) {
    super(`S/R levels not available: pool ${poolId} is not supported`);
    this.name = 'SrLevelsUnsupportedPoolError';
  }
}

export type SrLevelsResponse = {
  srLevels: SrLevelsBlock | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null;
}

function isSrLevel(value: unknown): value is SrLevel {
  if (!isRecord(value)) return false;
  return typeof value['price'] === 'number' && Number.isFinite(value['price']);
}

function isSrLevelsBlock(value: unknown): value is SrLevelsBlock {
  if (!isRecord(value)) return false;
  return (
    typeof value['briefId'] === 'string' &&
    (value['sourceRecordedAtIso'] == null || typeof value['sourceRecordedAtIso'] === 'string') &&
    (value['summary'] == null || typeof value['summary'] === 'string') &&
    typeof value['capturedAtUnixMs'] === 'number' &&
    Array.isArray(value['supports']) && (value['supports'] as unknown[]).every(isSrLevel) &&
    Array.isArray(value['resistances']) && (value['resistances'] as unknown[]).every(isSrLevel)
  );
}

export async function fetchCurrentSrLevels(poolId: string): Promise<SrLevelsResponse> {
  const response = await fetch(`${getBffBaseUrl()}/sr-levels/pools/${poolId}/current`);

  if (response.status === 404) {
    throw new SrLevelsUnsupportedPoolError(poolId);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => `HTTP ${response.status}`);
    throw new Error(`Could not load market context: ${detail || response.statusText}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error('Could not load market context: response body was not valid JSON');
  }

  if (!isRecord(body)) {
    throw new Error('Could not load market context: malformed response');
  }

  const srLevels = body['srLevels'];
  if (srLevels === null) {
    return { srLevels: null };
  }

  if (!isSrLevelsBlock(srLevels)) {
    throw new Error('Could not load market context: malformed srLevels block');
  }

  return { srLevels };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @clmm/app vitest run src/api/srLevels.test.ts`
Expected: PASS — all five cases.

### Task 14: Add `MarketContextPanel` (TDD)

**Files:**
- Create: `packages/ui/src/components/MarketContextPanel.test.tsx`
- Create: `packages/ui/src/components/MarketContextPanel.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/src/components/MarketContextPanel.test.tsx`:

```tsx
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { SrLevelsBlock } from '@clmm/application/public';
import { MarketContextPanel } from './MarketContextPanel.js';

afterEach(() => {
  cleanup();
});

function fixtureBlock(): SrLevelsBlock {
  return {
    briefId: 'brief-1',
    sourceRecordedAtIso: null,
    summary: 'Bullish continuation, support at $132.',
    capturedAtUnixMs: 1_745_712_000_000,
    supports: [{ price: 132.4 }],
    resistances: [{ price: 148.2 }],
  };
}

describe('MarketContextPanel', () => {
  it('renders nothing when fully idle (no data, not loading, not errored)', () => {
    const { container } = render(
      <MarketContextPanel
        srLevels={undefined}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        now={1_745_712_000_000}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders the loading skeleton when isLoading and there is no cached data', () => {
    render(
      <MarketContextPanel
        srLevels={undefined}
        isLoading
        isError={false}
        isUnsupported={false}
        now={1_745_712_000_000}
      />,
    );

    expect(screen.getByTestId('market-context-panel-skeleton')).toBeTruthy();
  });

  it('renders the unavailable caption when isUnsupported', () => {
    render(
      <MarketContextPanel
        srLevels={undefined}
        isLoading={false}
        isError={false}
        isUnsupported
        now={1_745_712_000_000}
      />,
    );

    expect(screen.getByText('Market context unavailable')).toBeTruthy();
  });

  it('renders the unavailable caption when isError', () => {
    render(
      <MarketContextPanel
        srLevels={undefined}
        isLoading={false}
        isError
        isUnsupported={false}
        now={1_745_712_000_000}
      />,
    );

    expect(screen.getByText('Market context unavailable')).toBeTruthy();
  });

  it('renders the unavailable caption when srLevels is null (transient regime-engine failure)', () => {
    render(
      <MarketContextPanel
        srLevels={null}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        now={1_745_712_000_000}
      />,
    );

    expect(screen.getByText('Market context unavailable')).toBeTruthy();
  });

  it('renders MarketThesisCard and SrLevelsCard when given a populated block', () => {
    render(
      <MarketContextPanel
        srLevels={fixtureBlock()}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        now={fixtureBlock().capturedAtUnixMs + 5 * 60_000}
      />,
    );

    expect(screen.getByText('Market Thesis')).toBeTruthy();
    expect(screen.getByText('Bullish continuation, support at $132.')).toBeTruthy();
    expect(screen.getByText('Support & Resistance')).toBeTruthy();
  });

  it('omits MarketThesisCard when the block has no summary', () => {
    const block = { ...fixtureBlock(), summary: null };
    render(
      <MarketContextPanel
        srLevels={block}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        now={block.capturedAtUnixMs + 5 * 60_000}
      />,
    );

    expect(screen.queryByText('Market Thesis')).toBeNull();
    expect(screen.getByText('Support & Resistance')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @clmm/ui vitest run src/components/MarketContextPanel.test.tsx`
Expected: FAIL with cannot-find `./MarketContextPanel.js`.

- [ ] **Step 3: Implement the panel**

Create `packages/ui/src/components/MarketContextPanel.tsx`:

```tsx
import { View, Text, ActivityIndicator } from 'react-native';
import type { SrLevelsBlock } from '@clmm/application/public';
import { colors, typography } from '../design-system/index.js';
import { buildSrLevelsViewModelBlock } from '../view-models/SrLevelsViewModel.js';
import { MarketThesisCard } from './MarketThesisCard.js';
import { SrLevelsCard } from './SrLevelsCard.js';

type Props = {
  srLevels: SrLevelsBlock | null | undefined;
  isLoading: boolean;
  isError: boolean;
  isUnsupported: boolean;
  now: number;
};

export function MarketContextPanel({ srLevels, isLoading, isError, isUnsupported, now }: Props): JSX.Element | null {
  const showUnavailable = isError || isUnsupported || srLevels === null;
  const showSkeleton = isLoading && srLevels == null && !showUnavailable;

  if (!isLoading && !isError && !isUnsupported && srLevels == null) {
    return null;
  }

  if (showSkeleton) {
    return (
      <View
        testID="market-context-panel-skeleton"
        style={{
          marginHorizontal: 16,
          marginTop: 14,
          padding: 16,
          backgroundColor: colors.surface,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
        }}
      >
        <ActivityIndicator color={colors.safe} />
      </View>
    );
  }

  if (showUnavailable) {
    return (
      <View
        style={{
          marginHorizontal: 16,
          marginTop: 14,
          padding: 16,
          backgroundColor: colors.surface,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
          Market context unavailable
        </Text>
      </View>
    );
  }

  const block = srLevels as SrLevelsBlock;
  const vm = buildSrLevelsViewModelBlock(block, now);

  return (
    <View style={{ marginHorizontal: 16 }}>
      {vm.summary ? <MarketThesisCard summary={vm.summary} /> : null}
      <SrLevelsCard srLevels={vm} />
    </View>
  );
}
```

- [ ] **Step 4: Run the panel tests**

Run: `pnpm --filter @clmm/ui vitest run src/components/MarketContextPanel.test.tsx`
Expected: PASS.

### Task 15: Wire `MarketContextPanel` into `PositionsListScreen`

**Files:**
- Modify: `packages/ui/src/screens/PositionsListScreen.tsx`
- Modify: `packages/ui/src/screens/PositionsListScreen.test.tsx`

- [ ] **Step 1: Add the panel props to `PositionsListScreen`**

In `packages/ui/src/screens/PositionsListScreen.tsx`:

Update imports — add:

```ts
import type { SrLevelsBlock } from '@clmm/application/public';
import { MarketContextPanel } from '../components/MarketContextPanel.js';
```

Update the `Props` type (currently lines 11-19) to:

```ts
type Props = {
  walletAddress?: string | null;
  positions?: PositionSummaryDto[] | undefined;
  positionsLoading?: boolean;
  positionsError?: string | null;
  onSelectPosition?: (positionId: string) => void;
  onConnectWallet?: () => void;
  platformCapabilities?: PlatformCapabilities | null;
  srLevels?: SrLevelsBlock | null;
  srLevelsLoading?: boolean;
  srLevelsError?: boolean;
  srLevelsUnsupported?: boolean;
  now?: number;
};
```

Update the `PositionsListScreen` destructure to include the new props, and pass them down to `ConnectedPositionsList`. Update `ConnectedPositionsList`'s signature to accept them. Inside `ConnectedPositionsList`, set the `FlatList`'s `ListHeaderComponent` to compose the panel above the `SectionHeader`:

```tsx
ListHeaderComponent={
  <View>
    <MarketContextPanel
      srLevels={srLevels ?? undefined}
      isLoading={srLevelsLoading ?? false}
      isError={srLevelsError ?? false}
      isUnsupported={srLevelsUnsupported ?? false}
      now={now ?? Date.now()}
    />
    <SectionHeader
      title="Active positions"
      meta={`${positions.length} monitored`}
    />
  </View>
}
```

Make sure to add `View` to the existing `react-native` import in this file if it isn't already imported (it is — at line 1 — confirm by reading).

The panel renders only inside `ConnectedPositionsList`, so it inherits the existing "wallet connected and positions loaded with at least one item" gate — matching the spec's "panel hidden when wallet disconnected / positions loading / errored / empty" requirement.

- [ ] **Step 2: Add panel-coverage cases to the screen tests**

In `packages/ui/src/screens/PositionsListScreen.test.tsx`, add these cases to the `describe('PositionsListScreen', ...)` block. They use the existing `makePosition` helper; the panel is keyed on the presence of cards (i.e., the `hasPositions` branch).

```tsx
it('renders the market context panel above the list when positions and S/R data are available', () => {
  render(
    <PositionsListScreen
      walletAddress="wallet-1"
      positions={[makePosition()]}
      srLevels={{
        briefId: 'brief-1',
        sourceRecordedAtIso: null,
        summary: 'Bullish continuation.',
        capturedAtUnixMs: 1_745_712_000_000,
        supports: [{ price: 132 }],
        resistances: [{ price: 148 }],
      }}
      now={1_745_712_000_000 + 5 * 60_000}
    />,
  );

  expect(screen.getByText('Market Thesis')).toBeTruthy();
  expect(screen.getByText('Bullish continuation.')).toBeTruthy();
  expect(screen.getByText('Active positions')).toBeTruthy();
});

it('hides the market context panel when wallet is disconnected', () => {
  render(<PositionsListScreen walletAddress={null} />);

  expect(screen.queryByText('Market Thesis')).toBeNull();
  expect(screen.queryByText('Market context unavailable')).toBeNull();
});

it('hides the market context panel while positions are loading', () => {
  render(<PositionsListScreen walletAddress="wallet-1" positionsLoading />);

  expect(screen.queryByText('Market Thesis')).toBeNull();
  expect(screen.queryByText('Market context unavailable')).toBeNull();
});

it('hides the market context panel when there are no positions', () => {
  render(<PositionsListScreen walletAddress="wallet-1" positions={[]} />);

  expect(screen.queryByText('Market Thesis')).toBeNull();
  expect(screen.queryByText('Market context unavailable')).toBeNull();
});

it('renders the unavailable caption when S/R is unsupported but positions render', () => {
  render(
    <PositionsListScreen
      walletAddress="wallet-1"
      positions={[makePosition()]}
      srLevelsUnsupported
    />,
  );

  expect(screen.getByText('Market context unavailable')).toBeTruthy();
  expect(screen.getByText('Active positions')).toBeTruthy();
});

it('renders the unavailable caption when S/R errored, while positions render', () => {
  render(
    <PositionsListScreen
      walletAddress="wallet-1"
      positions={[makePosition()]}
      srLevelsError
    />,
  );

  expect(screen.getByText('Market context unavailable')).toBeTruthy();
  expect(screen.getByText('Active positions')).toBeTruthy();
});

it('renders the positions list when S/R is loading (non-blocking)', () => {
  render(
    <PositionsListScreen
      walletAddress="wallet-1"
      positions={[makePosition()]}
      srLevelsLoading
    />,
  );

  expect(screen.getByText('Active positions')).toBeTruthy();
});
```

- [ ] **Step 3: Run the screen tests**

Run: `pnpm --filter @clmm/ui vitest run src/screens/PositionsListScreen.test.tsx`
Expected: PASS for all existing and new cases.

### Task 16: Wire the S/R query into the Positions route

**Files:**
- Modify: `apps/app/app/(tabs)/positions.tsx`

- [ ] **Step 1: Add the S/R query and pass props through**

Replace the contents of `apps/app/app/(tabs)/positions.tsx` with:

```tsx
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { PositionsListScreen } from '@clmm/ui';
import { useStore } from 'zustand';
import { fetchSupportedPositions } from '../../src/api/positions';
import { fetchCurrentSrLevels, SrLevelsUnsupportedPoolError } from '../../src/api/srLevels';
import { walletSessionStore } from '../../src/state/walletSessionStore';
import type { PositionListItemViewModel } from '@clmm/ui';
import { navigateRoute } from '../../src/platform/webNavigation';

const SR_LEVELS_STALE_TIME_MS = 5 * 60 * 1000;

export default function PositionsRoute() {
  const router = useRouter();
  const walletAddress = useStore(walletSessionStore, (state) => state.walletAddress);
  const platformCapabilities = useStore(walletSessionStore, (state) => state.platformCapabilities);
  const positionsQuery = useQuery({
    queryKey: ['supported-positions', walletAddress],
    queryFn: () => fetchSupportedPositions(walletAddress!),
    enabled: walletAddress != null && walletAddress.length > 0,
  });
  const hasLoadedPositions = (positionsQuery.data?.length ?? 0) > 0;

  const poolId = positionsQuery.data?.[0]?.poolId ?? null;

  const srLevelsQuery = useQuery({
    queryKey: ['sr-levels-current', poolId],
    queryFn: () => fetchCurrentSrLevels(poolId!),
    enabled: poolId != null,
    staleTime: SR_LEVELS_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: (failureCount, error) =>
      !(error instanceof SrLevelsUnsupportedPoolError) && failureCount < 1,
  });

  const srLevelsUnsupported = srLevelsQuery.error instanceof SrLevelsUnsupportedPoolError;
  const srLevelsError = srLevelsQuery.isError && !srLevelsUnsupported;

  return (
    <PositionsListScreen
      walletAddress={walletAddress}
      positions={positionsQuery.data}
      positionsLoading={positionsQuery.isLoading}
      positionsError={positionsQuery.isError && !hasLoadedPositions ? 'Could not load supported positions for this wallet.' : null}
      platformCapabilities={platformCapabilities}
      srLevels={srLevelsQuery.data?.srLevels ?? null}
      srLevelsLoading={srLevelsQuery.isLoading && srLevelsQuery.fetchStatus !== 'idle'}
      srLevelsError={srLevelsError}
      srLevelsUnsupported={srLevelsUnsupported}
      onConnectWallet={() =>
        navigateRoute({
          router,
          path: '/connect',
          method: 'push',
        })
      }
      onSelectPosition={(positionId: PositionListItemViewModel['positionId']) =>
        navigateRoute({
          router,
          path: `/position/${positionId}`,
          method: 'push',
        })
      }
    />
  );
}
```

- [ ] **Step 2: Typecheck the app**

Run: `pnpm --filter @clmm/app typecheck`
Expected: PASS.

### Task 17: Phase 2 verification, smoke test, and commit

- [ ] **Step 1: Full repo checks**

Run, in this order:

```bash
pnpm typecheck
pnpm lint
pnpm boundaries
pnpm test
pnpm build
```

Expected: all pass.

- [ ] **Step 2: Grep sweep — confirm no S/R drift remains on the detail surface**

Run each command. Each should produce **no output** (the only acceptable hits are within the new shared S/R module, the new panel, and the new API client):

```bash
grep -rn "dto\.srLevels" packages apps
grep -rn "PositionDetailDto.*srLevels\|PositionDetailViewModel.*srLevels" packages apps
grep -rn "srLevels?:" packages/application packages/ui packages/adapters apps
grep -rn "MarketThesisCard\|SrLevelsCard" packages/ui/src/screens apps
```

Expected: the first three are silent; the fourth shows hits only inside `packages/ui/src/components/MarketContextPanel.tsx` (and the components' own files).

- [ ] **Step 3: Smoke run the Expo app**

Run: `pnpm --filter @clmm/app dev` (or the project's standard dev command).
Verify in a browser/simulator:
1. Connect a SOL/USDC wallet → positions load → market context panel appears above the list with `Market Thesis` (if summary present) and `Support & Resistance` rows.
2. Navigate into a position → `MarketThesisCard` and `SrLevelsCard` are absent on the detail screen; the screen ends after the alert pill.
3. Stop the regime engine (or unset `REGIME_ENGINE_BASE_URL` on the BFF) → reload the Positions tab → panel renders "Market context unavailable" caption while positions still render.

If you cannot run the simulator/browser in this environment, state so explicitly per `AGENTS.md` validation expectations.

- [ ] **Step 4: Commit**

```bash
git add \
  packages/application/src/dto/index.ts \
  packages/ui/src/view-models/SrLevelsViewModel.ts \
  packages/ui/src/view-models/SrLevelsViewModel.test.ts \
  packages/ui/src/view-models/PositionDetailViewModel.ts \
  packages/ui/src/view-models/PositionDetailViewModel.test.ts \
  packages/ui/src/screens/PositionDetailScreen.tsx \
  packages/ui/src/screens/PositionDetailScreen.test.tsx \
  packages/ui/src/screens/PositionsListScreen.tsx \
  packages/ui/src/screens/PositionsListScreen.test.tsx \
  packages/ui/src/components/MarketContextPanel.tsx \
  packages/ui/src/components/MarketContextPanel.test.tsx \
  apps/app/src/api/positions.ts \
  apps/app/src/api/positions.test.ts \
  apps/app/src/api/srLevels.ts \
  apps/app/src/api/srLevels.test.ts \
  apps/app/app/\(tabs\)/positions.tsx
git commit -m "$(cat <<'EOF'
feat(ui,app): move S/R to MarketContextPanel on Positions page; remove from detail

PositionDetailDto loses its srLevels field; view-model logic lifts to
packages/ui/src/view-models/SrLevelsViewModel.ts and is reused by the new
MarketContextPanel above the positions list. apps/app gains
fetchCurrentSrLevels with a typed SrLevelsUnsupportedPoolError that the
TanStack Query layer uses to skip retries on 404. Position detail screen
no longer renders MarketThesisCard or SrLevelsCard. Failure of the S/R
query never blocks position rendering.
EOF
)"
```

End of Phase 2 — both commits land.

---

## Closeout

- [ ] **Step 1: Push and open the PR**

Push the branch and open a PR against `main`. PR description should reference issue #50 and link to both the spec (`docs/superpowers/specs/2026-04-27-sr-levels-bff-extraction-design.md`) and this plan.

- [ ] **Step 2: Acceptance-criteria checklist (from issue #50)**

Walk down the spec's "Acceptance Criteria" section and confirm each item against the implemented changes. Any gap → file a follow-up task; do not merge.
