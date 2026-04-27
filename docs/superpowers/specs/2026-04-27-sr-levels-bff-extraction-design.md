# Design: Split S/R Levels into a Dedicated BFF Endpoint and Move Display to Positions Page

**Status:** Draft
**Date:** 2026-04-27
**Issue:** [opsclawd/clmm-v2#50](https://github.com/opsclawd/clmm-v2/issues/50)

## Problem

The position detail endpoint (`GET /positions/:walletId/:positionId`) returns both LP position state and optional support/resistance market-analysis data. `PositionController.getPosition` fetches S/R from `CURRENT_SR_LEVELS_PORT` for allowlisted pools and conditionally attaches `position.srLevels` to the response. This couples position loading to regime-engine availability and makes the position detail endpoint responsible for unrelated market-analysis enrichment.

For the current MVP, all supported positions are SOL/USDC, so S/R is shared market context — not per-position detail content. It belongs once on the main Positions page above the positions list, not duplicated inside every position detail view.

## Goal

Move S/R behind a dedicated, pool-scoped BFF endpoint and render the current SOL/USDC market context on the main Positions page. Position detail focuses purely on the LP (range, fees, rewards, trigger state, exit CTA).

## Non-Goals

- Do not change the regime-engine API.
- Do not expose `REGIME_ENGINE_BASE_URL` to the app bundle.
- Do not make the frontend call regime-engine directly.
- Do not add S/R back into the position list or position detail endpoints.
- Do not duplicate the full S/R display inside every position card.
- Do not generalize for multiple pools yet beyond keeping the endpoint pool-scoped.
- Do not add a compact S/R reference on the position detail page in this pass.

## Decisions

The following choices are pinned and must not drift during implementation:

1. **Position detail removes S/R entirely.** No `MarketThesisCard`, no `SrLevelsCard`, no compact reference. Detail screen is purely position-specific.
2. **Pool ID derivation on the Positions page** = `positions[0]?.poolId` (first loaded position). No hardcoded address, no allowlist mirror, no symbol inference, no multi-pool scan.
3. **`srLevels?: SrLevelsBlock` is removed** from `PositionDetailDto`, the application DTO mirror, and `PositionDetailViewModel`. The `SrLevelsBlock` type itself survives because the new endpoint returns it. View-model logic (`parseNotes`, freshness, grouping) lifts into a standalone S/R view-model module that the new panel consumes; the detail page must not import or reference it.
4. **TanStack Query behavior for S/R**: `staleTime: 5 * 60 * 1000`, `refetchOnWindowFocus: false`, `refetchOnMount: false`, `retry: once` for transient failures, no retry on 404. Loading and error states are scoped to the panel; they never affect the positions list. S/R failure never surfaces in `positionsError`.

## Target API

```http
GET /sr-levels/pools/:poolId/current
```

**Response:**

```ts
{
  srLevels: SrLevelsBlock | null
}
```

**Status semantics:**

- `404 Not Found` — `poolId` is not in the server-side allowlist. Permanent for this MVP.
- `200 { srLevels: <block> }` — allowlisted pool, regime engine returned current data.
- `200 { srLevels: null }` — allowlisted pool, regime engine disabled / transient failure / upstream 404 / malformed upstream response. Retry-worthy transient state, treated by the panel as "unavailable".

The distinction between 404 and `200 + null` is load-bearing: 404 is the unsupported-pool signal; `200 + null` is the transient-unavailability signal.

## Architecture

### Backend (NestJS, hexagonal — `packages/adapters/src/inbound/http/`)

**New:**

- `SrLevelsController.ts` — single GET handler. Injects `CURRENT_SR_LEVELS_PORT` and `SR_LEVELS_POOL_ALLOWLIST`. Resolves `poolId` via the allowlist map; calls `srLevelsPort.fetchCurrent(symbol, source)`. Returns `{ srLevels }`.

**Modified:**

- `PositionController.ts` — drop `CURRENT_SR_LEVELS_PORT` and `SR_LEVELS_POOL_ALLOWLIST` constructor params. Drop the `DtoSrLevelsBlock` and `CurrentSrLevelsPort` imports. Collapse the allowlisted vs. non-allowlisted branches in `getPosition` into a single trigger-only fetch. Remove `srLevels` from the returned payload.
- `AppModule.ts` — register `SrLevelsController` in `controllers: [...]`. Provider list unchanged: `CURRENT_SR_LEVELS_PORT`, `SR_LEVELS_POOL_ALLOWLIST`, `SR_LEVELS_POOL_ALLOWLIST_MAP`, and `CurrentSrLevelsAdapter` stay — they just gain a new consumer.

**Unchanged:** `CurrentSrLevelsAdapter`, `RegimeEngineExecutionEventAdapter`, regime-engine port contracts, env handling.

### Application layer (`packages/application/src/`)

- `dto/index.ts` — remove `srLevels?: SrLevelsBlock` from `PositionDetailDto`. Keep standalone exports of `SrLevelsBlock` and `SrLevel` (the new endpoint still uses these shapes).
- `public/index.ts` — confirm `SrLevelsBlock` and `SrLevel` remain exported for `apps/app` consumption.

### Frontend API client (`apps/app/src/api/`)

**New:**

- `srLevels.ts` — exports `fetchCurrentSrLevels(poolId: string)`, the response validator (`isSrLevelsBlock`, lifted from `positions.ts`), and a typed `SrLevelsUnsupportedPoolError` for 404 responses so query layers can branch without retry. Re-exports `SrLevelsBlock` from `@clmm/application/public`.

**Modified:**

- `positions.ts` — `fetchPositionDetail` no longer reads or strips `srLevels`. Remove `isSrLevel`, `isSrLevelsBlock`, and the `srLevels` branch in `isPositionDetailDto`. Forward-compat: if a stale server still sends `srLevels` on the detail payload, the validator must ignore it (not crash and not surface it).

### UI package (`packages/ui/src/`)

**New:**

- `view-models/SrLevelsViewModel.ts` — owns `SrLevelsViewModelBlock`, `SrLevelGroupViewModel`, `SrLevelViewModel`, `parseNotes`, `computeFreshness`, the stale threshold constants, and `buildSrLevelsViewModelBlock(block, now)`. Lifted verbatim from `PositionDetailViewModel.ts` — pure move, no behavior change.
- `components/MarketContextPanel.tsx` — composes `MarketThesisCard` + `SrLevelsCard` plus loading/unavailable states. Props:

  ```ts
  type Props = {
    srLevels: SrLevelsBlock | null | undefined;
    isLoading: boolean;
    isError: boolean;
    isUnsupported: boolean;
    now: number;
  };
  ```

  Internally calls `buildSrLevelsViewModelBlock(block, now)` to produce groups + freshness, then delegates rendering to the existing cards.

**Modified:**

- `view-models/PositionDetailViewModel.ts` — remove the `srLevels?` field, `toSrLevelsViewModelBlock`, `parseNotes`, `computeFreshness`, and the stale-threshold constants (relocated). `buildPositionDetailViewModel` returns `base` (with optional `breachDirectionLabel`) — no S/R branching.
- `screens/PositionDetailScreen.tsx` — remove `MarketThesisCard` and `SrLevelsCard` imports and renders. The scroll ends after the alert pill.
- `screens/PositionsListScreen.tsx` — accept new props: `srLevels?: SrLevelsBlock | null`, `srLevelsLoading?: boolean`, `srLevelsError?: boolean`, `srLevelsUnsupported?: boolean`, `now?: number`. Render `MarketContextPanel` only inside the `hasPositions` branch. Wire the panel as the `ListHeaderComponent` of the existing FlatList (above the existing `SectionHeader`) so scroll layout stays consistent.

**Unchanged:** `PositionCard.tsx` (no compact per-card S/R reference), `MarketThesisCard.tsx`, `SrLevelsCard.tsx`.

### Expo app routes (`apps/app/app/`)

- `(tabs)/positions.tsx` — add a second `useQuery` for S/R:

  ```ts
  const poolId = positionsQuery.data?.[0]?.poolId ?? null;
  const srLevelsQuery = useQuery({
    queryKey: ['sr-levels-current', poolId],
    queryFn: () => fetchCurrentSrLevels(poolId!),
    enabled: poolId != null,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: (failureCount, error) =>
      !(error instanceof SrLevelsUnsupportedPoolError) && failureCount < 1,
  });
  ```

  Pass `srLevelsQuery.data?.srLevels`, `srLevelsQuery.isLoading`, `srLevelsQuery.isError`, and an `srLevelsUnsupported` flag (derived from the typed error) into `PositionsListScreen`.

- `position/[id].tsx` — no API change needed; only test updates if any test references the removed `srLevels` field.

## Boundaries

- `packages/ui` continues to depend only on `@clmm/application/public` for types; no new SDK imports.
- `packages/application` does not import adapters; the `SrLevelsBlock` type remains duplicated between `application/dto` and `adapters/regime-engine/types` (existing intentional drift guard preserved).
- `apps/app` does not import adapters or call regime-engine directly.
- After the change, the position detail page must not transitively depend on S/R modules. Verified by grep.

## Data Flow

### Backend `GET /sr-levels/pools/:poolId/current`

1. Receive raw `poolId` string.
2. `srLevelsAllowlist.get(poolId)` — miss throws `NotFoundException` (404).
3. Hit: call `srLevelsPort.fetchCurrent(symbol, source)`. The adapter already absorbs disabled config / transient errors / upstream 404 / malformed shape into `null`.
4. Return `{ srLevels }` — always 200 once allowlisted; `null` is a valid body.

### Backend `GET /positions/:walletId/:positionId` (post-cleanup)

1. Resolve wallet/position IDs.
2. `getPositionDetail(...)` (unchanged).
3. Single call to `triggerRepo.listActionableTriggers(wallet)` — no longer parallelized with S/R, no longer branched on allowlist membership.
4. Return `{ position: toPositionDetailDto(...), error?: triggerError }`. No `srLevels` field, ever.

### Frontend Positions page

1. `useQuery(['supported-positions', walletAddress])` — unchanged.
2. Derive `poolId = positions[0]?.poolId`. `null` while positions are loading or empty.
3. S/R `useQuery` runs only when `poolId` is non-null. Cache keyed on `poolId`.
4. Pass S/R query state into `PositionsListScreen`. The panel renders only inside the `hasPositions` branch.
5. The two queries share no error boundary. The S/R query never blocks position rendering.

### Render shape (Positions page, top to bottom)

```
[DegradedCapabilityBanner]            // existing
[MarketContextPanel]                  // new — only when wallet connected and at least one position loaded
  [MarketThesisCard summary?]
  [SrLevelsCard groups + freshness]
  // OR loading skeleton
  // OR "Market context unavailable" caption
[SectionHeader "Active positions"]    // existing
[PositionCard ...] x N                // existing
```

The panel is hidden entirely when: wallet disconnected, positions loading, positions errored with no cached data, or positions empty.

## Error Handling

### Backend `GET /sr-levels/pools/:poolId/current`

| Condition | Response |
|---|---|
| `poolId` missing from allowlist | `404 Not Found` |
| Allowlisted, port returns `null` | `200 { srLevels: null }` |
| Allowlisted, port returns block | `200 { srLevels: <block> }` |
| Unexpected adapter throw | `500` (Nest default); logged via existing observability port |
| Malformed `poolId` (non-base58) | `404` via natural allowlist miss |

### Backend `GET /positions/:walletId/:positionId`

- Trigger fetch retains existing transient-error handling: `isTransientPositionReadFailure(error)` → return `error: triggerError` field, position payload still returned with `hasActionableTrigger: false`. Non-transient errors still throw.
- The `Promise.all([listActionableTriggers, srLevelsPort.fetchCurrent])` parallel branch is gone.

### Frontend `fetchCurrentSrLevels(poolId)`

- 404 → throw `SrLevelsUnsupportedPoolError` (typed sentinel; query layer skips retry).
- Network/5xx → throw generic `Error`; TanStack retries once.
- Malformed payload (validator reject) → throw generic `Error`; one retry, then unavailable.
- 200 with `srLevels: null` → resolve `{ srLevels: null }`. Not an error. Panel renders unavailable caption; cached for `staleTime`.

### Frontend Positions page edge cases

| State | Panel render |
|---|---|
| Wallet disconnected | Hidden (existing `ConnectWalletEntry` branch) |
| Positions loading | Hidden (no `poolId` yet) |
| Positions errored, no cached positions | Hidden (existing error branch) |
| Positions empty | Hidden (no `poolId`) |
| Positions loaded, S/R query disabled | Hidden |
| Positions loaded, S/R loading, no prior cache | Skeleton inside panel container |
| Positions loaded, S/R loading, cached data exists | Cached panel with cached freshness label |
| Positions loaded, S/R 404 (unsupported) | "Market context unavailable" caption, no retry |
| Positions loaded, S/R 5xx/network/malformed (after one retry) | "Market context unavailable" caption; cached data shown if present |
| Positions loaded, S/R returns `{ srLevels: null }` | "Market context unavailable" caption |
| Positions loaded, S/R success, fresh data | `MarketThesisCard` + `SrLevelsCard` |
| Positions loaded, S/R success, data older than 48h | Panel renders normally; freshness label appends `· stale` (existing semantic) |

S/R failure never enters `positionsError` and never blanks the positions list. The detail page never depends on the S/R query.

## Testing Strategy

### Backend

- **`SrLevelsController.test.ts`** (new): allowlisted pool returns block; allowlisted pool returns `null`; unsupported pool returns 404; allowlist resolves correct `(symbol, source)` pair.
- **`PositionController.test.ts`** (modify): drop assertions that detail payload includes `srLevels`; drop allowlist-branch coverage (moved); add assertion that payload never contains `srLevels` regardless of allowlist membership; add spy assertion that `srLevelsPort.fetchCurrent` is never invoked from `getPosition`; update DI test setup to drop the two removed dependencies.
- **`SrLevelsAllowlist.test.ts`**: keep as-is.
- **`AppModule` wiring test** (if present): assert `SrLevelsController` is registered.
- **Unchanged:** `CurrentSrLevelsAdapter.test.ts`, `RegimeEngineExecutionEventAdapter.test.ts`.

### Frontend

- **`apps/app/src/api/positions.test.ts`**: remove cases that assert `srLevels` is parsed/stripped on detail responses; add forward-compat case ensuring a stale server's `srLevels` field is silently ignored without crashing.
- **`apps/app/src/api/srLevels.test.ts`** (new): valid response with block; valid response with `null`; 404 throws `SrLevelsUnsupportedPoolError`; 5xx throws transient error; malformed payload throws transient error.
- **`packages/ui/src/view-models/SrLevelsViewModel.test.ts`** (lifted from `PositionDetailViewModel.test.ts` S/R cases): same cases, same assertions, new module path. Cases that no longer apply to the detail view-model are deleted from `PositionDetailViewModel.test.ts`.
- **`packages/ui/src/components/MarketContextPanel.test.tsx`** (new): renders nothing when fully idle; renders skeleton when loading without cached data; renders unavailable caption on `isUnsupported`, `isError`, and `srLevels === null`; renders `MarketThesisCard` + `SrLevelsCard` on success; `MarketThesisCard` only when `summary` present.
- **`packages/ui/src/screens/PositionDetailScreen.test.tsx`**: remove S/R render assertions; add assertion that the screen renders nothing S/R-related.
- **`packages/ui/src/screens/PositionsListScreen.test.tsx`**: panel renders above list when positions present and S/R succeeds; panel hidden when wallet disconnected / positions loading / positions errored / positions empty; panel renders unavailable caption when `srLevelsError` or `srLevelsUnsupported`; positions list renders normally regardless of S/R state.
- **`apps/app/app/(tabs)/positions.tsx` route test** (if present): S/R query is enabled only when at least one position is loaded; `poolId` is taken from `positions[0].poolId`; cache key includes `poolId`.

### Acceptance criteria coverage

| Acceptance criterion | Test |
|---|---|
| Position detail no longer calls regime-engine | `PositionController.test` spy assertion |
| Position detail payload omits `srLevels` | `PositionController.test` payload assertion |
| List endpoint omits `srLevels` | regression assertion in existing list tests |
| New endpoint returns S/R for allowlisted pool | `SrLevelsController.test` happy path |
| Unsupported pools return 404 | `SrLevelsController.test` allowlist miss |
| Positions page renders without waiting on S/R | `PositionsListScreen.test` non-blocking case |
| Positions page fetches S/R once | `positions.tsx` route test (cache key + enabled) |
| Single shared panel above list | `PositionsListScreen.test` placement |
| S/R failure ≠ generic positions error | `PositionsListScreen.test` non-blocking + caption |
| Detail is no longer the primary S/R surface | `PositionDetailScreen.test` (no S/R cards) |
| Existing SOL/USDC allowlist preserved | `SrLevelsAllowlist.test` unchanged |

### Manual verification

Per `AGENTS.md`, before claiming done (broad cross-package change):

- `pnpm typecheck`, `pnpm lint`, `pnpm boundaries`, `pnpm test`.
- `pnpm build` to surface any DTO export drift.
- Grep sweep — these should all be clean except inside the new shared S/R module:
  - `dto.srLevels`
  - `srLevels?:`
  - `PositionDetailDto.*srLevels`
  - `PositionDetailViewModel.*srLevels`
  - `MarketThesisCard` and `SrLevelsCard` imports outside `MarketContextPanel`
- Smoke run the Expo app: connect a SOL/USDC wallet → panel appears above the list with `MarketThesisCard` + `SrLevelsCard`; unset `REGIME_ENGINE_BASE_URL` and rerun → panel shows "Market context unavailable" while positions still render.

## Sequencing

Land in two commits to keep the diff bisectable. Both must pass `pnpm typecheck`, `pnpm lint`, `pnpm boundaries`, and `pnpm test` independently.

1. **Backend additive + controller cleanup.** New `SrLevelsController`, `AppModule` registration, `PositionController` stops fetching and attaching S/R (drops the two injected dependencies and collapses the allowlisted/non-allowlisted branches), updated controller tests. The `srLevels?: SrLevelsBlock` optional field on `PositionDetailDto` is **kept** in this commit — it is simply never populated at runtime. Frontend continues to compile against the unchanged type. After this commit: the new endpoint exists, the detail endpoint stops returning S/R at runtime, but the type contract is unchanged.
2. **DTO field removal + frontend split + view-model lift + panel.** Remove `srLevels?` from `PositionDetailDto` (and the application DTO mirror) and from `PositionDetailViewModel`. Lift `SrLevelsViewModel.ts`. Add `apps/app/src/api/srLevels.ts`. Strip the `srLevels` validator branch from `apps/app/src/api/positions.ts`. Add `MarketContextPanel`. Wire it into `PositionsListScreen` and `apps/app/app/(tabs)/positions.tsx`. Remove `MarketThesisCard` and `SrLevelsCard` from `PositionDetailScreen` and `PositionDetailViewModel`. Update all frontend tests.

This ordering keeps every intermediate revision green: commit 1 is purely additive plus a runtime-only behavior change inside one controller; commit 2 atomically removes the type field together with every consumer.

## Files Touched

### Added
- `packages/adapters/src/inbound/http/SrLevelsController.ts`
- `packages/adapters/src/inbound/http/SrLevelsController.test.ts`
- `apps/app/src/api/srLevels.ts`
- `apps/app/src/api/srLevels.test.ts`
- `packages/ui/src/view-models/SrLevelsViewModel.ts`
- `packages/ui/src/view-models/SrLevelsViewModel.test.ts`
- `packages/ui/src/components/MarketContextPanel.tsx`
- `packages/ui/src/components/MarketContextPanel.test.tsx`

### Modified
- `packages/adapters/src/inbound/http/PositionController.ts`
- `packages/adapters/src/inbound/http/PositionController.test.ts`
- `packages/adapters/src/inbound/http/AppModule.ts`
- `packages/application/src/dto/index.ts`
- `packages/application/src/public/index.ts` (export check)
- `apps/app/src/api/positions.ts`
- `apps/app/src/api/positions.test.ts`
- `apps/app/app/(tabs)/positions.tsx`
- `packages/ui/src/screens/PositionsListScreen.tsx`
- `packages/ui/src/screens/PositionsListScreen.test.tsx`
- `packages/ui/src/screens/PositionDetailScreen.tsx`
- `packages/ui/src/screens/PositionDetailScreen.test.tsx`
- `packages/ui/src/view-models/PositionDetailViewModel.ts`
- `packages/ui/src/view-models/PositionDetailViewModel.test.ts`

### Explicitly NOT Modified
- `packages/ui/src/components/PositionCard.tsx`
- `packages/adapters/src/outbound/regime-engine/CurrentSrLevelsAdapter.ts`
- `packages/adapters/src/outbound/regime-engine/RegimeEngineExecutionEventAdapter.ts`
- `packages/adapters/src/outbound/regime-engine/types.ts`
- Any env or build configuration touching `REGIME_ENGINE_BASE_URL`
- `GET /positions/:walletId` (list endpoint)

## Acceptance Criteria

Mirrored from issue #50, all must hold after the change:

- [ ] `GET /positions/:walletId/:positionId` no longer calls regime-engine or `CURRENT_SR_LEVELS_PORT`.
- [ ] `GET /positions/:walletId/:positionId` no longer includes `srLevels`.
- [ ] `GET /positions/:walletId` does not include or fetch `srLevels`.
- [ ] `GET /sr-levels/pools/:poolId/current` returns S/R levels for allowlisted pools.
- [ ] Unsupported pools return 404.
- [ ] Main Positions page renders supported positions without waiting on S/R levels.
- [ ] Main Positions page fetches S/R once for the SOL/USDC pool after positions are available.
- [ ] Main Positions page renders a single shared SOL/USDC market context panel above the positions list.
- [ ] S/R query failure does not show the generic positions-list error state.
- [ ] Position detail page is no longer the primary S/R display surface (no `MarketThesisCard`, no `SrLevelsCard`).
- [ ] Existing SOL/USDC allowlist behavior is preserved.
- [ ] Tests cover controller extraction, frontend query split, and non-blocking Positions page behavior.
