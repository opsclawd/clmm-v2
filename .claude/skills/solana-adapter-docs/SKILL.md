---
name: solana-adapter-docs
description: >
  Fetch current documentation for Solana ecosystem libraries before writing
  any adapter implementation in packages/adapters/src/outbound/. Prevents
  hallucinated APIs from stale training data — @solana/kit, Orca, Jupiter,
  MWA, and Expo all have breaking changes between minor versions.
---

# Solana Adapter Documentation Skill

## When To Use This Skill

Activate when writing or modifying code in any of these locations:
- `packages/adapters/src/outbound/solana-position-reads/`
- `packages/adapters/src/outbound/swap-execution/`
- `packages/adapters/src/outbound/wallet-signing/`
- `packages/adapters/src/outbound/notifications/`

Also activate for Sequences 5, 6, 7, 8 from CLAUDE.md.

Do NOT activate for `packages/domain/`, `packages/application/`, or
`packages/testing/` — those packages have zero external SDK surface.

Trigger keywords: OrcaPositionReadAdapter, SolanaRangeObservationAdapter,
JupiterQuoteAdapter, SolanaExecutionPreparationAdapter,
SolanaExecutionSubmissionAdapter, NativeWalletSigningAdapter,
BrowserWalletSigningAdapter, ExpoPushAdapter, @orca-so/whirlpools,
@solana/kit, mobile-wallet-adapter, jupiter, whirlpool.

## Why This Exists

The Solana ecosystem has a high API churn rate. Writing adapter code from
training memory alone is the primary source of integration bugs in this
codebase. This skill enforces a documentation-first gate before any adapter
code is written.

Known breakage points from stale training data:
- @solana/kit has a completely different API surface from @solana/web3.js v1
- Orca Whirlpools SDK has different position read shapes between v1 and v2
- Jupiter v6 REST API has different field names and endpoint paths from v5
- MWA signing flow differs between managed and bare Expo workflows

---

## Step 1 — Map Your Task to a Library

All IDs verified via ctx7 library as of 2026-03-24.

| Adapter | Library ID | Snippets |
|---------|-----------|----------|
| OrcaPositionReadAdapter, SolanaRangeObservationAdapter | `/orca-so/whirlpools` | 1300 |
| JupiterQuoteAdapter (general reference + swap flow) | `/llmstxt/dev_jup_ag_llms_txt` | 1529 |
| JupiterQuoteAdapter (API schemas + endpoint shapes) | `/websites/dev_jup_ag_api-reference` | 207 |
| SolanaExecutionPreparationAdapter, SolanaExecutionSubmissionAdapter | `/anza-xyz/kit` | 1442 |
| NativeWalletSigningAdapter | `/solana-mobile/mobile-wallet-adapter` | 212 |
| BrowserWalletSigningAdapter | `/anza-xyz/wallet-adapter` | 41 |
| ExpoPushAdapter, notification permissions | `/websites/expo_dev_versions_sdk_notifications` | 185 |
| Expo deep links, app state, Expo Router, general Expo | `/llmstxt/expo_dev_llms_txt` | 12088 |

---

## Step 2 — Fetch Task-Specific Documentation

Use `ctx7 docs <libraryId> "<targeted query>"`. Be specific — vague queries
return generic onboarding content, not the API surface you need.

### Orca — position reads and range bounds

```bash
ctx7 docs /orca-so/whirlpools "read position lower upper range bounds current tick price"
ctx7 docs /orca-so/whirlpools "get pool current sqrt price tick index"
ctx7 docs /orca-so/whirlpools "position liquidity token amounts get position"
```

### Jupiter — quote and swap direction

```bash
# API schema for the quote request/response (v6)
ctx7 docs /websites/dev_jup_ag_api-reference "quote API v6 input output mint amount slippage"

# Swap instruction building from a quote
ctx7 docs /llmstxt/dev_jup_ag_llms_txt "swap transaction from quote instruction serialized"

# Token mint addresses for SOL and USDC direction mapping
ctx7 docs /llmstxt/dev_jup_ag_llms_txt "SOL USDC token mint address swap direction inputMint outputMint"
```

### @solana/kit — transaction building and submission

```bash
# Transaction message construction with pipe
ctx7 docs /anza-xyz/kit "createTransactionMessage pipe appendTransactionMessageInstructions"

# Fee payer and blockhash lifetime
ctx7 docs /anza-xyz/kit "setTransactionMessageFeePayer setTransactionMessageLifetimeUsingBlockhash"

# Send and confirm
ctx7 docs /anza-xyz/kit "sendAndConfirmTransactionFactory commitment confirmed"

# Address type — replaces PublicKey from web3.js v1
ctx7 docs /anza-xyz/kit "address type string to address conversion"

# RPC client creation — replaces new Connection from web3.js v1
ctx7 docs /anza-xyz/kit "createSolanaRpc createSolanaRpcSubscriptions"
```

### MWA — mobile wallet signing (React Native / Expo bare)

```bash
ctx7 docs /solana-mobile/mobile-wallet-adapter "authorize wallet session account address"
ctx7 docs /solana-mobile/mobile-wallet-adapter "transact signTransactions sendTransactions"
ctx7 docs /solana-mobile/mobile-wallet-adapter "reauthorize session token resume return"
ctx7 docs /solana-mobile/mobile-wallet-adapter "expo bare workflow react native polyfill"
```

### @solana/wallet-adapter — browser/PWA signing

```bash
ctx7 docs /anza-xyz/wallet-adapter "useWallet connect publicKey signTransaction"
ctx7 docs /anza-xyz/wallet-adapter "signTransaction sendTransaction provider"
```

### Expo push notifications and permissions

```bash
# Push token registration and permission request
ctx7 docs /websites/expo_dev_versions_sdk_notifications "registerForPushNotificationsAsync getExpoPushTokenAsync"
ctx7 docs /websites/expo_dev_versions_sdk_notifications "requestPermissionsAsync notification permission status granted"

# Notification content, scheduling, and received handlers
ctx7 docs /websites/expo_dev_versions_sdk_notifications "addNotificationReceivedListener addNotificationResponseReceivedListener"
```

### Expo deep links, app state, and Expo Router

```bash
# Deep link handling on notification open
ctx7 docs /llmstxt/expo_dev_llms_txt "Linking getInitialURL addEventListener useURL expo router"

# App state change on wallet handoff return
ctx7 docs /llmstxt/expo_dev_llms_txt "AppState change active background foreground"

# Expo Router navigation and params
ctx7 docs /llmstxt/expo_dev_llms_txt "expo router useLocalSearchParams navigate push href"
```

---

## Step 3 — Verify Before Writing Code

Before writing any implementation, confirm out loud:

> "The docs I fetched are from [library ID] at version [X].
> The import I am using is [import path].
> The function signature is [signature]."

Specifically check:
1. **Import path is current** — package names have changed (e.g., `@solana/kit`
   not `@solana/web3.js`, confirm exact Orca and Jupiter package names from docs)
2. **Function signatures match the fetched docs** — if they differ from your
   recall, use the docs version
3. **No deprecation notices** in the returned snippets

---

## Step 4 — Implement the Adapter

Hard rules from CLAUDE.md:

**Use @solana/kit for all Solana operations. @solana/web3.js v1 is a pinned
peer dep for MWA type compatibility only — never use its classes in logic:**

```typescript
// CORRECT
import { address, createSolanaRpc, pipe, createTransactionMessage } from '@solana/kit'

// FORBIDDEN in implementation code
import { Connection, PublicKey, Transaction } from '@solana/web3.js'
```

**Translate SDK types to domain DTOs at the adapter boundary, immediately:**

```typescript
// CORRECT — domain DTO exits the adapter, SDK type stays inside
const position: LiquidityPosition = toLiquidityPosition(orcaPositionData)
return position

// FORBIDDEN — raw SDK type leaking out of the adapter
return orcaPositionData
```

**No adapter decides breach direction or swap direction:**

```typescript
// FORBIDDEN — direction logic belongs in DirectionalExitPolicyService only
if (breach === 'down') return { from: 'SOL', to: 'USDC' }

// CORRECT — receive SwapInstruction from domain, translate to SDK-specific call
const ix = await buildJupiterSwapInstruction(swapInstruction.fromAsset, swapInstruction.toAsset, quote)
```

---

## Step 5 — Verify the Adapter Is Clean

```bash
# Confirm no layer boundary violations
pnpm boundaries

# Confirm @solana/web3.js v1 classes not used in implementation
grep -rn "new Connection\|new PublicKey\|new Transaction\|new VersionedTransaction" \
  packages/adapters/src/outbound/
# Expected: no output

# Run adapter contract tests against port interfaces
pnpm test:adapters
```

If `pnpm boundaries` fails, a forbidden import has crossed a layer boundary.
Fix before proceeding — this is CI-enforced.

---

## Anti-Patterns

- Skipping this skill because the API "seems familiar" — Kit, Orca, and
  Jupiter all changed significantly after the training cutoff
- Running `ctx7 docs` with a vague query like "how to use orca" — use
  targeted queries matching your exact implementation task
- Fetching docs for all adapters at session start — fire per-adapter only
- Writing SDK utility functions inside `packages/domain` or
  `packages/application` — all SDK code lives in adapters only
- Using `@solana/web3.js` v1 `Connection` or `PublicKey` in implementation
  code — use `@solana/kit` equivalents exclusively