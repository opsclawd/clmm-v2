# Regime Engine V2 S/R Theses Market Context Design

## Source

GitHub issue: https://github.com/opsclawd/clmm-v2/issues/65

## Goal

Integrate CLMM with regime-engine v2 S/R theses so the positions market-context surface can show structured OpenClaw support/resistance analysis: bias, setup type, timeframe, entry zones, targets, invalidation, trigger conditions, attribution, reliability, timestamps, source links, chart references, and raw thesis text.

This is an additive v2 thesis path. It does not replace the existing v1 flat S/R route, DTO, adapter, or insight bundle consumers. V1 remains available for flat chart context and as a UI fallback when v2 thesis data is unavailable.

## Non-Goals

- Do not expose arbitrary `symbol` or `source` query params to the browser.
- Do not expose regime-engine directly to the app bundle.
- Do not change `GET /sr-levels/pools/:poolId/current`.
- Do not remove or break existing v1 `SrLevelsBlock` consumers.
- Do not encode v2 thesis metadata into v1 `notes` strings.
- Do not parse structured v2 fields back out of free text.
- Do not add filtering by `bias`, `setupType`, or `sourceReliability`.
- Do not implement a new chart component or `RangeBar` overlay in this issue.
- Do not change trigger qualification, exit preview generation, signing, execution, or the directional exit-policy invariant.

## Decisions

- Add a new pool-scoped BFF route: `GET /sr-theses/pools/:poolId/current`.
- Keep browser calls pool-scoped. The app passes only `poolId`.
- Add a separate v2 allowlist mapping the SOL/USDC Orca Whirlpool to `{ symbol: "SOL/USDC", source: "openclaw" }`.
- Keep the existing v1 S/R allowlist using `source: "mco"` unless separately changed.
- Add v2 DTOs and `SrThesesReadPort` in `packages/application`.
- Add a new v2 adapter and controller in `packages/adapters`.
- Add a new app API client in `apps/app/src/api/srTheses.ts`.
- Render v2 thesis cards as the primary S/R analysis when v2 data is available.
- Fall back to the existing v1 `SrLevelsCard` when v2 data is unavailable and v1 data exists.
- Rank theses by recency, not `sourceReliability`.
- Recency uses `publishedAt`, then `collectedAt`, then brief-level `capturedAtIso`; unparseable timestamps sort last.
- Produce a UI-ready overlay model from the selected thesis, but do not render chart overlays yet.

## Architecture

Regime-engine v2 S/R theses follow a distinct read path:

```text
regime-engine GET /v2/sr-levels/current
  -> CurrentSrThesesAdapter
  -> SrThesesReadPort + SrThesesBlock DTO
  -> BFF GET /sr-theses/pools/:poolId/current
  -> apps/app/src/api/srTheses.ts
  -> positions route TanStack Query
  -> PositionsListScreen
  -> SrInsightsSection
  -> v2 Thesis Cards, with v1 S/R fallback
```

Package ownership:

- `packages/application` owns v2 DTOs, the v2 read port, and exported public types.
- `packages/adapters` owns regime-engine HTTP fetch, v2 payload validation, retry/backoff, timeout, BFF mapping, and server-owned pool allowlist resolution.
- `apps/app` owns the browser-facing BFF client and query wiring.
- `packages/ui` owns view-model sorting, freshness labels, selected-thesis projection, fallback composition, and presentational components.
- `packages/domain` is unchanged.

The v2 path is parallel to existing v1 S/R and regime market-context paths. It must not be bundled into a generic market-context endpoint.

## Application Contracts

Add v2 DTOs to `packages/application/src/dto/index.ts` and export them through `packages/application/src/public/index.ts`.

```ts
export type SrThesisDto = {
  asset: string;
  timeframe: string;
  bias: string | null;
  setupType: string | null;
  supportLevels: string[];
  resistanceLevels: string[];
  entryZone: string | null;
  targets: string[];
  invalidation: string | null;
  trigger: string | null;
  chartReference: string | null;
  sourceHandle: string;
  sourceChannel: string | null;
  sourceKind: string;
  sourceReliability: string | null;
  rawThesisText: string | null;
  collectedAt: string | null;
  publishedAt: string | null;
  sourceUrl: string | null;
  notes: string | null;
};

export type SrThesesBlock = {
  schemaVersion: '2.0';
  source: string;
  symbol: string;
  brief: {
    briefId: string;
    sourceRecordedAtIso: string | null;
    summary: string | null;
  };
  capturedAtIso: string;
  capturedAtUnixMs: number;
  theses: SrThesisDto[];
};
```

Do not hard-code `bias`, `setupType`, or `sourceReliability` as enums. Runtime validation must accept unknown non-empty strings and nullable values. UI may normalize known strings for tone only.

Add an application-owned port:

```ts
export type SrThesesReadResult =
  | { kind: 'block'; block: SrThesesBlock }
  | { kind: 'not-found' }
  | { kind: 'config-error' }
  | { kind: 'upstream-error' };

export interface SrThesesReadPort {
  fetchCurrent(symbol: string, source: string): Promise<SrThesesReadResult>;
}
```

The adapter implements this application port. Application code must not import adapter-local types.

## BFF Contract

Add:

```http
GET /sr-theses/pools/:poolId/current
```

Unsupported pools return `404 Not Found`.

Supported pools always return `200` with one of:

```ts
type SrThesesResponse = {
  srTheses: SrThesesBlock | null;
  unavailableReason?: 'not-found' | 'config-error' | 'upstream-error';
};
```

Response mapping:

| Scenario                                                        | BFF response                                              |
| --------------------------------------------------------------- | --------------------------------------------------------- |
| Valid upstream block with at least one thesis                   | `{ srTheses: block }`                                     |
| Upstream `404` no theses found                                  | `{ srTheses: null, unavailableReason: "not-found" }`      |
| Upstream `200` with empty `theses` array                        | `{ srTheses: null, unavailableReason: "not-found" }`      |
| Missing or invalid BFF v2 feed config                           | `{ srTheses: null, unavailableReason: "config-error" }`   |
| Upstream `400` validation error                                 | `{ srTheses: null, unavailableReason: "config-error" }`   |
| Upstream `503`, `5xx`, timeout, network failure, malformed body | `{ srTheses: null, unavailableReason: "upstream-error" }` |

`404` is reserved for unsupported app pools only. "No theses yet" for a supported pool is not an HTTP 404 to the browser.

## V2 Allowlist

Keep source selection server-owned:

```ts
export const SR_THESES_POOL_ALLOWLIST_MAP = new Map<string, { symbol: string; source: string }>([
  ['Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE', { symbol: 'SOL/USDC', source: 'openclaw' }],
]);
```

This allowlist is separate from:

- `SR_LEVELS_POOL_ALLOWLIST_MAP`, which preserves the v1 flat S/R route.
- `REGIME_POOL_ALLOWLIST_MAP`, which preserves the regime route.

Do not add a public route that accepts arbitrary `symbol` or `source`.

## Adapter Design

`CurrentSrThesesAdapter` fetches:

```text
GET ${REGIME_ENGINE_BASE_URL}/v2/sr-levels/current?symbol=SOL%2FUSDC&source=openclaw
```

Requirements:

- Build URLs with `URL` and `searchParams`, guarded against malformed `REGIME_ENGINE_BASE_URL`.
- Use a short timeout consistent with existing regime-engine read adapters.
- Retry once with short backoff for timeout, network, `503`, `5xx`, and malformed response cases.
- Do not retry `400` validation errors or `404` no-theses responses.
- Validate the full v2 response shape before returning a block.
- Convert `capturedAtIso` to `capturedAtUnixMs` and reject unparseable `capturedAtIso`.
- Treat an empty `theses` array as `not-found`.
- Accept unknown strings for `bias`, `setupType`, and `sourceReliability`.
- Preserve nullable string fields as `null`.
- Do not send auth headers; the v2 read endpoint does not require auth.
- Log config and upstream failures through `ObservabilityPort` without leaking secrets.

Expected upstream query:

```http
GET $REGIME_ENGINE_BASE_URL/v2/sr-levels/current?symbol=SOL/USDC&source=openclaw
```

## App Client

Add `apps/app/src/api/srTheses.ts`.

Client behavior:

- Calls only `/sr-theses/pools/:poolId/current`.
- Throws `SrThesesUnsupportedPoolError` for BFF `404`.
- Validates valid `200` response envelopes.
- Returns `{ srTheses, unavailableReason }`.
- Accepts open strings for `bias`, `setupType`, and `sourceReliability`.
- Rejects malformed response bodies with controlled errors.
- Uses the same timeout and abort-error handling pattern as `srLevels.ts` and `regime.ts`.

Positions route query:

```ts
const srThesesQuery = useQuery({
  queryKey: ['sr-theses-current', poolId],
  queryFn: () => fetchCurrentSrTheses(poolId!),
  enabled: poolId != null,
  staleTime: 5 * 60 * 1000,
  refetchOnWindowFocus: false,
  refetchOnMount: true,
  retry: (failureCount, error) =>
    !(error instanceof SrThesesUnsupportedPoolError) && failureCount < 1,
  retryDelay: 1000,
});
```

This query runs beside the existing v1 S/R and regime queries. It must not block position rendering.

## UI Composition

`SrInsightsSection` becomes the orchestrator for S/R analysis:

1. If v2 theses are present, render v2 thesis content and hide v1 S/R content.
2. If v2 theses are unavailable and v1 `srLevels` exists, render the current v1 `SrLevelsCard` fallback.
3. If neither v2 nor v1 data exists, render unavailable copy based on the best available reason.

User-facing unavailable copy:

| State                                                 | Copy                                          |
| ----------------------------------------------------- | --------------------------------------------- |
| v2 `not-found`, no v1 fallback                        | `No S/R analysis available yet`               |
| v2 `config-error` or `upstream-error`, no v1 fallback | `S/R analysis unavailable`                    |
| v1-only unsupported/error/null with no v2 data        | `S/R analysis unavailable`                    |
| mixed pools                                           | Preserve existing mixed-pool unavailable copy |

When cached v2 data is shown while a refresh fails, render:

```text
Refresh failed - showing last available analysis.
```

Use an ASCII hyphen in this new copy.

## V2 View Model

Add a v2 view-model module, for example `packages/ui/src/view-models/SrThesesViewModel.ts`.

It should produce:

- brief summary and source/freshness labels
- thesis cards sorted by recency
- selected thesis ID or index
- first 3 visible thesis cards by default
- remaining thesis count for "Show more"
- collapsed raw-thesis state inputs
- neutral presentation for unknown `bias`, `setupType`, or `sourceReliability`
- UI-ready overlay data for the selected thesis

Recency order:

1. Parse `publishedAt`.
2. If unavailable, parse `collectedAt`.
3. If unavailable, parse block `capturedAtIso`.
4. If no parseable timestamp exists, sort last.

`sourceReliability` is displayed when present but is not used for initial sorting or selection.

## V2 Thesis UI

Add presentational components under `packages/ui/src/components/`, for example:

- `SrThesesPanel`
- `SrThesisCard`

The panel renders:

- brief summary when present
- source label from block `source`
- relative freshness from `capturedAtIso`
- one thesis card per visible thesis
- "Show more" control when there are more than 3 theses

Each thesis card renders:

- bias badge
- setup type
- timeframe
- support levels
- resistance levels
- entry zone
- targets
- invalidation
- trigger condition
- source handle
- source kind
- source reliability
- published or collected timestamp when available
- optional source URL
- optional chart reference
- expandable raw thesis text

Known bias values may map to tone for presentation only:

- bullish-like -> safe/accent
- bearish-like -> breach/warn
- neutral/range/chop-like -> neutral/warn
- unknown -> neutral

No validation or rendering path may reject an unknown value.

## Overlay Model

The view model should derive a UI-ready overlay model from the selected thesis, but no visual chart overlay is rendered in this issue.

Overlay model guidance:

- `supportLevels` become support overlay levels.
- `resistanceLevels` become resistance overlay levels.
- `targets` become target overlay levels.
- `invalidation` becomes invalidation overlay data.
- `entryZone` becomes a range only when parseable; otherwise preserve display text only.
- Strings that cannot be parsed into numeric levels remain visible in cards but are omitted from numeric overlay coordinates.
- Multiple theses do not produce combined overlays. Only the selected thesis drives the overlay model.

This keeps issue #65 ready for a future chart without expanding current UI scope.

## Error Handling

V2 S/R theses are optional market context:

- Positions still render when v2 fails.
- V1 S/R still renders when v2 fails and v1 data exists.
- Regime still renders independently.
- Unsupported pools do not retry.
- Supported-pool no-data is not an exception path in the app.
- Upstream regime-engine errors retry once inside the adapter.
- Browser-to-BFF network errors retry once through TanStack Query.
- Cached v2 data is preserved by TanStack Query during background refresh failures.

No error path changes exit behavior.

## Testing Strategy

### Application

- DTO exports include `SrThesisDto` and `SrThesesBlock`.
- Public exports expose the v2 DTOs for app and UI use.
- Internal exports expose `SrThesesReadPort` and `SrThesesReadResult`.
- Type tests or compile-time checks ensure open strings are not narrowed to enums.

### Adapter

Test `CurrentSrThesesAdapter` for:

- happy-path v2 payload
- URL path `/v2/sr-levels/current`
- URL-encoded `symbol` and `source`
- no auth headers
- malformed base URL -> `config-error`
- missing `REGIME_ENGINE_BASE_URL` -> `config-error`
- `404` -> `not-found`
- empty `theses` -> `not-found`
- `400` validation error -> `config-error`
- `503`, `5xx`, timeout, network error -> retry once, then `upstream-error`
- retry succeeds on the second attempt
- malformed JSON -> retry once, then `upstream-error`
- malformed response shape -> retry once, then `upstream-error`
- invalid `capturedAtIso` -> `upstream-error`
- unknown `bias`, `setupType`, and `sourceReliability` strings are preserved
- nullable fields are preserved as `null`

### BFF

Test `SrThesesController` for:

- allowlisted pool returns `{ srTheses: block }`
- allowlisted pool maps `not-found`
- allowlisted pool maps `config-error`
- allowlisted pool maps `upstream-error`
- unsupported pool throws `NotFoundException`
- allowlist resolves SOL/USDC to `source: "openclaw"`

Test module wiring:

- `SrThesesController` is registered.
- `SR_THESES_READ_PORT` points to `CurrentSrThesesAdapter`.
- `SR_THESES_POOL_ALLOWLIST` is registered separately from v1 S/R and regime allowlists.

### App API

Test `fetchCurrentSrTheses` for:

- valid block response
- valid null response with each unavailable reason
- unsupported pool typed error
- endpoint 404 without unsupported body -> controlled endpoint-not-found error
- 5xx generic error
- timeout error
- malformed envelope rejection
- malformed `srTheses` block rejection
- unknown string values accepted
- nullable string fields accepted

### UI View Model

Test v2 view-model behavior:

- recency sort uses `publishedAt`, then `collectedAt`, then block `capturedAtIso`
- unparseable thesis timestamps sort last
- `sourceReliability` does not affect sorting
- freshness label is derived from block `capturedAtIso`
- unknown bias/setup/reliability values use neutral display
- first 3 theses are visible by default
- remaining count is correct
- selected thesis defaults to most recent
- overlay model uses only selected thesis
- numeric overlay levels are produced only from parseable strings
- raw thesis text is represented as collapsed by default

### UI Components And Screen

Test:

- v2 thesis panel renders when v2 data exists
- v1 S/R card is hidden when v2 data exists
- v1 S/R card renders when v2 unavailable and v1 data exists
- `No S/R analysis available yet` renders for v2 `not-found` without fallback
- `S/R analysis unavailable` renders for config/upstream failures without fallback
- cached v2 data renders degraded refresh copy on error
- only 3 thesis cards render initially
- "Show more" reveals additional thesis cards
- raw thesis text expands per card
- brief summary and freshness render above cards
- unknown strings render without crashing
- `RegimeSection` remains independent and still renders below S/R context

### Verification

Run focused tests during implementation, then broader checks because the change crosses app, UI, application, and adapter packages:

```text
pnpm build
pnpm typecheck
pnpm lint
pnpm boundaries
pnpm test
```

## Rollout And Compatibility

This change is additive:

- Existing clients can continue calling `/sr-levels/pools/:poolId/current`.
- Existing v1 insight bundle consumers still receive `SrLevelsBlock | null`.
- Existing S/R note parsing remains only for v1 fallback.
- New app builds can call `/sr-theses/pools/:poolId/current`.
- If v2 is unavailable in production, users still see v1 market context when available.

Deploy backend before relying on the new app query in a hosted environment. The app should treat endpoint-level 404 as a controlled transient deployment mismatch unless the BFF body clearly says the pool is unsupported.

## Boundaries And Invariants

- `packages/domain` remains unchanged.
- `packages/application` does not import adapters.
- `packages/ui` imports only `@clmm/application/public` and UI-local modules.
- `apps/app` does not import adapters and does not call regime-engine directly.
- `@solana/web3.js` is not involved.
- No on-chain receipt, attestation, proof, or claim-verification concepts are introduced.
- `DirectionalExitPolicyService` remains the sole owner of directional exit mapping.
