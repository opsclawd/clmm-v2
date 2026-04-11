# Production Web Launch + Solana Mobile Distribution Plan

> **For agentic workers:** execute this plan in order. Phase 2 is a decision gate. Do not start native Android work unless the gate explicitly selects that path.

## Goal

1. Launch CLMM V2 on production web infrastructure with trustworthy public surfaces.
2. Verify the real user journey on the deployed web app.
3. Decide whether Solana Mobile distribution should use a wrapped web/PWA path or a native Android app.
4. Build and submit a native Android app only if the decision gate proves it is necessary.

## Guiding Changes From Review

- Treat backend deployability as a prerequisite, not an assumption.
- Use the repo's real web build entrypoint and output path.
- Stop mixing backend secrets into the app env example.
- Keep legal/support surfaces outside tab navigation and inside `packages/ui`.
- Require launch verification for the real product flow, not just 200 responses.
- Make native Android conditional on a documented distribution decision.

---

## Phase 0: Deployment Readiness

### File Map

| File | Action | Purpose |
|------|--------|---------|
| `packages/adapters/src/inbound/http/HealthController.ts` | Create | Canonical readiness endpoint for Railway and manual checks |
| `packages/adapters/src/inbound/http/AppModule.ts` | Modify | Register the health controller |
| `apps/app/.env.example` | Create or revise | App-only public runtime variables |
| `packages/adapters/.env.sample` | Create or revise | Backend-only runtime variables |
| `docs/superpowers/specs/2026-04-11-deployment-web-solana-dapp-store-design.md` | Align | Keep design/spec in sync with implementation plan |

### Task 0.1: Install Dependencies and Confirm the Real Build Commands

- [ ] Run `pnpm install` at repo root.
- [ ] Run `pnpm --filter @clmm/adapters build`.
- [ ] Run `pnpm --filter @clmm/app build`.
- [ ] Record the exact failure output if either command fails.

Exit condition:

- both commands succeed, or
- the failures are treated as blockers and resolved before any deployment work continues

### Task 0.2: Restore Backend Deployability

The current Railway target is `@clmm/adapters`, so deployment cannot proceed while that package fails to build.

- [ ] Fix application/adapters API drift until `pnpm --filter @clmm/adapters build` passes.
- [ ] Re-run the build after each fix.
- [ ] Do not start Railway setup until the adapters build is green.

### Task 0.3: Add a Canonical Health Endpoint

- [ ] Create `packages/adapters/src/inbound/http/HealthController.ts`.
- [ ] Expose `GET /health`.
- [ ] Return `200` with a small JSON body such as `{ "status": "ok" }`.
- [ ] Register the controller in `packages/adapters/src/inbound/http/AppModule.ts`.
- [ ] Add at least one controller test.

Exit condition:

- `curl http://localhost:3001/health` returns `200`

### Task 0.4: Split Environment Documentation by Ownership

- [ ] Keep `apps/app/.env.example` limited to app runtime variables:

```bash
EXPO_PUBLIC_BFF_BASE_URL=https://api.clmm.v2.app
```

- [ ] Keep `packages/adapters/.env.sample` limited to backend runtime variables:

```bash
DATABASE_URL=postgresql://user:password@host:5432/clmm
SOLANA_RPC_URL=https://your-private-rpc.example.com
PORT=3001
```

- [ ] Remove `EXPO_PUBLIC_API_BASE_URL` unless a real app consumer is introduced.

### Task 0.5: Lock Public Trust Surfaces

- [ ] Choose production canonical URLs:
  - web: `https://clmm.v2.app`
  - API: `https://api.clmm.v2.app`
  - privacy: `https://clmm.v2.app/privacy-policy`
  - support: `https://clmm.v2.app/support`
- [ ] Confirm `support@clmm.v2.app` is real and monitored.
- [ ] Do not use `*.pages.dev` or `*.up.railway.app` as the user-facing canonical URLs in store assets.

---

## Phase 1: Web Launch

### File Map

| File | Action | Purpose |
|------|--------|---------|
| `packages/ui/src/screens/PrivacyPolicyScreen.tsx` | Create | Truthful legal/privacy content |
| `packages/ui/src/screens/SupportScreen.tsx` | Create | Canonical support surface |
| `packages/ui/src/index.ts` | Modify | Export new screens |
| `apps/app/app/privacy-policy.tsx` | Create | Thin Expo Router wrapper outside tabs |
| `apps/app/app/support.tsx` | Create | Thin Expo Router wrapper outside tabs |
| `scripts/deploy-web.sh` | Create or revise | Local Cloudflare deploy helper using the correct output directory |
| Cloudflare Pages project | External | Production web hosting |
| Railway services | External | API and worker hosting |

### Task 1.1: Keep Phase 1 Expo Config Minimal

- [ ] Do not introduce `apps/app/app.config.ts` in Phase 1 unless a concrete Phase 1 requirement cannot be met with `app.json`.
- [ ] Keep `apps/app/app.json` as the primary Expo config for the web launch.
- [ ] Treat `EXPO_PUBLIC_BFF_BASE_URL` as the only required app runtime env unless a second public URL has a real consumer.

### Task 1.2: Create Legal and Support Screens in the Right Layer

- [ ] Create `PrivacyPolicyScreen` in `packages/ui/src/screens/`.
- [ ] Create `SupportScreen` in `packages/ui/src/screens/`.
- [ ] Export both from `packages/ui/src/index.ts`.
- [ ] Create thin route wrappers at:
  - `apps/app/app/privacy-policy.tsx`
  - `apps/app/app/support.tsx`

Do not place full screen implementations in `apps/app`.

### Task 1.3: Write Accurate Privacy and Support Content

Privacy policy must say:

- CLMM V2 is non-custodial
- private keys and seed phrases are never stored
- wallet-linked operational data may be stored off-chain to support monitoring, previews, execution history, and notifications
- support is available via `support@clmm.v2.app` and `/support`

Support page must say:

- what CLMM V2 supports today
- where users can get help
- what is out of scope

### Task 1.4: Create the Web Deploy Script With the Correct Build Path

`scripts/deploy-web.sh` should use the repo's actual app build command and output path.

- [ ] Build with:

```bash
pnpm --filter @clmm/app build
```

- [ ] Deploy:

```bash
npx wrangler pages deploy apps/app/dist --project-name=clmm-v2
```

- [ ] Make the script executable.

### Task 1.5: Deploy Backend to Railway

Canonical Railway topology:

- Service 1: HTTP API
- Service 2: worker

Shared build command:

```bash
pnpm install && pnpm --filter @clmm/adapters build
```

Start commands:

```bash
node packages/adapters/dist/inbound/http/main.js
node packages/adapters/dist/inbound/jobs/main.js
```

Required variables:

- `DATABASE_URL`
- `SOLANA_RPC_URL`
- `PORT=3001`

Deployment steps:

- [ ] Create Railway project and Postgres database.
- [ ] Create separate API and worker services.
- [ ] Set the required env vars.
- [ ] Run `pnpm --filter @clmm/adapters db:migrate` against the Railway database.
- [ ] Verify `https://api.clmm.v2.app/health`.

### Task 1.6: Deploy Web to Cloudflare Pages

Cloudflare Pages settings:

- build command: `pnpm install && pnpm --filter @clmm/app build`
- build output directory: `apps/app/dist`
- root directory: `/`
- env var: `EXPO_PUBLIC_BFF_BASE_URL=https://api.clmm.v2.app`

Deployment steps:

- [ ] Create or connect the Pages project.
- [ ] Set the build settings above.
- [ ] Configure the production custom domain `clmm.v2.app`.
- [ ] Verify the deployed site uses the production API base URL.

### Task 1.7: Verify the Real Web Launch Journey

Phase 1 is not complete until the deployed app works for the real product flow.

- [ ] Home page loads on `https://clmm.v2.app`.
- [ ] `/privacy-policy` loads and is readable.
- [ ] `/support` loads and is readable.
- [ ] Browser wallet connection works on supported web wallet setups.
- [ ] A supported position can be loaded.
- [ ] A preview can be generated.
- [ ] A user can abandon without broken state.
- [ ] If signing is attempted, the UI remains truthful about submission vs confirmation.

---

## Phase 2: Solana Mobile Distribution Decision

### File Map

| File | Action | Purpose |
|------|--------|---------|
| `docs/superpowers/specs/2026-04-11-deployment-web-solana-dapp-store-design.md` | Update | Record chosen mobile distribution path |
| optional PWA packaging config | Conditional | Only if wrapped web/PWA path is selected |
| native Android files | Conditional | Only if native path is selected |

### Task 2.1: Validate Android Mobile-Web Viability

- [ ] Open the deployed site on a physical Android device.
- [ ] Attempt the core flow on target browser/wallet combinations.
- [ ] Record whether wallet connectivity is acceptable.
- [ ] Record whether the web app can support store distribution as-is or with a lightweight wrapper.

### Task 2.2: Make the Distribution Decision Explicit

Choose one:

- [ ] `Wrapped web/PWA path`
- [ ] `Native Android path`

Record the concrete reason in the spec before continuing.

Examples of acceptable reasons for native Android:

- Android mobile-web wallet flow is not viable
- dApp Store packaging requirements are not met by the web/PWA path
- native-only wallet behavior is required for launch

If the wrapped web/PWA path is chosen, skip Phase 3.

---

## Phase 3: Native Android Path (Conditional)

Start this phase only if Phase 2 selected `Native Android path`.

### File Map

| File | Action | Purpose |
|------|--------|---------|
| `apps/app/polyfill.js` | Create | First import for native crypto polyfill |
| `apps/app/index.js` | Create | Custom Expo entry point |
| `apps/app/package.json` | Modify | Set `main` to `./index.js` |
| `apps/app/app.config.ts` | Create if needed | Dynamic Expo config for native/EAS metadata only |
| `apps/app/app.json` | Modify | Android metadata |
| `apps/app/eas.json` | Create | EAS build profiles |
| `apps/app/android/` | Generate | Native Android project |

### Task 3.1: Add Native Entry Files in `apps/app`

- [ ] Create `apps/app/polyfill.js`.
- [ ] Create `apps/app/index.js`.
- [ ] Update `apps/app/package.json`:

```json
{
  "main": "./index.js"
}
```

Do not create these files at repo root.

### Task 3.2: Add Native Build Configuration

- [ ] Add Android metadata to Expo config.
- [ ] Create `apps/app/eas.json`.
- [ ] Create `apps/app/app.config.ts` only if EAS/native metadata requires dynamic config.
- [ ] Set EAS env vars for every Android profile that needs `EXPO_PUBLIC_BFF_BASE_URL`.

### Task 3.3: Generate Native Android Project

- [ ] Ensure required icon assets exist.
- [ ] Run `npx expo prebuild --platform android --clean` from `apps/app`.
- [ ] Verify `apps/app/android/` is generated.

### Task 3.4: Verify Native Wallet Flows, Including Failure States

On a physical Android device, verify:

- [ ] wallet authorization success
- [ ] no compatible wallet installed
- [ ] user rejects authorization
- [ ] user declines signature
- [ ] app returns from wallet without completed signature
- [ ] resumed attempt is stale or expired

For each state above, define:

- user-facing copy
- CTA
- recovery destination

### Task 3.5: Build the Production AAB

- [ ] Initialize EAS project if needed.
- [ ] Build with `eas build --platform android --profile production`.
- [ ] Verify runtime envs are present in the resulting build.
- [ ] Download the AAB.

---

## Phase 4: Solana Mobile Submission

This phase applies to the chosen distribution path.

### Submission Assets

- [ ] App icon: 1024x1024 PNG
- [ ] Screenshot storyboard: 3-5 screenshots in a defined order
- [ ] Description that accurately states:
  - Orca scope
  - non-custodial signing
  - supported platform constraints
- [ ] Privacy URL: `https://clmm.v2.app/privacy-policy`
- [ ] Support URL: `https://clmm.v2.app/support`
- [ ] Support email: `support@clmm.v2.app`

### Submission Steps

- [ ] Create or access publisher account at `publish.solanamobile.com`.
- [ ] Complete KYC/KYB if required.
- [ ] Upload the chosen artifact for the selected distribution path.
- [ ] Submit.
- [ ] Confirm review has started.

---

## Verification Checklist

| # | Area | Verification |
|---|------|--------------|
| 1 | Backend build | `pnpm --filter @clmm/adapters build` succeeds |
| 2 | Web build | `pnpm --filter @clmm/app build` succeeds |
| 3 | Readiness endpoint | `curl https://api.clmm.v2.app/health` returns `200` |
| 4 | Cloudflare config | Pages uses `apps/app/dist` as output |
| 5 | Legal route | `https://clmm.v2.app/privacy-policy` loads |
| 6 | Support route | `https://clmm.v2.app/support` loads |
| 7 | Web wallet flow | user can connect on supported web wallet setups |
| 8 | Web core flow | user can load position and generate preview |
| 9 | Distribution decision | Phase 2 result is explicitly recorded |
| 10 | Native entrypoint | only if native chosen: `apps/app/index.js` exists |
| 11 | Native envs | only if native chosen: EAS has `EXPO_PUBLIC_BFF_BASE_URL` |
| 12 | Native flow | only if native chosen: device flow and recovery states pass |
| 13 | Submission | chosen distribution path is submitted and review has started |

---

## Spec Coverage Check

| Spec Area | Plan Coverage |
|-----------|---------------|
| Deployability gate | Phase 0 |
| Web launch | Phase 1 |
| Mobile distribution decision | Phase 2 |
| Native Android conditional path | Phase 3 |
| Submission assets and workflow | Phase 4 |
| Verification gate | Verification checklist |

---

## Out of Scope

- iOS App Store
- Google Play Store
- shipping native Android before the distribution decision is made
- placeholder support/contact info
- privacy copy that contradicts actual backend storage behavior
