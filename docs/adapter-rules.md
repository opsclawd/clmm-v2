# Adapter Rules

## Solana SDK Rule

All Solana operations must use `@solana/kit` APIs.
`@solana/web3.js` v1 is present only as a pinned peer dependency for mobile wallet adapter type compatibility. Do not use its `Connection`, `PublicKey`, or `Transaction` classes in implementation logic.

## Libraries Requiring Current Docs First

Before writing or changing adapter code that touches any of these, use `context7` or current official documentation first:

- `@orca-so/whirlpools`
- Jupiter API v6 REST
- `@solana/kit`
- `@solana-mobile/mobile-wallet-adapter-protocol`
- `@solana/wallet-adapter-react`
- Expo SDK 52 APIs used for deep links, app state, permissions, and notifications

## Adapter Boundary Rules

- Adapters translate external SDK models to application or domain-facing DTOs immediately at the boundary.
- No adapter type may leak into `packages/domain`.
- Adapters must not decide breach direction or target posture.
- Drizzle row types must not leak into `packages/domain` or `packages/application`.

## Platform And Backend Rules

- Job handlers live only in `packages/adapters/src/inbound/jobs`.
- Application use cases must not call job handlers directly.
- Backend signing authority is forbidden.
- Submitted transactions must not be presented as confirmed until reconciliation says so.

## Testing Rules

- Do not hit live Orca or Jupiter APIs in tests.
- Use fixtures from `packages/testing/src/fixtures`.
- Validate adapter behavior through contract tests against the port interface.
