# CLMM V2

CLMM V2 is a mobile-first, non-custodial LP exit assistant for supported Solana Orca CLMM positions.

## Getting Started

Prerequisites:

- Node.js 20+
- pnpm 9+

Bootstrap the repo:

```bash
pnpm bootstrap
```

This is the recommended first command in a fresh clone or git worktree. It installs dependencies and builds workspace outputs that other packages may rely on.

## Common Commands

```bash
pnpm bootstrap
pnpm dev
pnpm dev:api
pnpm dev:worker
pnpm build
pnpm typecheck
pnpm lint
pnpm boundaries
pnpm test
```

## Repo Map

- `apps/app`: Expo shell, routes, composition, and platform edge code
- `packages/domain`: pure domain model and invariant-carrying business rules
- `packages/application`: use cases, DTOs, and port contracts
- `packages/adapters`: external SDK, storage, HTTP, and job adapters
- `packages/ui`: screens, presenters, view-models, and components
- `packages/testing`: fakes, fixtures, contracts, and scenarios
- `packages/config`: shared TypeScript, ESLint, CI, and boundary config

## Important Docs

- Agent instructions: `AGENTS.md`
- Setup and worktree guidance: `docs/setup.md`
- Architecture overview: `docs/architecture.md`
- Domain invariants and lifecycle rules: `docs/architecture/invariants.md`
- Release checklist: `docs/architecture/release-checklist.md`

## Product Guardrails

- Direction matters: lower-bound breach exits to USDC via `SOL -> USDC`; upper-bound breach exits to SOL via `USDC -> SOL`.
- The directional mapping lives only in `packages/domain/src/exit-policy/DirectionalExitPolicyService`.
- The backend never holds private keys or signing authority.
- This product is not a general wallet, analytics dashboard, or autonomous execution system.
