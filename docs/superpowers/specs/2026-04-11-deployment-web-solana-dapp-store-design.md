# Deployment Plan: Production Web Launch + Solana Mobile Distribution Decision

## Context

CLMM V2 is a mobile-first, non-custodial LP exit assistant for Orca whirlpool positions on Solana, built as an Expo/React Native monorepo with a NestJS backend.

The earlier draft assumed:

1. the backend was already deployable,
2. the web export path was already correct,
3. native Android was the obvious Solana Mobile path.

Those assumptions are not safe enough for execution. This revision adds explicit decision gates so the team does not confuse "written deployment steps" with "a launchable product."

## Revised Goal

1. Launch a trustworthy production web app on stable custom domains.
2. Prove the real user journey works end to end on the web deployment.
3. Decide the Solana Mobile distribution path only after validating whether the deployed web app is sufficient on Android mobile web.
4. Build a native Android app only if the web/PWA path cannot satisfy wallet flow or store constraints.

## Decision Gates

### Gate 1: Deployability

Before any Railway or Cloudflare setup is treated as executable:

- `pnpm --filter @clmm/adapters build` must pass
- `pnpm --filter @clmm/app build` must be the authoritative web export command
- a real HTTP readiness endpoint must exist
- production support/contact surfaces must be chosen and non-placeholder

If any item above is false, fix the repo or narrow the launch scope before continuing.

### Gate 2: Solana Mobile Distribution

Before native Android work begins:

- verify whether the deployed web app works acceptably on Android mobile web
- verify whether the dApp Store target can be satisfied by a wrapped PWA/mobile-web path
- record the reason for choosing native Android if the web/PWA path is rejected

Native Android is a conditional phase, not the default next step.

---

## Phase 0: Deployment Readiness

### 0.1 Restore Backend Deployability

The current backend deployment target is `packages/adapters`, so the package must compile cleanly before Railway work starts.

Required outcome:

- `pnpm --filter @clmm/adapters build` succeeds

This is a hard precondition because Railway cannot deploy a build that does not exist.

### 0.2 Add an Explicit Readiness Endpoint

The plan will use `/health` as the canonical readiness probe, so the backend must actually expose it.

Required behavior:

- route: `GET /health`
- response: `200 OK`
- payload: small JSON body such as `{ "status": "ok" }`
- safe for Railway health checks and manual curl verification

### 0.3 Finalize Public Trust Surfaces

Before public launch, the plan requires stable production-facing surfaces:

- web app domain: `https://clmm.v2.app`
- API domain: `https://api.clmm.v2.app`
- privacy policy route: `https://clmm.v2.app/privacy-policy`
- support route: `https://clmm.v2.app/support`
- support email: `support@clmm.v2.app`

Do not launch or submit with placeholder contact info or temporary platform domains as the canonical public surface.

---

## Phase 1: Web Launch

### 1.1 Keep Phase 1 Runtime Configuration Minimal

Phase 1 does not need a new `app.config.ts` if the only runtime value the web app needs is the public BFF base URL.

Phase 1 configuration rule:

- keep `apps/app/app.json` as the primary Expo config
- use `EXPO_PUBLIC_BFF_BASE_URL` as the only required app runtime variable unless a second public URL has a real consumer
- defer `app.config.ts` until native/EAS work actually requires dynamic Expo metadata

This avoids introducing config indirection before it earns its keep.

### 1.2 Split Environment Documentation by Owner

Use separate env docs for app and backend concerns.

`apps/app/.env.example`

```bash
# Public runtime config for the Expo app
EXPO_PUBLIC_BFF_BASE_URL=https://api.clmm.v2.app
```

`packages/adapters/.env.sample`

```bash
DATABASE_URL=postgresql://user:password@host:5432/clmm
SOLANA_RPC_URL=https://your-private-rpc.example.com
PORT=3001
```

Do not document backend-only secrets in the app env file.

### 1.3 Legal and Support Surfaces

The legal/support pages are standalone routes, not tab destinations.

Required IA:

- `/privacy-policy` lives outside tab navigation
- `/support` lives outside tab navigation
- each route in `apps/app/app/` is a thin Expo Router wrapper
- UI content lives in `packages/ui`

Required privacy-policy content:

- truthful statement that CLMM V2 is non-custodial
- truthful statement that private keys and seed phrases are never stored
- truthful statement that wallet-linked operational data may be stored off-chain to provide monitoring, previews, execution history, and notification delivery
- contact path to the support surface

The copy must match how the backend actually works.

### 1.4 Railway Deployment

Railway deployment shape is fixed:

- one service for the HTTP API
- one service for the worker
- both built from the monorepo root
- both use `packages/adapters` compiled outputs as their start targets

Canonical commands:

- build: `pnpm install && pnpm --filter @clmm/adapters build`
- API start: `node packages/adapters/dist/inbound/http/main.js`
- worker start: `node packages/adapters/dist/inbound/jobs/main.js`
- migrations: `pnpm --filter @clmm/adapters db:migrate`

Required runtime variables in Railway:

- `DATABASE_URL`
- `SOLANA_RPC_URL`
- `PORT=3001`

### 1.5 Cloudflare Pages Deployment

The authoritative web export command is:

```bash
pnpm --filter @clmm/app build
```

Cloudflare Pages settings:

- build command: `pnpm install && pnpm --filter @clmm/app build`
- build output directory: `apps/app/dist`
- root directory: `/`
- env var: `EXPO_PUBLIC_BFF_BASE_URL=https://api.clmm.v2.app`

If a local deploy script exists, it should deploy `apps/app/dist`, not repo-root `dist`.

### 1.6 Phase 1 Launch Verification

Phase 1 is complete only if the real user journey works on the deployed site.

Required checks:

1. `https://clmm.v2.app/` loads without crash
2. `https://clmm.v2.app/privacy-policy` and `/support` load and are usable
3. browser wallet connection works on supported web wallet setups
4. a supported Orca position can be loaded
5. an execution preview can be generated
6. the user can explicitly abandon without broken state
7. if signing is attempted, the post-submit state remains truthful and does not imply confirmation before reconciliation

Artifact-only checks such as "returns 200" are not enough on their own.

---

## Phase 2: Solana Mobile Distribution Decision

After the web launch is live, test the Android mobile-web path before committing to native Android.

Questions this phase must answer:

1. Can a real Android user reach the deployed web app and complete the core flow?
2. Does the current web wallet approach work on target Android wallet/browser combinations?
3. If the web app is wrapped for store distribution, does the wallet UX remain acceptable?
4. Does the dApp Store require anything that the web/PWA path cannot satisfy?

Decision outputs:

- `Proceed with wrapped web/PWA path`
- `Proceed with native Android path`

If the team chooses native Android, record the concrete reason. Example reasons:

- wallet connectivity is not acceptable on Android mobile web
- store packaging constraints require native integration
- a native-only capability is required for launch

---

## Phase 3: Native Android Path (Conditional)

This phase happens only if Phase 2 rejects the web/PWA option.

### 3.1 Native Entry Point

If native Android is required:

- create `apps/app/polyfill.js`
- create `apps/app/index.js`
- update `apps/app/package.json` `main` to `./index.js`

These files belong in `apps/app/`, not the repo root.

### 3.2 Native Build Configuration

Native Android requires:

- Android package metadata in Expo config
- `apps/app/eas.json`
- EAS project configuration
- EAS environment variables for every Android profile that needs `EXPO_PUBLIC_BFF_BASE_URL`

Only introduce `apps/app/app.config.ts` if EAS/native configuration truly requires dynamic Expo config values.

### 3.3 Native Wallet State Coverage

Native Android verification must cover more than the happy path.

Required states:

- no compatible wallet installed
- user rejects authorization
- user declines signature
- app returns from wallet without a completed signature
- resumed attempt is stale or expired

Each state must specify:

- user-facing copy
- CTA
- landing destination after recovery

### 3.4 Native Build Verification

Native Android is complete only when:

- the dev build installs on a physical device
- wallet authorization works on device
- rejection/interruption states behave intentionally
- the production AAB is generated with the correct runtime env

---

## Submission Assets

Store assets must reflect the real product and real support surfaces.

Required:

- icon: 1024x1024 PNG
- screenshot storyboard: 3-5 screenshots in a fixed order
- description that states Orca support, non-custodial signing, and platform constraints accurately
- privacy-policy URL: `https://clmm.v2.app/privacy-policy`
- support URL: `https://clmm.v2.app/support`
- support email: `support@clmm.v2.app`

Do not use placeholder copy such as "we collect no data" if the system stores wallet-linked operational records.

---

## Verification Gate

Before the overall effort is considered complete:

| Area | Required Verification |
|------|-----------------------|
| Backend build | `pnpm --filter @clmm/adapters build` succeeds |
| Web build | `pnpm --filter @clmm/app build` succeeds |
| Readiness endpoint | `curl https://api.clmm.v2.app/health` returns 200 |
| Web launch | `https://clmm.v2.app` supports the real user journey |
| Legal/support | `/privacy-policy` and `/support` are reachable and usable |
| Mobile decision | web/PWA viability on Android has been explicitly tested |
| Native Android | only if chosen: device flow, rejection flow, and AAB generation all pass |
| Solana Mobile submission | only for the chosen distribution path: submission accepted and review started |

---

## Out of Scope

- iOS App Store
- Google Play Store
- adding portfolio analytics or other non-core product surfaces
- assuming native Android is mandatory before the distribution decision is made
