# CLMM V2 Technical Research

**Research date:** March 21, 2026  
**Product:** CLMM V2  
**Scope:** React Native primary experience, PWA support, clean architecture + DDD, shared domain/application core, user-signed execution only, off-chain execution history only

## Research Method

This document uses current official documentation from Expo, React Native, Solana Mobile, Phantom, Solflare, Jupiter, Solana RPC, and MDN as of **March 21, 2026**.

Where this document recommends an architecture direction, persistence model, or boundary, that is an **engineering inference from the cited platform constraints**, not a statement copied from a vendor source.

## Executive Summary

CLMM V2 is technically feasible as a **mobile-first Expo universal app** with a shared core and platform-specific adapters, but only if the product is designed around these realities:

- **Native mobile is the primary operating surface**
- **PWA is feasible, but should be treated as a secondary web surface, especially on mobile**
- **Client-side background monitoring is not reliable enough for breach detection**
- **A backend monitor is required if alerts are a core promise**
- **Wallet integration is fragmented across Android, iOS, desktop web, and mobile web**
- **Execution history should use a backend system of record, with local persistence only as cache**

The best V1 path is:

- **One Expo universal app**
- **Shared domain/application packages**
- **Platform-specific wallet, notifications, and persistence adapters**
- **Server-side monitoring + push orchestration**
- **Orca-first execution adapter and Jupiter-first swap adapter**

## 1. Recommended App Shell Strategy

## Recommendation

Use an **Expo universal app** as the primary shell, not split mobile and web shells.

Structure it as:

- one Expo app for Android, iOS, and web/PWA
- one shared domain/application core package
- one shared presentation/design-system layer where practical
- platform-specific adapters for wallets, notifications, deep links, and storage

### Why this is the best fit for V1

Expo Router is explicitly designed for universal React Native apps and supports the same route model across Android, iOS, and web, with platform-specific APIs when needed. It also supports static rendering on web.  
Source: [Expo Router Introduction](https://docs.expo.dev/router/introduction/)

Expo’s current PWA guidance is also very direct: build native apps whenever possible, and treat PWAs as especially useful for desktop users.  
Source: [Expo Progressive Web Apps](https://docs.expo.dev/guides/progressive-web-apps/)

That maps well to CLMM V2:

- primary value is time-sensitive mobile action
- wallet and notification capabilities are stronger on native
- PWA is still useful for desktop review, history, and lighter operational access

### Why not split shells in V1

Split shells would improve web-specific flexibility, but they would also duplicate:

- navigation
- presentation logic
- wallet UI
- adapter wiring
- testing matrix

That is the wrong trade for an Orca-first narrow MVP.

### Important caveat

This recommendation assumes **PWA is secondary support**, not parity with native mobile. If the product brief later demands first-class mobile web wallet behavior and first-class web push parity, the shell decision should be revisited.

## 2. Technical Feasibility Assessment

### Overall assessment: Feasible, with non-trivial platform asymmetry

### Feasible in green

#### Shared mobile/web app shell

Expo Router supports Android, iOS, and web with one route structure and web static rendering.  
Source: [Expo Router Introduction](https://docs.expo.dev/router/introduction/)

#### Shared core under clean architecture

React Native’s own testing guidance strongly favors separating business logic from UI. That aligns well with a shared domain/application core.  
Source: [React Native Testing Overview](https://reactnative.dev/docs/0.82/testing-overview)

#### Native push notifications

`expo-notifications` supports Android and iOS device notifications.  
Sources: [Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/), [Expo Push Setup](https://docs.expo.dev/push-notifications/push-notifications-setup/)

#### Native local persistence

`expo-sqlite` is persistent across restarts on native, and `expo-secure-store` provides encrypted local key-value storage for secrets and session material.  
Sources: [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite), [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore)

### Feasible but constrained in yellow

#### PWA support

Expo supports PWA setup, manifests, and service workers, but explicitly recommends native apps whenever possible and warns that service workers can cause unexpected behavior.  
Source: [Expo Progressive Web Apps](https://docs.expo.dev/guides/progressive-web-apps/)

#### Web notifications

Expo explicitly says `expo-notifications` does **not** support web notifications. Web push is still possible through standard Push API + service worker patterns, but that becomes a separate implementation track.  
Sources: [Expo notification services guide](https://docs.expo.dev/guides/using-push-notifications-services/), [MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)

#### Background tasks on native

Expo background tasks are deferred, not real-time. They may run later than requested, require battery/network conditions, and stop when the user kills the app.  
Source: [Expo BackgroundTask](https://docs.expo.dev/versions/latest/sdk/background-task/)

#### SQLite on web

Expo SQLite web support is currently alpha and requires WASM plus COOP/COEP headers for `SharedArrayBuffer`. That makes it unsuitable as the sole durable system of record for a trust-sensitive product.  
Source: [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite)

### High-friction in red

#### Uniform wallet behavior across all platforms

This is the weakest feasibility area.

- Solana Mobile MWA has full Android support, but **no iOS support**
- Phantom mobile connection from the web works only inside Phantom’s in-app browser
- Solflare mobile connection likewise assumes Solflare’s mobile browser

Sources: [Solana Mobile Wallet Adapter](https://docs.solanamobile.com/developers/mobile-wallet-adapter), [Phantom mobile connection](https://help.phantom.com/hc/en-us/articles/29995498642195-Connect-Phantom-to-an-app-or-site), [Solflare mobile dApp connection](https://help.solflare.com/en/articles/6176657-how-to-connect-to-dapps-using-solflare-mobile)

#### Client-side breach monitoring

Not credible for this product class. Native background work is opportunistic, and web background sync has limited browser availability.  
Sources: [Expo BackgroundTask](https://docs.expo.dev/versions/latest/sdk/background-task/), [MDN SyncManager](https://developer.mozilla.org/en-US/docs/Web/API/SyncManager)

## 3. Major Architecture Options

## Option A: Single Expo Universal App + Shared Core + Platform Adapters

### Shape

- `apps/mobile-web` or equivalent Expo app shell
- `packages/domain`
- `packages/application`
- `packages/infrastructure`
- `packages/ui`
- platform adapters behind ports

### Pros

- best delivery speed for V1
- maximum code sharing
- one navigation model
- one state model
- one domain model
- lowest team coordination cost

### Cons

- web feature parity must be deliberately limited
- platform adapter complexity moves to the edges
- mobile wallet behavior will still differ by platform

### Fit

Best fit for CLMM V2 V1.

## Option B: Split Native App + Separate Web/PWA Shell + Shared Core Packages

### Shape

- Expo or native React Native mobile app
- separate web app shell
- shared core packages below both

### Pros

- maximum freedom for web-specific wallet and PWA behavior
- cleaner separation of native and web UX
- easier to pursue rich desktop web later

### Cons

- slower MVP
- duplicated shell logic
- larger QA surface
- more build/release complexity from day one

### Fit

Only justified if web becomes strategically first-class, not merely supported.

## Option C: Native-Only V1 + Thin Read-Only Web Later

### Shape

- native app first
- defer real PWA capability

### Pros

- sharpest scope control
- strongest match to notifications and wallet signing

### Cons

- violates current requirement for PWA support
- weakens desktop utility

### Fit

Technically clean, but does not satisfy the stated constraints as written.

## 4. Recommended Architecture Direction

## Recommended direction

Adopt **Option A**, but with **explicitly asymmetric platform capabilities**.

### Core design principle

The shared core should own:

- domain entities
- value objects
- business rules
- use cases
- execution state machine
- policy mapping for breach side -> exit plan

The platform layer should own:

- wallet transport
- notifications
- deep links
- local storage
- remote API I/O
- Solana RPC / protocol SDK integration

### Recommended DDD / clean architecture layout

#### Domain layer

Owns:

- `Position`
- `RangeBoundary`
- `BreachState`
- `ExitPolicy`
- `ExecutionPlan`
- `ExecutionRecord`
- `NotificationIntent`
- `QuoteSnapshot`

No SDK imports. No HTTP. No platform APIs.

#### Application layer

Owns use cases such as:

- `MonitorPositionStatus`
- `GenerateExitPreview`
- `ConfirmAndExecuteExit`
- `RecordExecutionOutcome`
- `RegisterNotificationTarget`
- `ReconcileTransactionStatus`

Depends only on ports.

#### Infrastructure layer

Implements ports:

- `WalletPort`
- `PositionReadPort`
- `LiquidityExitPort`
- `SwapQuotePort`
- `SwapExecutionPort`
- `TransactionStatusPort`
- `NotificationPort`
- `ExecutionHistoryPort`
- `ClockPort`
- `IdGeneratorPort`

#### Interface layer

Expo routes, hooks, presenters, view models, notification entrypoints, and platform bootstrapping.

### Recommended adapter boundaries

#### Solana / DEX adapters

- `OrcaPositionAdapter`
- `OrcaLiquidityExitAdapter`
- `JupiterSwapAdapter`
- `SolanaRpcStatusAdapter`

Do not leak Orca or Jupiter response models into domain objects.

#### Wallet adapters

- Android native: MWA adapter
- iOS native: wallet-vendor adapters or browser-based connect adapters
- Web desktop/PWA: Wallet Standard / Jupiter Wallet Kit / injected wallet adapters

Jupiter Wallet Kit is a practical web-facing option because it includes Wallet Standard and Mobile Wallet Adapter support and is designed mobile-first.  
Source: [Jupiter Wallet Kit](https://dev.jup.ag/tool-kits/wallet-kit)

### Explicit product capability split I recommend

#### Native mobile

Primary for:

- alerts
- wallet connect
- signing
- execution

#### Desktop web / PWA

Strong support for:

- connect
- review
- history
- manual execution where wallet/browser support exists

#### Mobile web / PWA

Support as best-effort only. Do not make it the flagship path for wallet signing in V1.

## 5. Top Technical Risks

### Risk 1: Background monitoring is overestimated

If the team assumes the mobile client can reliably watch ranges in the background, the product will fail its core promise.

### Risk 2: iOS wallet interoperability is weaker than Android

MWA is not available on iOS. Any “one wallet integration layer solves mobile” assumption is wrong today.

### Risk 3: PWA parity will be over-promised

PWA is possible, but wallet connect, web notifications, and background behavior do not naturally match native.

### Risk 4: Execution preview and final execution diverge

Solana/Jupiter execution is quote- and blockhash-sensitive. `sendTransaction` success does not imply confirmation, and status reconciliation is mandatory.  
Sources: [Solana sendTransaction](https://solana.com/docs/rpc/http/sendtransaction), [Solana getLatestBlockhash](https://solana.com/docs/rpc/http/getlatestblockhash), [Solana getSignatureStatuses](https://solana.com/docs/rpc/http/getsignaturestatuses), [Jupiter Quote API](https://dev.jup.ag/api-reference/swap/quote)

### Risk 5: Local persistence is mistaken for audit durability

Local device storage is good for UX cache. It is not enough for cross-device visibility, operational support, or durable history.

### Risk 6: Native build requirements are ignored too long

Push, deep linking, and native wallet integrations all push the project out of “Expo Go toy mode” and into development builds early.  
Source: [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/)

### Risk 7: Multi-wallet support explodes test complexity

Wallet behavior differences will create one of the hardest QA surfaces in the product.

## 6. Technical Constraints That Must Be Reflected In The Product Brief

### Constraint 1: Alerts require backend monitoring

The brief should explicitly state that breach detection for user alerts is a **server-side responsibility**. Client-side monitoring alone is insufficient.

### Constraint 2: Native mobile is the primary execution surface

The brief should not imply equal execution reliability on native app, desktop PWA, and mobile PWA.

### Constraint 3: PWA support is secondary, not parity

The brief should define PWA support as:

- desktop-friendly access
- review/history access
- optional wallet execution where supported

not “the full mobile app in a browser.”

### Constraint 4: Wallet support matrix must be explicit

The brief should avoid vague wording like “supports all Solana wallets everywhere.” It should define:

- supported native wallet paths
- supported web wallet paths
- known mobile-browser limitations

### Constraint 5: Off-chain execution history needs backend persistence

The brief should specify that history is:

- off-chain
- backend-backed
- operational, not cryptographic proof

### Constraint 6: Push is best-effort

The brief should state that notifications are not guaranteed, and the system must support delivery tracking and fallback handling. Expo itself recommends checking push receipts and notes that the push service has no SLA.  
Source: [Expo Push Service sending guide](https://docs.expo.dev/push-notifications/sending-notifications/)

### Constraint 7: Real-device testing is required

The brief should acknowledge that push notification and wallet-signing validation require real devices, not just simulators/emulators.  
Source: [Expo Push Setup](https://docs.expo.dev/push-notifications/push-notifications-setup/)

## Notification Strategy Options

## Option 1: Native push first, web no push in V1

### Shape

- Expo push on Android/iOS
- in-app banners on web
- optional email fallback

### Recommendation

Best V1 option. Lowest complexity and strongest alignment with mobile-first.

## Option 2: Native push + custom web push

### Shape

- Expo or direct FCM/APNs for native
- Push API + service worker + VAPID on web

### Recommendation

Technically possible, but separate enough that it should be treated as a deliberate second track, not “free from Expo.”

## Option 3: Third-party omnichannel platform from day one

### Shape

- vendor-managed push/email/in-app orchestration

### Recommendation

Do not start here unless product requirements quickly outgrow simple operational messaging.

## Off-Chain Persistence Options For Execution History

## Option 1: Local-only storage

Using `expo-sqlite` and `expo-secure-store` only.

### Assessment

Not sufficient as the system of record.

Reasons:

- no reliable cross-device history
- weak support visibility
- web SQLite is alpha
- SecureStore has a 2048-byte value limit and is for secrets, not event history  
Sources: [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite), [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore)

## Option 2: Backend system of record + local cache

### Shape

- backend API + relational store
- local SQLite cache for read performance and offline UX
- SecureStore only for auth/session/sealed local metadata

### Recommendation

Best fit for CLMM V2.

### Why

Execution history is operational infrastructure, not just UX state. It needs:

- deduplication
- retry tracing
- delivery status
- transaction reconciliation
- support/debug visibility

## Port / Adapter Implications For Solana Integrations

The core should never directly depend on:

- Orca SDK types
- Jupiter API responses
- wallet SDKs
- Solana web3 transport objects

Instead, define narrow ports around:

- position reads
- breach evaluation inputs
- preview generation
- liquidity exit planning
- swap quoting
- swap submission
- transaction status reconciliation

This keeps Orca-first realistic without hard-wiring protocol response shapes into the domain.

## Likely Testing Strategy

## Unit tests

- Jest for domain and application packages
- no wallet SDKs or HTTP in these tests
- exhaustive rule tests for breach direction, execution lifecycle, and history recording

Expo recommends Jest with `jest-expo` for Expo unit testing.  
Source: [Expo mocking native calls / jest-expo](https://docs.expo.dev/modules/mocking/)

## UI / route integration tests

- Expo Router integration tests using `expo-router/testing-library`
- deep-link and route-state tests around breach alerts and execution preview flows  
Source: [Expo Router testing](https://docs.expo.dev/router/reference/testing/)

## Native E2E

- Detox on iOS and Android for core flows
- focus on connect, alert-open, preview, sign, success/failure states  
Source: [Detox](https://wix.github.io/Detox/)

## Web E2E

- Playwright for desktop PWA flows
- focus on installability, routing, history view, and wallet-connect fallbacks  
Source: [Playwright](https://playwright.dev/)

## Real-device smoke tests

Mandatory for:

- push notifications
- deep links
- wallet signing
- cold-start from notification tap

## 7. Explicit Recommendation On What Not To Overengineer In V1

### Do not build split shells

One universal shell is enough for the MVP.

### Do not build a generalized multi-DEX execution abstraction

Keep a thin protocol boundary, but stay Orca-first for LP operations and Jupiter-first for swaps.

### Do not build client-side “smart monitoring”

Use the client for presentation and execution, not as the authoritative monitoring engine.

### Do not build web push in V1 unless the product brief elevates PWA materially

Native push plus web in-app state is enough to validate the product.

### Do not build event sourcing, workflow engines, or elaborate saga infrastructure

A disciplined execution state machine plus durable backend records is enough.

### Do not store execution history only on device

Use local storage for cache, not for audit truth.

### Do not overbuild wallet abstraction

Define a clean wallet port, but do not try to equalize all wallet UX differences under one fake common denominator.

### Do not promise perfect platform parity

Design for intentional asymmetry:

- native strongest
- desktop web useful
- mobile PWA limited

## Bottom-Line Recommendation

Build CLMM V2 as an **Expo universal app with a shared domain/application core and platform-specific adapters**, but define the product as **native-mobile-primary** from the outset.

For V1:

- use Expo Router
- move to development builds early
- keep the core pure and shared
- put Orca, Jupiter, wallet, notifications, and persistence behind ports
- use backend monitoring for breach detection
- use backend persistence for execution history
- treat PWA as secondary support, especially on mobile

That is the narrowest technically credible path that still satisfies the stated constraints.

## Sources

- [Expo Router Introduction](https://docs.expo.dev/router/introduction/)
- [Expo Progressive Web Apps](https://docs.expo.dev/guides/progressive-web-apps/)
- [Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [Expo Push Setup](https://docs.expo.dev/push-notifications/push-notifications-setup/)
- [Expo Push Sending Guide](https://docs.expo.dev/push-notifications/sending-notifications/)
- [Expo notification services guide](https://docs.expo.dev/guides/using-push-notifications-services/)
- [Expo BackgroundTask](https://docs.expo.dev/versions/latest/sdk/background-task/)
- [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite)
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore)
- [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/)
- [Expo Router testing](https://docs.expo.dev/router/reference/testing/)
- [Expo mocking native calls / jest-expo](https://docs.expo.dev/modules/mocking/)
- [Solana Mobile Wallet Adapter](https://docs.solanamobile.com/developers/mobile-wallet-adapter)
- [Solana Mobile React Native MWA reference](https://docs.solanamobile.com/get-started/react-native/mobile-wallet-adapter)
- [Phantom React Native SDK](https://docs.phantom.com/sdks/react-native-sdk/index)
- [Phantom Browser SDK](https://docs.phantom.com/sdks/browser-sdk)
- [Phantom mobile connection](https://help.phantom.com/hc/en-us/articles/29995498642195-Connect-Phantom-to-an-app-or-site)
- [Solflare mobile dApp connection](https://help.solflare.com/en/articles/6176657-how-to-connect-to-dapps-using-solflare-mobile)
- [Jupiter Wallet Kit](https://dev.jup.ag/tool-kits/wallet-kit)
- [Jupiter Quote API](https://dev.jup.ag/api-reference/swap/quote)
- [Solana sendTransaction](https://solana.com/docs/rpc/http/sendtransaction)
- [Solana getLatestBlockhash](https://solana.com/docs/rpc/http/getlatestblockhash)
- [Solana getSignatureStatuses](https://solana.com/docs/rpc/http/getsignaturestatuses)
- [React Native Testing Overview](https://reactnative.dev/docs/0.82/testing-overview)
- [Detox](https://wix.github.io/Detox/)
- [Playwright](https://playwright.dev/)
- [MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- [MDN SyncManager](https://developer.mozilla.org/en-US/docs/Web/API/SyncManager)
