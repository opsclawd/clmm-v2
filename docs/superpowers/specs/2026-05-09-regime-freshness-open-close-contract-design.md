# Regime Freshness Open/Close Contract Design

## Source

GitHub issue: https://github.com/opsclawd/clmm-v2/issues/87
Upstream issue: https://github.com/opsclawd/regime-engine/issues/52 (closed; deployed)

## Goal

Adopt the new explicit Regime freshness contract from regime-engine. Replace the ambiguous `lastCandleIso` / `lastCandleUnixMs` fields with explicit candle open/close timestamps across the full slice — DTO, adapter, app response validator, and UI view model. Switch the displayed "Latest closed candle Xm old" to a presentation-drift formula derived from upstream `ageSeconds` plus elapsed-since-generation, while keeping stale classification strictly upstream.

This is the consumer-side counterpart to upstream regime-engine #52, which is already shipped. The change is strict immediately — no tolerance window for the old shape.

## Scope

In scope:

- `packages/application/src/dto/regime.ts`: replace `RegimeFreshness`.
- `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.ts`: parse and validate the new upstream contract; reject the old shape.
- `apps/app/src/api/regime.ts`: update `isRegimeFreshnessBlock` to validate the new wire contract; reject the old shape.
- `packages/ui/src/view-models/RegimeViewModel.ts`: switch to display-drift age, change collapsed wording, expand the freshness rows to expose open/close.
- `packages/ui/src/components/RegimeSection.tsx`: fixture and copy adjustments only; the component remains a thin renderer.
- All affected tests across `application`, `adapters`, `app`, and `ui`.

Out of scope:

- No `packages/domain` changes; `DirectionalExitPolicyService` is untouched.
- No exit-policy, trigger, signing, execution, or reconciliation changes.
- No general human-readable duration formatter.
- No transitional dual-shape support in adapter or validator.

## Architectural Rules

1. **Strict new contract.** Old `lastCandleIso` / `lastCandleUnixMs` fields are rejected by _key presence_, not truthiness. A payload containing those keys with `null`, `undefined`, `0`, or any value is rejected.
2. **No domain changes.** Freshness semantics stay defined upstream; clmm-v2 only consumes the contract.
3. **Boundary-only ISO parsing.** `Date.parse` is allowed in the adapter and app response validator (contract boundaries). `RegimeViewModel` consumes Unix-ms fields only and must not call `Date.parse`.
4. **Stale classification is upstream-only.** UI must not infer `softStale` / `hardStale` from any locally-computed age.

## DTO

`packages/application/src/dto/regime.ts`:

```ts
export type RegimeFreshness = {
  generatedAtUnixMs: number;
  generatedAtIso: string;
  lastCandleOpenUnixMs: number;
  lastCandleOpenIso: string;
  lastCandleCloseUnixMs: number;
  lastCandleCloseIso: string;
  ageSeconds: number; // upstream-defined: seconds since candle close
  softStale: boolean;
  hardStale: boolean;
  softStaleSeconds: number;
  hardStaleSeconds: number;
};
```

Each `*Iso` and `*UnixMs` pair represents the same instant. The adapter is responsible for ensuring this on emission; the app response validator re-checks parity on the wire.

## Adapter

`packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.ts`.

The upstream payload includes **5 timestamp fields**:

- `generatedAtIso`
- `lastCandleOpenUnixMs`
- `lastCandleOpenIso`
- `lastCandleCloseUnixMs`
- `lastCandleCloseIso`

The adapter derives `generatedAtUnixMs` from `generatedAtIso` and emits **6 DTO timestamp fields**.

### Strict ISO 8601 format

```ts
const ISO_8601_UTC_OR_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
function isStrictIso(value: unknown): value is string {
  return typeof value === 'string' && ISO_8601_UTC_OR_OFFSET.test(value);
}
```

`Date.parse` accepts many non-ISO strings (e.g. `"May 9 2026 02:00:00 GMT"`). The contract is strict ISO 8601 with UTC `Z` or `±HH:MM` offset.

### Age-parity tolerance

```ts
// Allowed skew between upstream ageSeconds and (generatedAtUnixMs - lastCandleCloseUnixMs)/1000.
// Covers normal generation-time jitter; raise only with evidence regime-engine needs more.
const AGE_PARITY_TOLERANCE_SECONDS = 2;
```

### Recognized timeframes

```ts
const RECOGNIZED_TIMEFRAME_MS: Readonly<Record<string, number>> = {
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  '1d': 24 * 60 * 60_000,
};
```

### Validation rules

In `parseUpstream`, after structural parsing of the freshness object:

1. **Old-shape rejection by key presence.** Reject if `Object.prototype.hasOwnProperty.call(freshness, 'lastCandleIso')` or `... 'lastCandleUnixMs'` is true. Includes `null` / `undefined` values.
2. **`generatedAtIso`**: `isStrictIso`, parseable, `Date.parse` finite and `> 0`. Derive `generatedAtUnixMs`.
3. **`lastCandleOpenIso` / `lastCandleCloseIso`**: `isStrictIso`, parseable.
4. **`lastCandleOpenUnixMs` / `lastCandleCloseUnixMs`**: finite numbers, `> 0`.
5. **ISO/MS parity for candle open**: `Date.parse(lastCandleOpenIso) === lastCandleOpenUnixMs`. Real upstream validation since both forms are sent.
6. **ISO/MS parity for candle close**: same.
7. **Window order**: `lastCandleCloseUnixMs > lastCandleOpenUnixMs` (strict; equality rejected).
8. **Generation order**: `generatedAtUnixMs >= lastCandleCloseUnixMs`.
9. **Age parity**: `Math.abs(ageSeconds - Math.floor((generatedAtUnixMs - lastCandleCloseUnixMs) / 1000)) <= AGE_PARITY_TOLERANCE_SECONDS`.
10. **Timeframe duration** (recognized values only): given `tfKey = metadata.derivedTimeframe ?? metadata.timeframe`, if `tfKey in RECOGNIZED_TIMEFRAME_MS`, require `lastCandleCloseUnixMs - lastCandleOpenUnixMs === RECOGNIZED_TIMEFRAME_MS[tfKey]`. Unknown timeframes skip silently — no rejection for future labels.
11. Existing checks unchanged: `ageSeconds >= 0`, `softStale` / `hardStale` are booleans, `softStaleSeconds > 0`, `hardStaleSeconds > softStaleSeconds`.

On any failure: log via `observability.log('warn', 'Regime upstream freshness payload rejected', { reason })` and return `{ kind: 'upstream-error' }`.

The adapter emits both `*Iso` and `*UnixMs` for all three timestamps in the DTO. For `generatedAt`, the ISO form is the upstream string and the ms form is the parsed value — no further parity check is needed since both derive from one input.

## App Response Validator

`apps/app/src/api/regime.ts`, `isRegimeFreshnessBlock`.

This validator runs at the BFF→client hop, where **all six** DTO fields arrive over the wire.

Validation rules:

1. **Old-shape rejection by key presence**: same matrix as adapter.
2. Required numeric fields, all positive finite: `generatedAtUnixMs`, `lastCandleOpenUnixMs`, `lastCandleCloseUnixMs`.
3. Required ISO fields, all `isStrictIso`-passing strings: `generatedAtIso`, `lastCandleOpenIso`, `lastCandleCloseIso`.
4. **ISO/MS parity for all three pairs**, including `generatedAt` (since both forms travel here): `Date.parse(generatedAtIso) === generatedAtUnixMs`, and same for open/close.
5. `lastCandleCloseUnixMs > lastCandleOpenUnixMs`.
6. `generatedAtUnixMs >= lastCandleCloseUnixMs`.
7. Existing freshness checks unchanged.

The strict-ISO regex helper is duplicated locally in this package (no shared util layer for cross-package parsing primitives).

## UI View Model

`packages/ui/src/view-models/RegimeViewModel.ts`.

### Display-age formula

```ts
const elapsedSinceGenerated = Math.max(
  0,
  Math.floor((now - block.freshness.generatedAtUnixMs) / 1000),
);
const displayAgeSeconds = block.freshness.ageSeconds + elapsedSinceGenerated;
```

This preserves the live-tick behavior introduced in commit `01b2d83` while honoring the new "age from candle close" semantics. Upstream `ageSeconds` is the authoritative base; the UI only adds presentation drift.

### Collapsed wording

```ts
latestCandleAgeLabel = `Latest closed candle is ${formatMinutesAgo(displayAgeSeconds * 1000)} old`;
```

### Expanded freshness rows

`buildFreshnessRows` returns exactly:

1. `Latest candle open` — formatted via `formatCandleClockTime`.
2. `Latest candle close` — formatted via `formatCandleClockTime`.
3. `Latest closed candle age` — `${formatMinutesAgo(displayAgeSeconds * 1000)} old`. Tone derived from upstream `softStale` / `hardStale`.
4. `Soft stale threshold` — existing `Math.round(seconds / 60)m` formatter (unchanged from #86).
5. `Hard stale threshold` — same.

No `Latest candle` row exists.

### `formatCandleClockTime` (deterministic, injectable)

```ts
type ClockFormatOptions = { locale?: string; timeZone?: string };

function formatCandleClockTime(unixMs: number, now: number, opts?: ClockFormatOptions): string;
```

- Production calls omit `opts`, getting host locale and timezone via `Intl.DateTimeFormat`.
- Tests pass `{ locale: 'en-US', timeZone: 'UTC' }` (or other fixed values) to pin output.
- Time portion: 24-hour `HH:MM` using `Intl.DateTimeFormat(locale, { timeZone, hour: '2-digit', minute: '2-digit', hour12: false })`.
- "Today" comparison: format both `unixMs` and `now` with `{ year:'numeric', month:'numeric', day:'numeric' }` in the same `{ locale, timeZone }`; equal strings means same day in that zone.
- Different day: prefix with `Intl.DateTimeFormat(locale, { timeZone, month:'short', day:'numeric' })` followed by a comma+space, then HH:MM. Pin exact strings in tests via string equality (no regex).

### `buildRegimeViewModelBlock` signature

```ts
export function buildRegimeViewModelBlock(
  block: RegimeBlock,
  now: number,
  opts?: ClockFormatOptions,
): RegimeViewModelBlock;
```

`opts` threads through to `formatCandleClockTime`. View-model output type is unchanged in shape — `expandedFreshnessRows` simply contains the new five rows.

### Stale-tone independence (architectural rule)

`classifyDataQuality` continues to consume only `block.freshness.softStale` / `block.freshness.hardStale`. The "Latest closed candle age" row's tone is computed from those upstream booleans, not from `displayAgeSeconds`. A block with `softStale=false`, `hardStale=false`, and a synthetically high `ageSeconds` must still render as `Fresh` / `success`.

### No ISO parsing in the view model

`RegimeViewModel` consumes `generatedAtUnixMs`, `lastCandleOpenUnixMs`, `lastCandleCloseUnixMs` only. It must not call `Date.parse` on the ISO fields. The HH:MM formatter uses `new Date(unixMs)` from the ms field.

## UI Component

`packages/ui/src/components/RegimeSection.tsx` is already a thin renderer of view-model rows. No logic changes; only test fixtures and rendered-text expectations update.

## Test Plan

### `packages/application/src/public/regime.exports.test.ts`

Mirror the existing `capturedAtUnixMs` negative-test pattern:

- `expectTypeOf<RegimeFreshness>().not.toHaveProperty('lastCandleUnixMs')`.
- `expectTypeOf<RegimeFreshness>().not.toHaveProperty('lastCandleIso')`.
- `expectTypeOf<RegimeFreshness>().toHaveProperty('lastCandleOpenUnixMs')`.
- `expectTypeOf<RegimeFreshness>().toHaveProperty('lastCandleOpenIso')`.
- `expectTypeOf<RegimeFreshness>().toHaveProperty('lastCandleCloseUnixMs')`.
- `expectTypeOf<RegimeFreshness>().toHaveProperty('lastCandleCloseIso')`.
- `expectTypeOf<RegimeFreshness>().toHaveProperty('generatedAtIso')`.
- `expectTypeOf<RegimeFreshness>().toHaveProperty('generatedAtUnixMs')`.
- Runtime sample-block fixture updated to the new freshness shape.

### `packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.test.ts`

Upstream `SAMPLE_UPSTREAM` updated to the 5-timestamp shape.

- **Parses new contract**: maps 5 upstream timestamp fields to 6 DTO timestamp fields; ISO and ms forms agree.
- **`generatedAtIso` parseability**: rejects unparseable string.
- **`generatedAtIso` ISO format strictness**: rejects `Date.parse`-able non-ISO strings (e.g. `"May 9 2026 02:00:00 GMT"`).
- **`generatedAt >= close`**: rejects when `generatedAtUnixMs < lastCandleCloseUnixMs`.
- **Age parity within tolerance**: 1s skew accepted.
- **Age parity outside tolerance**: 3s skew rejected, 60s skew rejected.
- **Old-shape rejection by key presence (matrix)** for both `lastCandleIso` and `lastCandleUnixMs`:
  - Value `'foo'` → reject.
  - Value `null` → reject.
  - Value `undefined` (key explicitly set) → reject.
  - Value `0` (for `lastCandleUnixMs`) / `''` (for `lastCandleIso`) → reject.
- **`lastCandleCloseUnixMs <= lastCandleOpenUnixMs`**: equality rejected, reversed rejected.
- **ISO/MS parity for candle open**: rejects when `Date.parse(lastCandleOpenIso) !== lastCandleOpenUnixMs`.
- **ISO/MS parity for candle close**: same.
- **ISO format validity for candle ISOs**: rejects `Date.parse`-able non-ISO strings for each.
- **Timeframe duration mismatch on recognized values**: `derivedTimeframe='1h'` with 30m close-open rejected; `'15m'` with 60m close-open rejected.
- **Unknown timeframe skips validation**: `derivedTimeframe='7m'` with arbitrary positive close-open accepted.
- **Derived 1h golden case**: open `2026-05-09T01:00:00Z`, close `2026-05-09T02:00:00Z`, generated `2026-05-09T02:48:00Z`, `ageSeconds=2880`, `derivedTimeframe='1h'` — passes; close-open is exactly `3_600_000`.
- Existing tests for negative `ageSeconds`, threshold ordering, suitability, market reasons — kept and adapted.

(No adapter test for `generatedAt` ISO/MS parity — upstream sends only `generatedAtIso`.)

### `packages/adapters/src/outbound/regime-engine/RegimeBlockParity.test.ts`

Fixture update; assert close-open is positive and both candle ISO fields are present.

### `packages/adapters/src/inbound/http/RegimeController.test.ts`

Mechanical fixture update.

### `apps/app/src/api/regime.test.ts`

- Fixture update.
- **Accepts new shape** end-to-end.
- **Old-shape rejection by key presence (matrix)**: same as adapter, for both legacy fields.
- **Missing-field rejections**: each of the 6 timestamp fields removed individually triggers rejection.
- **ISO/MS parity violations** for `generatedAt`, `lastCandleOpen`, `lastCandleClose` — three separate cases.
- **ISO format validity**: parseable-but-non-ISO strings rejected for each of the three ISO fields.
- **`lastCandleCloseUnixMs <= lastCandleOpenUnixMs`**: equality rejected, reversed rejected.
- **`generatedAtUnixMs < lastCandleCloseUnixMs`**: rejected.
- Existing `capturedAtUnixMs` rejection test kept as a sibling regression case.

### `packages/ui/src/view-models/RegimeViewModel.test.ts`

Fixture: `LAST_CANDLE_OPEN`, `LAST_CANDLE_CLOSE`, `GENERATED`, `AGE_SECONDS`. All `buildRegimeViewModelBlock` calls pass `{ locale: 'en-US', timeZone: 'UTC' }`.

- **Collapsed wording**: `latestCandleAgeLabel === 'Latest closed candle is 48m old'` for `ageSeconds=2880`, `now=generatedAt`.
- **Display-age at generation**: `now - generatedAtUnixMs = 0`, `ageSeconds=2880` → `'48m'`.
- **Display-age +60s**: `now - generatedAtUnixMs = 60_000` → `'49m'`.
- **Display-age clamp**: `now < generatedAtUnixMs` → `displayAgeSeconds === ageSeconds` (elapsed clamped via `Math.max(0, ...)`).
- **Stale independence (explicit)**: a block with `softStale=false`, `hardStale=false`, `softStaleSeconds=4500`, `hardStaleSeconds=5400`, `ageSeconds=10_000` (well above hard threshold) renders `dataQualityLabel='Fresh'`, `dataQualityTone='success'`, and the "Latest closed candle age" row's tone is `'default'`. Even when presentation `displayAgeSeconds` exceeds stale thresholds, data-quality and tone follow upstream booleans only.
- **Expanded rows shape**: `expandedFreshnessRows.map((r) => r.label)` is exactly `['Latest candle open', 'Latest candle close', 'Latest closed candle age', 'Soft stale threshold', 'Hard stale threshold']`. No `'Latest candle'` row.
- **Open/close formatter — same day in UTC**: `formatCandleClockTime(<2026-05-09T02:00:00Z>, <2026-05-09T02:48:00Z>, { locale:'en-US', timeZone:'UTC' })` returns `'02:00'`.
- **Open/close formatter — different day in UTC**: open at `2026-05-08T23:00:00Z`, close at `2026-05-09T00:00:00Z`, `now=2026-05-09T00:30:00Z`, formatted with UTC. Both rows render with date prefixes; exact strings pinned via string equality.
- **`formatMinutesAgo` rounding (separate, narrowly-scoped tests)**: pin `Math.round` behavior — `29s → '0m'`, `30s → '1m'`, `89s → '1m'`, `90s → '2m'`. These are independent of the display-age tests so the +0s / +60s assertions don't depend on rounding boundaries.
- **Threshold formatting** (regression for #86): `4500s → '75m'`, `5400s → '90m'`, `7200s → '120m'`, `9000s → '150m'`.

(No "no `Date.parse` in view model" test — enforced by code review and by the architectural rule above.)

### `packages/ui/src/components/RegimeSection.test.tsx`

- Fixture update to new freshness shape.
- Asserts rendered output contains `'Latest closed candle is'`.
- Asserts the open/close timestamp strings produced by the formatter (with the same fixed UTC en-US options) appear in the expanded section.

## Verification

This change crosses four packages and changes a shared contract — broad checks per `AGENTS.md`:

```text
pnpm build
pnpm typecheck
pnpm lint
pnpm boundaries
pnpm test
```

Narrow filters during iteration:

```text
pnpm --filter @clmm/application test
pnpm --filter @clmm/adapters test
pnpm --filter @clmm/app test
pnpm --filter @clmm/ui test
```

## Acceptance Criteria (mapped from issue #87)

- clmm-v2 no longer expects `freshness.lastCandleUnixMs` — enforced by adapter, app validator, DTO type test, and view-model fixture.
- clmm-v2 no longer expects `freshness.lastCandleIso` — same.
- Regime DTO exposes `lastCandleOpenUnixMs`, `lastCandleOpenIso`, `lastCandleCloseUnixMs`, `lastCandleCloseIso` (and `generatedAtIso` / `generatedAtUnixMs`).
- Adapter validates and maps the new open/close freshness fields, including ISO/MS parity, window order, generation order, age parity, and recognized-timeframe duration.
- App response validator accepts the new contract and rejects the old ambiguous shape by key presence.
- `RegimeViewModel` uses upstream `ageSeconds` plus elapsed-since-generation for latest closed candle age; never computes age from raw timestamps.
- Collapsed card copy uses close-age wording: `Latest closed candle is Xm old`.
- Expanded freshness rows expose open and close timestamps as local `HH:MM` (with date prefix when not today).
- Threshold formatting remains exact minutes per issue #86.
- Tests cover a derived 1h response where open and close differ by 1h and age is measured from close.
- Tests prove old `lastCandleUnixMs` / `lastCandleIso` are not part of the public DTO and are rejected by both the adapter and app validator.
