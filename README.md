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

## Completion Gate

Before marking work complete or opening a PR, run the relevant verification commands and report what passed.

For broad or cross-package changes, use the full repo verification set:

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm boundaries
pnpm test
```

If a required check was not run, say so explicitly.

## Repo Map

- `apps/app`: Expo shell, routes, composition, and platform edge code
- `packages/domain`: pure domain model and invariant-carrying business rules
- `packages/application`: use cases, DTOs, and port contracts
- `packages/adapters`: external SDK, storage, HTTP, and job adapters
- `packages/ui`: screens, presenters, view-models, and components
- `packages/testing`: fakes, fixtures, contracts, and scenarios
- `packages/config`: shared TypeScript, ESLint, CI, and boundary config

## Environment Variables

CLMM uses two separate env surfaces:

- **App-only public** (`apps/app/.env.example`): variables prefixed `EXPO_PUBLIC_*`, shipped in the mobile/web bundle. **Only `EXPO_PUBLIC_BFF_BASE_URL` is allowed.** The app never talks to backend dependencies directly; the BFF mediates every read.
- **Backend-only** (`packages/adapters/.env.sample`): Railway deployment secrets — DB, RPC, and cross-service credentials. Never ship these in the app bundle.

### Regime engine integration (backend only)

CLMM posts terminal execution events to regime-engine and reads current S/R levels back through the BFF. Two env vars wire this up on the CLMM side:

| Var | Purpose | Required in |
|---|---|---|
| `REGIME_ENGINE_BASE_URL` | Backend-only base URL for regime-engine. Prefer the Railway private domain (e.g. `http://regime-engine.railway.internal:${{regime-engine.PORT}}`); fall back to the public domain if private networking is unresolved. | CLMM API + Worker |
| `REGIME_ENGINE_INTERNAL_TOKEN` | Shared secret sent as `X-CLMM-Internal-Token` on `POST /v1/clmm-execution-result`. Must match regime-engine's `CLMM_INTERNAL_TOKEN`. | CLMM API + Worker |

Both vars are optional in local dev: when unset, the adapter logs once per process and becomes a no-op. In Railway production, both MUST be set on the CLMM API and worker services.

Never define `EXPO_PUBLIC_REGIME_ENGINE_*`. Regime-engine is not reachable from the app bundle under any circumstances. See `docs/plans/2026-04-17-002-opus-clmm-regime-engine-integration-plan.md` §7 rule 4.

Deploy + verification runbook: `docs/plans/2026-04-19-002-feat-clmm-regime-engine-deploy-runbook-plan.md` — Task 7 (Railway wiring) and Task 8 (E2E verification) in §5.

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
