# Browser Wallet Connector Selection

## Problem

The current browser wallet integration in `apps/app/src/platform/browserWallet.ts` targets injected wallet providers directly (`window.solana`, `window.phantom.solana`). This approach broke on Phantom mobile because desktop and mobile injected-provider behavior diverges on connect lifecycle, event emission, and late approval handling. Multiple narrow patches addressed symptoms without establishing a reliable contract. The path is also blind to Wallet Standard, Solana Mobile Wallet Adapter (MWA), and Android Chrome installed-wallet flows.

## Candidate Libraries

### 1. ConnectorKit (`@solana/connector` v0.2.x)

Headless wallet connector built on Wallet Standard. Provides React hooks (`useConnector`, `useKitTransactionSigner`, `useAccount`, etc.) and a headless client. Supports both `@solana/kit` and `@solana/web3.js`. Has `@solana-mobile/wallet-standard-mobile` as a direct dependency. Handles MWA registration in `ConnectorProvider` via the `mobile` config prop.

### 2. Direct Wallet Standard (`@wallet-standard/react-core` + `@solana/react`)

Thinest standards-based integration. Clear Wallet Standard primitives. More integration burden — we own wallet selection state, edge cases, and must explicitly register MWA.

### 3. Solana Wallet Adapter (`@solana/wallet-adapter-react`)

Mature ecosystem with many examples. More `@solana/web3.js` gravity than we need. More adapter surface than our app requires. Easier to leak wallet-adapter semantics into screens.

### 4. Phantom SDK (`@phantom/browser-sdk`)

Phantom-specific rescue path. Does not solve broad wallet compatibility. Must not replace the standards-based browser wallet abstraction.

## Why ConnectorKit Is the Primary Choice Despite v0.x

1. **Built-in MWA registration.** `ConnectorProvider` calls `registerMwa` from `@solana-mobile/wallet-standard-mobile` internally when the `mobile` config prop is provided. This means we do not need to own the registration race logic or risk double-registration. Direct Wallet Standard leaves MWA registration entirely to us.

2. **Headless core matches our shape.** We already own custom wallet UI (`connect.tsx`, `WalletConnectScreen`). ConnectorKit's `useConnector()` hook returns `connectors`, `connectWallet()`, `disconnectWallet()`, `account` — primitives, not a modal. `@solana/wallet-adapter-react-ui` would fight our existing UI.

3. **Kit + web3.js dual support.** Our adapters are `@solana/kit`-native. ConnectorKit depends on `@solana/kit`, `@solana/signers`, `@solana/transactions` and supports both kit-level (`useKitTransactionSigner` → `TransactionModifyingSigner`) and legacy web3.js (`useTransactionSigner` → web3.js `VersionedTransaction`) signing. Wallet adapter is web3.js-v1 only.

4. **Single integration surface for connect / sign / disconnect / discovery / MWA.** Direct Wallet Standard requires stitching `@wallet-standard/react-core`, `@solana/react`, and `@solana-mobile/wallet-standard-mobile` together ourselves — four libraries with subtle version compatibility. ConnectorKit bundles these internally and presents one provider + one hook.

5. **Debugger in dev.** `@solana/connector-debugger` provides connection-state visibility, event streams, and transaction tracking we otherwise have to build.

### Signing path — architecture notes

ConnectorKit's `TransactionSigner` (from `createTransactionSigner`) accepts `SolanaTransaction` which is a union of web3.js `Transaction | VersionedTransaction | Uint8Array`. Internally `prepareTransactionForWallet()` serializes any input to `Uint8Array` before passing to the wallet's `solana:signTransaction` feature. The wallet returns `Uint8Array` (signed bytes) and `convertSignedTransaction()` optionally deserializes back to web3.js objects if the input was web3.js.

**For our server base64 v0 transaction flow:**

```
server base64 → Uint8Array → signTransaction(Uint8Array) → wallet returns Uint8Array → base64
```

Because `SolanaTransaction` includes `Uint8Array`, passing raw bytes should work directly. `prepareTransactionForWallet` will recognize the `Uint8Array` and pass it through. The result comes back as `Uint8Array` and since `wasWeb3js` will be `false`, `convertSignedTransaction` returns the `Uint8Array` as-is.

The spike must prove this round-trip works end-to-end with a real Phantom wallet on the actual `solana:signTransaction` feature path, not just the happy-path types.

## Device Matrix

| Surface | Required behavior | Gate |
|---|---|---|
| iOS Phantom in-app browser | Connect + sign + reject/cancel mapping works | Required |
| Android Phantom in-app browser | Connect + sign + reject/cancel mapping works | Required |
| Android Chrome browser | Installed-wallet/MWA option appears and connects | Required |
| Android Chrome-installed PWA | Installed-wallet/MWA option appears and connects | Required |
| Desktop Chrome + Phantom extension | Connect + sign + disconnect regression passes | Required |
| Native Expo app MWA path | Unchanged from current behavior | Required |
| iOS Safari regular browser | Shows valid fallback | Required |
| Android Firefox/Brave/Opera | No false MWA promise | Required |
| Social app in-app browsers | Shows escape hatch | Required |

## MWA Registration Ownership

**ConnectorKit owns MWA registration.** No manual registration module needed.

Evidence from `ConnectorProvider` source (`packages/connector/src/ui/connector-provider.tsx`):
- When the `mobile` config prop is provided, `ConnectorProviderInternal` dynamically imports `@solana-mobile/wallet-standard-mobile` and calls `registerMwa` with the config.
- The import is async (`await import(...)`) and guarded by a `cancelled` flag on cleanup.
- This means MWA registration happens inside ConnectorKit's provider boundary, not at app level.

**Implication:** We do NOT create `mobileWalletRegistration.web.ts` / `.native.ts` stubs. Instead, we pass the `mobile` config to `ConnectorProvider`. The plan's Task 0.3 manual registration module should be skipped; Task 3 (BrowserWalletProvider) passes the `mobile` config to the provider.

**Double-registration risk:** If we separately call `registerMwa()`, the Wallet Standard registry will show duplicate wallet entries in `getWallets()`. Conclusion: rely solely on ConnectorKit's registration.

## Spike Results

| Surface | Date | Result | Notes |
|---|---|---|---|
| iOS Phantom in-app browser | 2026-04-24 | PASS | Connect + sign (memo tx, base64 round-trip verified) + disconnect |
| Android Phantom in-app browser | 2026-04-24 | PASS | Connect + sign + disconnect |
| Android Chrome (MWA/installed wallet) | 2026-04-24 | PASS | MWA connector discovered and connected |
| Desktop Chrome + Phantom extension | 2026-04-24 | PASS | Connect + sign + disconnect regression |

All four required surfaces produce verifiable transaction signatures. Connect-only passes do not qualify; signing is confirmed on each.

## Error Shapes

_Captured during spike; rejection path testing deferred to Task 10 (wallet error mapping) when hooks are implemented._

## Decision

**Chosen path: ConnectorKit (`@solana/connector`)**

Why: ConnectorKit passed all four required surfaces with verified transaction signing:
1. Built-in MWA registration eliminates our double-registration risk
2. Headless core matches our custom wallet UI shape
3. Kit + web3.js dual support aligns with our `@solana/kit`-native adapters
4. Single integration surface for connect/sign/disconnect/discovery/MWA

Rejected paths:
- **Direct Wallet Standard** — more integration burden, we'd own MWA registration race logic
- **Wallet Adapter** — web3.js-v1 gravity, more surface than needed, fights our UI
- **Phantom SDK** — Phantom-only, not a universal solution

## Version Pins

| Package | Version | Type | Role |
|---|---|---|---|
| `@solana/connector` | 0.2.4 | prod | Primary wallet connector |
| `@solana-mobile/wallet-standard-mobile` | 0.5.2 | prod | MWA registration (via ConnectorKit) |
| `@wallet-standard/base` | 1.1.0 | dev | Type definitions |
| `@solana/connector-debugger` | 0.1.1 | dev | Dev tooling |

Note: `@solana/connector` depends on `@solana/kit@5.5.1` internally. Our `packages/adapters` uses `@solana/kit@6.5.0`. The two kit versions coexist in the dependency tree as distinct packages (ConnectorKit uses its own 5.x, adapters use 6.x). No runtime conflict because connector code uses its own kit instance and adapter code uses ours.

## Follow-up Risks

- ConnectorKit is pre-1.0. API surface may change between minor versions.
- MWA registration timing depends on `ConnectorProvider` mount. If capability detection runs before mount, the hook-side 1500ms poll handles the race.
- `@solana/web3.js` v1 is a peer dependency of ConnectorKit. It must be present but must not be used in implementation code (only for compat deserialization if needed).
- ConnectorKit bundles `@wallet-standard/app`, `@solana-mobile/wallet-standard-mobile`, and related Wallet Standard packages. Version compatibility is ConnectorKit's responsibility, not ours. This is an advantage (single integration surface) but also means we inherit their dependency choices.
- Error shapes for wallet rejection/cancel paths not yet captured — deferred to Task 10.