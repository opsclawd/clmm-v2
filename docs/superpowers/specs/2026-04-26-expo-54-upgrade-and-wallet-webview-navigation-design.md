# Expo SDK 54 Upgrade and Wallet WebView Navigation — Design

- **Status:** Proposed
- **Date:** 2026-04-26
- **Issue:** [opsclawd/clmm-v2#39](https://github.com/opsclawd/clmm-v2/issues/39)
- **Blocker (closed):** [opsclawd/clmm-v2#38](https://github.com/opsclawd/clmm-v2/issues/38)
- **Owner:** TBD
- **Reviewers:** TBD

## Problem

`apps/app` runs on Expo 52 / Expo Router 4. To work around an Expo Router bug where `window.ReactNativeWebView` caused soft navigation to be misclassified inside wallet in-app browsers, PRs #16 and #18 introduced `navigateRoute()` and a `window.location` hard-navigation fallback for Phantom and other Solana mobile WebViews. That fallback in turn surfaced the reload/session-recovery bug fixed in #38.

The Expo Router fix lives in `expo-router >= 5.1.7` / `expo >= 53.0.23`. We are still on the buggy line. Until we move forward, we cannot tell whether the hard-navigation workaround is still load-bearing or whether SPA navigation is now safe in Phantom mobile and other Solana wallet browsers.

## Goal

Upgrade `apps/app` to Expo SDK 54.x (using `npx expo install --fix`), staying on the Legacy Architecture. Re-test wallet WebView navigation against a defined matrix. Record the resulting strategy decision in an ADR and expose the active strategy as a typed constant in `webNavigation.ts`. Preserve `navigateRoute()` and #38 wallet boot recovery without regression.

## Non-Goals

- Do not adopt the New Architecture in this issue.
- Do not combine this with #38 (already merged).
- Do not remove `navigateRoute()`.
- Do not remove or weaken the wallet boot status, `returnTo`, or browser-wallet restore logic introduced by #38.
- Do not assume wallet WebViews behave like ordinary Chrome/Safari after the upgrade. The decision is evidence-driven.
- Do not implement a capability-driven `navigateRoute()` (probe / allowlist / denylist) in this issue. If Outcome C is selected, this issue records evidence and opens a follow-up issue; capability-driven design is out of scope here.
- Do not upgrade unrelated architecture, backend, domain, application, or adapter code as part of this issue.
- Do not regenerate `pnpm-lock.yaml` from scratch. Use `pnpm install` + `pnpm dedupe` so the diff stays reviewable.

## Target Versions

Target Expo SDK 54.x. The exact dependency set is whatever `npx expo install --fix` derives for SDK 54 in this monorepo. SDK 54 was selected because:

- SDK 53 is the bare minimum for the wallet/in-app WebView Router fix and is already stale.
- SDK 55 drops Legacy Architecture support and moves to RN 0.83 / React 19.2, which is unrelated migration risk.
- SDK 54 clears the Router fix floor with margin and keeps Legacy Architecture available.

The Legacy Architecture is explicit, not implicit. `apps/app/app.json` (or `app.config.*`) sets:

```json
"newArchEnabled": false
```

If SDK 54 tooling hard-blocks Legacy Architecture, that is abort trigger #6.

## Architecture Summary

The wallet WebView navigation strategy becomes a typed, named, grep-able value in `webNavigation.ts`. Its current value is the source of truth for `navigateRoute()`. The reasoning behind the current value lives in an ADR. The two artifacts reference each other.

```
apps/app/src/platform/webNavigation.ts
  ├── WALLET_WEBVIEW_NAVIGATION_STRATEGY: 'soft-preferred' | 'hard-fallback' | 'capability-driven'
  └── navigateRoute() ── reads constant ──▶ branch
                                            ├── soft-preferred  → router.push / router.replace, hard-nav as fallback
                                            ├── hard-fallback   → window.location for Solana mobile WebViews (current behavior)
                                            └── capability-driven (stub in this issue) → falls back to hard-fallback; full design lives in follow-up

docs/decisions/<n>-wallet-webview-navigation.md
  ├── selected outcome (A / B / C)
  ├── evidence table (wallet × device × result)
  └── resulting constant value

webNavigation.ts docstring ──▶ docs/decisions/<n>-wallet-webview-navigation.md
ADR Resulting Behavior section ──▶ webNavigation.ts constant value
```

The capability-driven branch exists in the type union for future use but is implemented as a stub that throws or falls back to hard-navigation. Implementing it properly is the follow-up issue under Outcome C.

## Components

### `WALLET_WEBVIEW_NAVIGATION_STRATEGY`

A typed constant in `apps/app/src/platform/webNavigation.ts`:

```ts
/**
 * Active wallet WebView navigation strategy. The reasoning, validation
 * evidence, and selected outcome live in:
 *   docs/decisions/<n>-wallet-webview-navigation.md
 *
 * Any change to this constant MUST update or supersede that ADR.
 */
export const WALLET_WEBVIEW_NAVIGATION_STRATEGY:
  | 'soft-preferred'
  | 'hard-fallback'
  | 'capability-driven' = 'hard-fallback';
```

Defaults to `'hard-fallback'` (the current pre-upgrade behavior) so the upgrade can land without behavior change. Outcome A flips it to `'soft-preferred'` in the same PR.

### `navigateRoute()` branch shape

`navigateRoute()` reads the constant and dispatches:

- `'soft-preferred'`: prefer Expo Router (`router.push` / `router.replace`); only fall back to `window.location` when soft navigation fails or the platform is detected as a wallet WebView with a known soft-nav defect *and* the strategy is overridden per-call. (Specific overrides, if any, are determined during implementation; they are not new public API.)
- `'hard-fallback'`: current behavior — Solana mobile WebViews use `window.location`; other environments use Expo Router. No changes to UA detection in this issue.
- `'capability-driven'`: stub. Falls back to `'hard-fallback'` behavior with a runtime warning; a unit test asserts the stub does not throw in production but is flagged as not-yet-implemented.

`navigateRoute()` continues to normalize Expo route groups regardless of strategy.

### ADR `docs/decisions/<n>-wallet-webview-navigation.md`

The implementer picks `<n>` by incrementing the highest existing ADR number; if `docs/decisions/` does not yet exist, the implementer creates it. The ADR has the following sections:

1. **Status** — `Accepted` once the upgrade PR merges.
2. **Date** — date the upgrade PR is merged.
3. **Context** — one paragraph: why we upgraded (#39), what we needed to verify, what was at stake.
4. **Decision** — Outcome A (`soft-preferred`), Outcome B (`hard-fallback`), or Outcome C (`hard-fallback` as safe default + linked follow-up issue for `capability-driven`).
5. **Environment** — Expo SDK version, Expo Router version, React Native version, Reanimated version, NativeWind version, tester device(s), wallet versions where known.
6. **Evidence Table** — one row per validation matrix entry, with allowed Result values `Pass`, `Fail`, `Not tested`. Best-effort wallets that were not reachable get `Not tested`, never blank or `Pass`. Columns: Wallet/Browser, Device/OS, Wallet version, Result, Evidence (note + screenshot/recording link), Tester, Date.
7. **Resulting Behavior** — explicit value of `WALLET_WEBVIEW_NAVIGATION_STRATEGY` and one paragraph describing what `navigateRoute()` does in this state.
8. **Follow-Up** — links to follow-up issues (e.g., capability-driven `navigateRoute()` for Outcome C).
9. **Reversibility** — "If a future Expo upgrade or wallet change invalidates this decision, the next change to `WALLET_WEBVIEW_NAVIGATION_STRATEGY` MUST update or supersede this ADR."

### Tests

`apps/app/src/platform/webNavigation.test.ts` is extended:

- Existing route-group normalization tests still pass.
- One test per strategy value asserts the expected branch is taken.
- Under `'soft-preferred'`, desktop browser with Solana extension uses Expo Router soft navigation.
- Under `'hard-fallback'`, Solana mobile WebView uses `window.location`.
- Under `'capability-driven'`, the stub falls back to hard-navigation behavior without throwing in production.
- Existing UA-detection helpers retain their unit-test coverage.

No new tests are required for `walletSessionStore`, `WalletBootProvider`, or `RequireWallet`. #38's existing tests guard those surfaces; the upgrade simply must not regress them.

## Sequencing — One Upgrade PR

1. Create branch `feat/expo-54-upgrade` using `git worktree` per repo convention.
2. Run the upgrade flow:
   ```bash
   npx expo install expo@~54
   npx expo install --fix
   npx expo-doctor
   pnpm install
   pnpm dedupe
   ```
3. Make automated checks green: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm boundaries`, `pnpm test`.
4. Add the `WALLET_WEBVIEW_NAVIGATION_STRATEGY` typed constant defaulted to `'hard-fallback'`. Refactor `navigateRoute()` to read the constant. No behavior change yet.
5. Run the validation matrix on the dev/preview build:
   - **Merge-blocking**: Phantom mobile (in-app browser); Desktop Chrome + Phantom extension.
   - **ADR-required**: Mobile Chrome / Safari outside any wallet browser.
   - **Best-effort**: Solflare mobile, Backpack mobile, Jupiter mobile.
6. Author `docs/decisions/<n>-wallet-webview-navigation.md` and populate the evidence table.
7. Apply the chosen outcome:
   - **Outcome A** — flip the constant to `'soft-preferred'`; update `navigateRoute()` so hard-nav is the fallback path; re-run the merge-blocking matrix rows on the changed build and update the ADR.
   - **Outcome B** — leave the constant at `'hard-fallback'`; the ADR documents why the upgrade did not remove the need for the workaround.
   - **Outcome C** — leave the constant at `'hard-fallback'` as a safe default; ADR records evidence; **open a follow-up issue** for capability-driven `navigateRoute()` and link it from the ADR.
8. Open the PR. The PR description links the ADR and lists the merge-blocking matrix rows with their results.

The upgrade and the navigation decision ship in a single PR. Splitting them creates a window in which `main` runs SDK 54 with an unvalidated navigation strategy, which is the same hazard #38 just rescued the team from.

## Validation Matrix and Gating

Tiered gates:

**Merge-blocking:**
- Automated checks pass: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm boundaries`, `pnpm test`, `npx expo-doctor` (no unresolved criticals).
- Phantom mobile in-app browser:
  - Root `/` loads and routes correctly.
  - `/connect` flow completes.
  - Successful wallet connect routes to the expected destination without bouncing back to `/connect`.
  - Position list → position detail → preview → signing → execution result navigation works.
  - Direct open of `/position/:id`, `/preview/:triggerId`, `/signing/:attemptId` after wallet restore stays on the requested route.
  - Manual refresh on protected routes does not falsely redirect to `/connect` (regression check for #38).
- Desktop Chrome + Phantom extension:
  - Soft navigation works.
  - Wallet connect works.
  - Direct route loads work.
  - No unexpected hard reloads on normal navigation.
- ADR `docs/decisions/<n>-wallet-webview-navigation.md` is committed in the PR with the merge-blocking rows populated and an outcome selected.

**ADR-required, not merge-blocking:**
- Mobile Chrome / Safari outside any wallet browser smoke test (app loads, no false Solana WebView detection, redirects to connect where appropriate).
- Direct-route / refresh behavior notes.

**Best-effort:**
- Solflare mobile in-app browser.
- Backpack mobile in-app browser.
- Jupiter mobile in-app browser.

If a best-effort wallet was not reachable, its row records `Not tested`. It is never recorded as `Pass` by default and the row is never left blank.

## Abort Triggers and Rollback

The upgrade is aborted if any of the following is hit and cannot be resolved within scope:

1. Reanimated incompatibility — no SDK 54 compatible Reanimated version supports the Legacy Architecture.
2. `expo-doctor` reports a critical issue with no resolution path inside the SDK bump scope.
3. `@solana/connector`, `@solana-mobile/*`, or wallet-standard packages require breaking source changes to consume.
4. NativeWind / Tailwind compatibility break that requires rewriting style code beyond config tweaks.
5. `pnpm test` cannot be made green without modifying application code unrelated to the SDK bump.
6. New Architecture is hard-required by the SDK 54 toolchain (contradicts the locked-in Legacy Architecture posture).
7. Static web build / Cloudflare deployment cannot be restored without changing deployment architecture.

**Rollback procedure on hit:**
- Abort the branch.
- Restore `apps/app/package.json` (and any other touched `package.json`s) from `main`.
- Restore `pnpm-lock.yaml` from `main`.
- Restore `apps/app/app.json` (or `app.config.*`) from `main`.
- Restore any touched Metro / Babel / NativeWind / Reanimated config from `main`.
- Run `pnpm install --frozen-lockfile` to verify the workspace returns to its prior state.
- File a follow-up issue capturing: the failure mode, package versions involved, the exact command that failed, and a stack trace where applicable.

## Acceptance Criteria

**Merge-blocking:**
- `apps/app/package.json` reflects Expo SDK 54.x as derived by `npx expo install --fix`. No hand-pinned versions outside the Expo-resolved set.
- `apps/app/app.json` (or `app.config.*`) explicitly sets `newArchEnabled: false`.
- `pnpm install --frozen-lockfile` succeeds on a clean clone.
- `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm boundaries`, `pnpm test` all pass.
- `npx expo-doctor` reports no critical issues without a documented resolution.
- `WALLET_WEBVIEW_NAVIGATION_STRATEGY` exists in `webNavigation.ts` with the three-value union, with a docstring linking the ADR.
- `navigateRoute()` reads the constant; behavior under each value is unit-tested.
- Phantom mobile validation matrix rows complete with `Pass`/`Fail` recorded in the ADR.
- Desktop Chrome + Phantom extension validation matrix rows complete with `Pass`/`Fail` recorded in the ADR.
- ADR `docs/decisions/<n>-wallet-webview-navigation.md` is committed in this PR with an outcome selected (A or B, or C with a linked follow-up issue).
- PR description links the ADR and lists merge-blocking matrix rows with results.

**ADR-required, not merge-blocking:**
- Mobile Chrome / Safari smoke test row recorded.
- Direct-route / refresh behavior notes captured.

**Best-effort:**
- Solflare / Backpack / Jupiter mobile rows are present with `Pass`, `Fail`, or `Not tested` — never blank.

**Regression bar:**
- All #38 wallet boot behaviors verified intact via the Phantom mobile matrix rows: reload-recovery, `returnTo` preservation, `WalletBootStatus` precedence, native-session unchanged. Any failure here is treated as a hard fail of the upgrade.
- Directional invariant from `AGENTS.md` is not touched by this surface.

## Definition of Done

The app runs on Expo SDK 54.x with the Legacy Architecture. Phantom mobile navigation behavior is re-verified against recorded evidence. The wallet WebView navigation strategy is intentionally retained or reduced based on that evidence and is exposed as a typed constant in `webNavigation.ts`. The ADR is committed alongside the upgrade and references the constant; the constant references the ADR. #38's reload-safe wallet boot still passes its matrix rows.
