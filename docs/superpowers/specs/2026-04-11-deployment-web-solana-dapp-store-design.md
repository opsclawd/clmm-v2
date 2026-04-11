# Deployment Design: Production Web Launch + Solana Mobile Distribution

## Context

CLMM V2 is a mobile-first, non-custodial LP exit assistant for Orca whirlpool positions on Solana, built as an Expo/React Native monorepo with a NestJS backend.

**Distribution constraint: Solana Dapp Store only.**  
iOS App Store and Google Play Store are explicitly out of scope.

## What We Are Building

1. A production web app at `https://clmm.v2.app` backed by a NestJS API at `https://api.clmm.v2.app`, deployable to Railway and Cloudflare Pages.
2. A decision gate: does the Android mobile-web experience justify a native Android build for the Solana Dapp Store?
3. If native Android is required: a wrapped or native build submitted to `publish.solanamobile.com`.

## What We Are NOT Building

- iOS app
- Google Play listing
- Portfolio analytics beyond the core position monitoring/exit flow
- Native Android before the Phase 2 decision gate

## Phase 0: Deployment Readiness

### Backend Deployability Gate

Railway deploys `packages/adapters`. The package must build before Railway setup begins.

Gate criteria:

- `pnpm --filter @clmm/adapters build` exits 0
- `pnpm --filter @clmm/app build` exits 0
- `GET /health` returns `200` on the running backend
- Support email and canonical URLs are chosen and not placeholder

If any criterion fails, fix it before Phase 1.

### Environment Split

| File | Owner | Contents |
|------|-------|----------|
| `apps/app/.env.example` | App | `EXPO_PUBLIC_BFF_BASE_URL` only |
| `packages/adapters/.env.sample` | Backend | `DATABASE_URL`, `SOLANA_RPC_URL`, `PORT` |

Do not mix backend secrets into app env docs. The root `.env.sample` is deprecated and should be removed or marked as such.

## Phase 1: Web Launch

### Information Architecture

- `/privacy-policy` and `/support` live outside tab navigation
- Full screen components live in `packages/ui/src/screens/`
- `apps/app/app/` contains only thin Expo Router wrappers

### Privacy Policy Content Contract

The privacy policy must truthfully describe the system:

- CLMM V2 is non-custodial
- Private keys and seed phrases are never stored by the application
- Wallet-linked operational data (position data, execution history, notification preferences) may be stored off-chain to support monitoring, previews, and notifications
- Support is available at `support@clmm.v2.app` and `/support`

Do not use placeholder language like "we collect no data" if off-chain storage exists.

### Railway Topology

Two independent services:

- **HTTP API**: `node packages/adapters/dist/inbound/http/main.js`
- **Worker**: `node packages/adapters/dist/inbound/jobs/main.js`

Both share: build command (`pnpm install && pnpm --filter @clmm/adapters build`), `DATABASE_URL`, `SOLANA_RPC_URL`, `PORT=3001`.

### Cloudflare Pages Topology

- Build command: `pnpm install && pnpm --filter @clmm/app build`
- Output directory: `apps/app/dist`
- Runtime env: `EXPO_PUBLIC_BFF_BASE_URL=https://api.clmm.v2.app`
- Custom domain: `clmm.v2.app`

## Phase 2: Solana Mobile Distribution Decision

### Decision Criteria

Test the deployed web app on physical Android devices before committing to native.

**Web/PWA path is viable if ALL are true:**

- Wallet connectivity works in at least one major Android browser
- The Solana Dapp Store accepts a PWA/web URL for submission, OR the store's requirements can be met with a lightweight web wrapper
- The UX is acceptable for the target user

**Native Android path is required if ANY is true:**

- No compatible wallet works on Android mobile web for the target users
- The dApp Store explicitly requires a native `.aab` build
- A native-only capability (MWA direct integration, hardware key support) is required for the product to function

The decision must be recorded with a concrete reason in the spec before Phase 3 begins.

## Phase 3: Native Android (Conditional)

Start this phase only if Phase 2 selects the native path.

### Entry Point

- `apps/app/polyfill.js` — first import, installs `react-native-quick-crypto`
- `apps/app/index.js` — imports polyfill then expo-router
- `apps/app/package.json` `"main"` → `"./index.js"`

### Build Configuration

- Android package: `com.clmm.v2`
- EAS profiles: development (internal), preview (internal APK), production (App Bundle)
- `app.config.ts` only if EAS/native metadata requires dynamic config

### Wallet State Coverage

For each state, define: user-facing copy, CTA, recovery destination.

Required states:
1. Happy path: wallet connects, user signs, transaction submitted
2. No compatible wallet installed
3. User rejects wallet authorization
4. User declines signature mid-flow
5. App returns from wallet without completed signature
6. Resumed attempt is stale or expired

## Phase 4: Solana Dapp Store Submission

### Submission Assets

- Icon: 1024×1024 PNG
- Screenshots: 3–5 in fixed order, showing real product UI
- Description: Orca whirlpool positions, non-custodial, Solana only, wallet-signed transactions
- Privacy URL: `https://clmm.v2.app/privacy-policy`
- Support URL: `https://clmm.v2.app/support`
- Support email: `support@clmm.v2.app`

### Artifact

The submitted artifact depends on the Phase 2 decision:
- **Web/PWA path**: URL to the deployed PWA
- **Native path**: `.aab` built via EAS

## Verification Gate

| Area | Criterion |
|------|-----------|
| Backend build | `pnpm --filter @clmm/adapters build` succeeds |
| Web build | `pnpm --filter @clmm/app build` succeeds |
| Readiness | `GET /health` → 200 |
| Web launch | Real user journey works on `https://clmm.v2.app` |
| Legal surfaces | `/privacy-policy` and `/support` readable and truthful |
| Mobile decision | Android web viability tested and decision recorded |
| Native Android | Only if chosen: device flow, failure states, AAB all verified |
| Store submission | Artifact submitted, review started |

---

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Backend build fails | Medium | Phase 0.3 is a hard gate; fix before Railway |
| Railway cold starts | Low-Medium | Set Railway min instances = 1; use `/health` probe |
| Android wallet UX unacceptable | Unknown | Phase 2 explicitly tests this before native investment |
| Solana Mobile KYC delays | Medium | KYC is human-only; start in parallel with Phase 1 |
| Cloudflare Pages build timeout | Low | Expo static export is fast; `NIKEL_NO_AUTO_ATTACH=1` if needed |
