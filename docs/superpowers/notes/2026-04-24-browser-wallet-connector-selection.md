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

## Spike Results

_Pending real-device testing._

## Error Shapes

_Pending real-device testing. Will capture raw error class, name, code, message for each wallet rejection/cancel path._

## Decision

_Pending spike evidence._

## Version Pins

_Pending spike completion._

## Follow-up Risks

- ConnectorKit is pre-1.0. API surface may change between minor versions.
- MWA registration timing depends on `ConnectorProvider` mount. If capability detection runs before mount, the hook-side 1500 ms poll handles the race.
- `@solana/web3.js` v1 is a peer dependency of ConnectorKit. It must be present but must not be used in implementation code (only for compat deserialization if needed).
- ConnectorKit bundles `@wallet-standard/app`, `@solana-mobile/wallet-standard-mobile`, and related Wallet Standard packages. Version compatibility is ConnectorKit's responsibility, not ours. This is an advantage (single integration surface) but also means we inherit their dependency choices.