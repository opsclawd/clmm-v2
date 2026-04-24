# Wallet Standard Package Survey (2026-04-24)

## Preferred Path: `@wallet-standard/react-core` + `@solana/react` + `@wallet-standard/app`

### Version pins

| Package | Version | Notes |
|---------|---------|-------|
| `@wallet-standard/react-core` | `1.0.1` | `useWallets()`, `useConnect(wallet)`, `useDisconnect(wallet)` |
| `@solana/react` | `6.8.0` | `useSignTransaction(account, chain)`, `useSelectedWalletAccount()`, `SelectedWalletAccountContextProvider` |
| `@wallet-standard/app` | `1.1.0` | `getWallets()` — dispatches `wallet-standard:app-ready`, listens for `wallet-standard:register-wallet` |
| `@wallet-standard/react` | `1.0.1` | Convenience re-export of `@wallet-standard/react-core` (not required if using react-core directly) |

### Confirmed hook APIs

#### `useWallets()` — `@wallet-standard/react-core`

```ts
import { useWallets } from '@wallet-standard/react-core';
const wallets: readonly UiWallet[] = useWallets();
```

Returns array of registered Wallet Standard wallets. Each `UiWallet` has `.name`, `.chains`, `.features` etc.

#### `useConnect(wallet)` — `@wallet-standard/react-core`

```ts
import { useConnect } from '@wallet-standard/react-core';
const [isConnecting, connect] = useConnect(wallet);
// connect() returns Promise<readonly UiWalletAccount[]>
```

Takes a `UiWallet`, returns `[boolean, connectFn]`. The `connectFn` resolves with an array of `UiWalletAccount` objects, each with an `.address` property.

#### `useDisconnect(wallet)` — `@wallet-standard/react-core`

```ts
import { useDisconnect } from '@wallet-standard/react-core';
const [isDisconnecting, disconnect] = useDisconnect(wallet);
// disconnect() returns Promise<void>
```

#### `useSignTransaction(account, chain)` — `@solana/react`

```ts
import { useSignTransaction } from '@solana/react';
const signTransaction = useSignTransaction(account, 'solana:mainnet');
// signTransaction({ transaction: Uint8Array }) => Promise<{ signedTransaction: Uint8Array }>
```

Accepts a `UiWalletAccount` and a chain string. Returns a function that takes `{ transaction: Uint8Array }` and returns `Promise<{ signedTransaction: Uint8Array }>`.

**Key insight:** The input is raw `Uint8Array` bytes — no `VersionedTransaction.deserialize` needed. The output is also `Uint8Array`. This aligns perfectly with the base64-in/base64-out server DTO contract.

#### `useSelectedWalletAccount()` — `@solana/react`

```ts
import { useSelectedWalletAccount } from '@solana/react';
const [account, setAccount, filteredWallets] = useSelectedWalletAccount();
// Returns: [UiWalletAccount | undefined, Dispatch<SetStateAction>, UiWallet[]]
```

Requires wrapping with `SelectedWalletAccountContextProvider`.

#### `SelectedWalletAccountContextProvider` — `@solana/react`

```tsx
import { SelectedWalletAccountContextProvider } from '@solana/react';
<SelectedWalletAccountContextProvider
  filterWallets={(wallet) => wallet.chains.includes('solana:mainnet')}
  stateSync={{
    deleteSelectedWallet: () => { /* remove from storage */ },
    getSelectedWallet: () => localStorage.getItem('selectedWallet'),
    storeSelectedWallet: (key) => localStorage.setItem('selectedWallet', key),
  }}
>
  {children}
</SelectedWalletAccountContextProvider>
```

Requires `filterWallets` and `stateSync` props. On native (non-web) platforms this provider should not be rendered.

#### `getWallets()` — `@wallet-standard/app`

```ts
import { getWallets } from '@wallet-standard/app';
const { get, on, register } = getWallets();
// get(): readonly Wallet[]
// on('register', callback): () => void
// register(...wallets): () => void
```

Called at app bootstrap to dispatch `wallet-standard:app-ready` and set up the registration listener. This is what triggers wallets to register.

### Dependency chain

- `@wallet-standard/react-core@1.0.1` depends on `@wallet-standard/ui`, `@wallet-standard/app`, `@wallet-standard/base`, `@wallet-standard/errors`, `@wallet-standard/features`, `@wallet-standard/ui-registry`, `@wallet-standard/experimental-features`
- `@solana/react@6.8.0` depends on `@solana/keys`, `@solana/signers`, `@wallet-standard/ui`, `@wallet-standard/react` (which re-exports `@wallet-standard/react-core`), `@solana/wallet-standard-features`
- Peer dependency: `react >= 18` for both
- `@solana/react` has a `react-native` export, which is important for Expo compatibility

### Phantom mobile Wallet Standard registration (LOAD-BEARING UNKNOWN)

- Phantom desktop extension: Known to self-register via Wallet Standard (responds to `wallet-standard:app-ready` event)
- Phantom mobile in-app browser: **Unknown** whether it self-registers. This is what Task 0 spike will determine.
- `@phantom/browser-sdk@2.0.1` v2.x: Can discover wallets via Wallet Standard and EIP-6963. If Phantom mobile doesn't self-register, loading this SDK may trigger registration.
- Alternative: `@phantom/browser-sdk` has a `BrowserSDK` class with `providers: ["injected"]` and `discoverWallets()` method. The `@phantom/browser-sdk` approach would be Fallback A.

### Fallback A: Add `@phantom/browser-sdk@2.0.1`

The Browser SDK can discover injected wallets and explicitly register Phantom. Same hooks on top still work. Adds a Phantom-specific dependency.

### Fallback B: `@solana/wallet-adapter-react` + `@solana/wallet-adapter-phantom`

Pre-Wallet-Standard abstraction. Larger surface, `@solana/web3.js` v1 internally. Only if both Preferred and Fallback A fail.

---

## Decision (pending Task 0 spike)

Chosen: [Preferred | Fallback A | Fallback B]

Evidence:
- Phantom mobile in-app browser registered wallets at page load: [N]
- Connect attempt outcome: [success / hang / error text]
- Version pins: @wallet-standard/react-core@1.0.1, @solana/react@6.8.0, @wallet-standard/app@1.1.0