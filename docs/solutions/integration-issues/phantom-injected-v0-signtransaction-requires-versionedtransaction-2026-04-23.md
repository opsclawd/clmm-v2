---
title: Phantom injected signTransaction rejects raw v0 transaction bytes
date: 2026-04-23
category: integration-issues
module: apps/app
problem_type: integration_issue
component: wallet_signing
symptoms:
  - Signing status page shows "Versioned messages must be deserialized with VersionedMessage.deserialize()"
  - Out-of-range exit flow fails when user taps Sign & Execute in Phantom browser
  - Native wallet signing path works for the same prepared transaction payload
root_cause: wrong_api
resolution_type: code_fix
severity: critical
tags: [phantom, browser-wallet, signing, versioned-transaction, v0-transaction]
---

# Phantom injected signTransaction rejects raw v0 transaction bytes

## Problem

The server prepares exit execution payloads as serialized Solana v0 transactions. The browser signing path decoded the base64 payload to raw bytes and passed the `Uint8Array` directly to Phantom's injected `window.solana.signTransaction`.

Phantom's injected provider expects a transaction object for this API. Passing raw v0 wire bytes causes Phantom to attempt legacy message deserialization internally, which fails with:

```text
Versioned messages must be deserialized with VersionedMessage.deserialize()
```

## Symptoms

- The signing page enters the error state immediately after attempting browser wallet signing
- Error text contains `Versioned messages must be deserialized with VersionedMessage.deserialize()`
- The same execution path can work through native MWA because the native adapter decodes bytes with `@solana/kit` before calling the wallet

## What Didn't Work

- Retrying with an object that only exposes `serialize()` around the raw bytes. Phantom's injected provider reads transaction object fields such as `message`, `signatures`, and versioned transaction shape. A fake serializable wrapper is not a real transaction object.
- Treating browser `signTransaction` as a bytes-in/bytes-out API. That shape is valid for the app's internal port, but the injected Phantom boundary is web3.js-shaped.

## Solution

At the `apps/app` Phantom-injected-provider boundary, deserialize the prepared wire bytes to a `VersionedTransaction`, hand that object to `provider.signTransaction`, then serialize the signed result back to base64 for submission.

```typescript
import { VersionedTransaction } from '@solana/web3.js';

const payloadBytes = decodeBase64Payload(serializedPayload);
const transaction = VersionedTransaction.deserialize(payloadBytes);
const signedPayload = await provider.signTransaction(transaction);

return encodeBase64Payload(signedPayload.serialize());
```

This keeps `@solana/web3.js` usage at the browser wallet interop edge. Do not move this into domain, application, UI package code, or general Solana implementation logic. Do not introduce `Connection`, `PublicKey`, or legacy `Transaction` for this flow.

## Prevention

- Test browser signing with a real serialized v0 transaction fixture, not arbitrary bytes.
- Assert `provider.signTransaction` is called exactly once with a `VersionedTransaction`-shaped object and not a `Uint8Array`.
- Do not reintroduce the fake `serialize()` wrapper fallback. It validates the wrong contract and hides the actual provider API mismatch.
- If browser signing is later migrated to Wallet Standard or `@solana/react`, keep the bytes-in/bytes-out adapter at that new boundary and remove this Phantom injected-provider-specific conversion.

## Related Issues

- Adjacent signing pipeline issue: `docs/solutions/integration-issues/signing-payload-version-missing-from-submit-2026-04-23.md`
