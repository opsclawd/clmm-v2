# 0001 — Wallet WebView Navigation Strategy

- **Status:** Accepted
- **Date:** 2026-04-26
- **Issue:** [opsclawd/clmm-v2#39](https://github.com/opsclawd/clmm-v2/issues/39)
- **Spec:** docs/superpowers/specs/2026-04-26-expo-54-upgrade-and-wallet-webview-navigation-design.md
- **Code:** apps/app/src/platform/webNavigation.ts (`WALLET_WEBVIEW_NAVIGATION_STRATEGY`)

## Context

Expo Router fixed a wallet/in-app WebView soft-navigation defect in `expo-router >= 5.1.7` / `expo >= 53.0.23`. The CLMM V2 app worked around the defect with `window.location` hard navigation for Solana mobile WebViews (PRs #16 and #18). The reload bug that workaround caused was fixed independently in #38. Issue #39 upgrades the app to Expo SDK 54.x and re-evaluates whether the hard-navigation workaround is still needed.

## Decision

Selected outcome: **Outcome A**.

Resulting `WALLET_WEBVIEW_NAVIGATION_STRATEGY` value: `soft-preferred`.

## Environment

- Expo SDK: 54.0.23
- Expo Router: 6.0.23
- React Native: 0.81.5
- React: (Expo-managed)
- Reanimated: 4.1.7
- NativeWind: 4.0.0
- Legacy Architecture: enabled (`newArchEnabled: false`)
- `expo-doctor`: clean (17/17 checks passed, no issues)

## Evidence Table

| Wallet / Browser              | Device / OS              | Wallet ver. | Result | Evidence              | Tester | Date       |
|-------------------------------|--------------------------|-------------|--------|-----------------------|--------|------------|
| Phantom mobile (in-app)       | iOS/Android (mobile)     | Latest      | Pass   | Confirmed soft nav works in Phantom mobile in-app browser | Gary | 2026-04-26 |
| Desktop Chrome + Phantom ext. | macOS                    | Latest      | Pass   | Desktop Chrome + Phantom extension works correctly | Gary | 2026-04-26 |
| Mobile Chrome (no wallet)     | iOS/Android (mobile)     | n/a         | Not tested | Out of scope for merge-blocking validation | - | - |
| Mobile Safari (no wallet)     | iOS (mobile)             | n/a         | Not tested | Out of scope for merge-blocking validation | - | - |
| Solflare mobile              | n/a                      | --          | Not tested | Best-effort wallet, not reachable for validation | - | - |
| Backpack mobile              | n/a                      | --          | Not tested | Best-effort wallet, not reachable for validation | - | - |
| Jupiter mobile               | n/a                      | --          | Not tested | Best-effort wallet, not reachable for validation | - | - |

`Pass`, `Fail`, and `Not tested` are the only allowed Result values.

## Resulting Behavior

`WALLET_WEBVIEW_NAVIGATION_STRATEGY = 'soft-preferred'`. `navigateRoute()` dispatches to `navigateSoftPreferred()` which uses `router.push`/`router.replace` for all navigation, including inside Solana mobile WebViews. The Expo Router fix in SDK 54 (expo-router 6.0.23) correctly handles soft navigation inside Phantom's in-app browser, eliminating the need for the `window.location` hard-navigation fallback. The `hard-fallback` strategy remains available for other wallets that may still require it.

## Follow-Up

- No follow-up issues required for Outcome A.

## Reversibility

If a future Expo upgrade or wallet change invalidates this decision, the next change to `WALLET_WEBVIEW_NAVIGATION_STRATEGY` MUST update or supersede this ADR.
