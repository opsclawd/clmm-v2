# Wallet Standard Package Survey (2026-04-24)

## Preferred Path: `@wallet-standard/react-core` + `@solana/react` + `@wallet-standard/app`

See `spike/wallet-standard-probe` branch for full survey notes.

## Fallback B: `@solana/wallet-adapter-react` + `@solana/wallet-adapter-phantom`

### Version pins

| Package | Version | Notes |
|---------|---------|-------|
| `@solana/wallet-adapter-react` | latest | Core wallet adapter hooks (`useWallet`, `useConnection`) |
| `@solana/wallet-adapter-phantom` | latest | Phantom-specific adapter (`PhantomWalletAdapter`) |
| `@solana/wallet-adapter-base` | latest | Base types for wallet adapters |

### API surfaces

```tsx
import { useWallet, WalletProvider } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';

// In root:
const wallets = useMemo(() => [new PhantomWalletAdapter()], []);
<WalletProvider wallets={wallets} autoConnect={false}>
  {children}
</WalletProvider>

// In component:
const { wallets, connect, disconnect, publicKey, connected, wallet } = useWallet();
```

### Key differences from Preferred path

- No Wallet Standard event system — explicitly registers Phantom adapter
- `useWallet()` provides `wallets`, `connect()`, `disconnect()`, `publicKey`, `connected`
- Uses `@solana/web3.js` v1 `Connection` and `PublicKey` types internally
- Signing: `wallet.adapter.signTransaction(tx: Transaction | VersionedTransaction)`
- Heavier dependency footprint (includes web3.js v1, buffer polyfills)

### Decision (pending Task 0 spike)

Chosen: Fallback B

Evidence:
- Phantom mobile in-app browser registered wallets at page load: [TBD]
- Connect attempt outcome: [TBD]