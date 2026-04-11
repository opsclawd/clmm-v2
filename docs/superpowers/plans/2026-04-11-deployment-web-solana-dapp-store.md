# Production Web Launch + Solana Mobile Distribution Plan

> **For agentic execution.** Each task has: action, verification, and commit.  
> Human-only steps are marked ⛔ HUMAN REQUIRED and block the flow.  
> If any agentic task fails, stop and report before continuing.

## Goal

1. Launch CLMM V2 on production web infrastructure (`clmm.v2.app` + `api.clmm.v2.app`)
2. Verify the real user journey on the deployed web app
3. Decide Solana Mobile distribution: wrapped web/PWA vs. native Android
4. Build and submit to **Solana Dapp Store only** — iOS App Store and Google Play Store are out of scope

## Distribution Scope

| Target | Status |
|--------|--------|
| Web (`clmm.v2.app`) | ✅ In scope |
| Solana Dapp Store (Android) | ✅ In scope |
| iOS App Store | ⛔ Out of scope |
| Google Play Store | ⛔ Out of scope |

---

## Phase 0: Deployment Readiness

**Owner: Agent** | **Stop on failure: Yes**

### Task 0.1 — Preflight Check
- [ ] `git status` — workspace must be clean before starting
- [ ] `node --version` and `pnpm --version` — confirm expected versions
- [ ] `pnpm install` — confirm all dependencies resolve

**Verification:** All commands exit 0 with no errors.

**Commit:** `"chore: preflight check passed"`

---

### Task 0.2 — Confirm Build Commands
- [ ] Run `pnpm --filter @clmm/adapters build`
- [ ] Run `pnpm --filter @clmm/app build`
- [ ] Record exact failure output if either fails

**Verification:** Both commands exit 0.

**Commit:** `"chore: verify build commands for adapters and app"` (or `"fix: restore build for @clmm/adapters"` if broken)

---

### Task 0.3 — Restore Backend Deployability
- [ ] Fix all compilation errors in `packages/adapters` until Task 0.2 passes
- [ ] Re-run build after each fix
- [ ] Do not proceed to Railway setup until adapter build is green

**Verification:** `pnpm --filter @clmm/adapters build` exits 0.

**Commit per fix:** Use conventional commit per fix (e.g., `"fix(adapters): resolve API drift in X module"`)

---

### Task 0.4 — Add Canonical Health Endpoint
- [ ] Create `packages/adapters/src/inbound/http/HealthController.ts`
  - Extend the existing NestJS controller base
  - Expose `GET /health` → `200 { "status": "ok" }`
- [ ] Register controller in `packages/adapters/src/inbound/http/AppModule.ts`
- [ ] Add at least one unit test for the health endpoint

**Verification:** `curl http://localhost:3001/health` returns `200` with JSON body.

**Commit:** `"feat(adapters): add /health readiness endpoint for Railway probes"`

---

### Task 0.5 — Split Environment Documentation
- [ ] Revise `apps/app/.env.example` (app-only public vars):
  ```
  EXPO_PUBLIC_BFF_BASE_URL=https://api.clmm.v2.app
  ```
- [ ] Revise `packages/adapters/.env.sample` (backend-only vars):
  ```
  DATABASE_URL=postgresql://user:password@host:5432/clmm
  SOLANA_RPC_URL=https://your-private-rpc.example.com
  PORT=3001
  ```
- [ ] Remove root `.env.sample` or make it clear it's deprecated (it's mixing concerns)

**Verification:** `apps/app/.env.example` contains only app-public vars; no backend secrets in it.

**Commit:** `"docs: split env docs by ownership — app vs backend"`

---

### Task 0.6 — Lock Public Trust Surfaces
- [ ] Confirm production canonical URLs:
  - web: `https://clmm.v2.app`
  - API: `https://api.clmm.v2.app`
  - privacy: `https://clmm.v2.app/privacy-policy`
  - support: `https://clmm.v2.app/support`
- [ ] Confirm `support@clmm.v2.app` is real and monitored
- [ ] Do not use `*.pages.dev` or `*.up.railway.app` as canonical URLs

**Verification:** All five URLs resolve and return valid content (can be checked after deploy).

**Commit:** `"docs: lock public trust surface URLs"`

---

### ⛔ HUMAN CHECKPOINT — Infrastructure Setup

**Block here. Do not proceed until this is done.**

⛔ G must complete before Phase 1 continues:
- [ ] Railway project created at railway.xyz
- [ ] PostgreSQL database added to Railway project
- [ ] `DATABASE_URL`, `SOLANA_RPC_URL`, `PORT=3001` set in Railway env vars
- [ ] Railway connected to GitHub repo (`clmm-superpowers-v2`)
- [ ] Cloudflare Pages project created and connected to GitHub
- [ ] Custom domain `clmm.v2.app` configured in Cloudflare Pages
- [ ] DNS for `api.clmm.v2.app` pointed to Railway (A record or CNAME)

**When done, reply:** "Infrastructure ready" — then Phase 1 continues.

---

## Phase 1: Web Launch

**Owner: Agent** | **Stop on failure: Yes**

### Task 1.1 — Create Legal Screens in `packages/ui`
- [ ] Create `packages/ui/src/screens/PrivacyPolicyScreen.tsx`
  - Must state: non-custodial, keys never stored, wallet-linked operational data may be stored off-chain, support contact
- [ ] Create `packages/ui/src/screens/SupportScreen.tsx`
  - Must state: what CLMM V2 supports, where to get help, what's out of scope
- [ ] Export both from `packages/ui/src/index.ts`

**Verification:** `packages/ui/src/index.ts` exports `PrivacyPolicyScreen` and `SupportScreen`.

**Commit:** `"feat(ui): add PrivacyPolicyScreen and SupportScreen components"`

---

### Task 1.2 — Create Route Wrappers
- [ ] Create `apps/app/app/privacy-policy.tsx` (thin wrapper, outside tabs)
- [ ] Create `apps/app/app/support.tsx` (thin wrapper, outside tabs)
- [ ] Both import from `packages/ui`, not from app-local code

**Verification:** Both files exist and import from `@clmm/ui`.

**Commit:** `"feat(app): add privacy-policy and support route wrappers"`

---

### Task 1.3 — Create Web Deploy Script
- [ ] Create `scripts/deploy-web.sh`:
  ```bash
  #!/bin/bash
  set -e
  echo "=== CLMM V2 Web Deploy ==="
  pnpm --filter @clmm/app build
  npx wrangler pages deploy apps/app/dist --project-name=clmm-v2
  echo "=== Deploy complete ==="
  ```
- [ ] Make executable: `chmod +x scripts/deploy-web.sh`

**Verification:** `bash scripts/deploy-web.sh` succeeds (or the Cloudflare GitHub integration handles deploys automatically).

**Commit:** `"feat: add web deploy script for Cloudflare Pages"`

---

### Task 1.4 — Run Database Migrations on Railway
- [ ] Set `DATABASE_URL` in Railway (already done in checkpoint)
- [ ] Run `pnpm --filter @clmm/adapters db:migrate` against the Railway database

**Verification:** Migration completes with no errors. You can verify via `curl https://api.clmm.v2.app/health` once Railway deploys.

**Commit:** `"chore: run database migrations against production Railway database"`

---

### Task 1.5 — Verify Backend is Live
- [ ] Wait for Railway to complete first deploy
- [ ] Run `curl https://api.clmm.v2.app/health`
- [ ] Expected: `200` with `{ "status": "ok" }`

**Verification:** Health endpoint returns `200`.

**If it fails:** Report the HTTP status and response body. Do not proceed to Task 1.6.

**Commit:** `"chore: verify Railway backend health endpoint"`

---

### Task 1.6 — Verify Web App is Live
- [ ] `curl https://clmm.v2.app/` → 200 with app content
- [ ] `curl https://clmm.v2.app/privacy-policy` → 200 with policy text
- [ ] `curl https://clmm.v2.app/support` → 200 with support content
- [ ] Confirm `EXPO_PUBLIC_BFF_BASE_URL` used by the deployed site points to `https://api.clmm.v2.app`

**Verification:** All three routes return 200 and non-empty content.

**If it fails:** Report which route failed and the response.

**Commit:** `"chore: verify Cloudflare Pages deployment"`

---

### Task 1.7 — Verify Real Web Launch Journey

**⛔ Human required for wallet interaction.**  
Agent can verify routes return 200, but wallet connection requires a real browser session.

Agent verifies:
- [ ] Home page HTML loads
- [ ] `/privacy-policy` returns non-empty content
- [ ] `/support` returns non-empty content

⛔ G verifies manually:
- [ ] Browser wallet (Phantom, Backpack, or supported wallet) connects successfully
- [ ] A test position can be loaded
- [ ] A preview can be generated
- [ ] User can abandon without broken UI state

**Commit:** `"chore: complete Phase 1 launch verification"`

---

## Phase 2: Solana Mobile Distribution Decision

**Owner: G (testing)** | **Agent documents results**

### Task 2.1 — Test Android Mobile-Web Viability

⛔ G performs this on a physical Android device:

- [ ] Open `https://clmm.v2.app` in Chrome on Android
- [ ] Open `https://clmm.v2.app` in Samsung Browser on Android
- [ ] Attempt wallet connection in each
- [ ] Record: wallet connectivity works / fails / partially works

Also test:
- [ ] Does the dApp Store require a native `.aab` for submission, or does a PWA/web URL qualify?

### Task 2.2 — Record Distribution Decision

Based on Task 2.1 results, G chooses one:

**Option A — Wrapped Web/PWA path:**
- [ ] Record reason: _"Android wallet flow is acceptable via Chrome/Browser"_
- [ ] No native Android work needed; skip to Phase 4
- [ ] Commit: `"docs: decision — wrapped web/PWA path for Solana Dapp Store"`

**Option B — Native Android path:**
- [ ] Record reason: _"e.g., dApp Store requires native .aab"_
- [ ] Proceed to Phase 3
- [ ] Commit: `"docs: decision — native Android required for Solana Dapp Store"`

---

## Phase 3: Native Android (Conditional)

**Start only if Phase 2 selected Option B.**  
**Owner: Agent** | **Stop on failure: Yes**

### Task 3.1 — Add Native Entry Files
- [ ] Create `apps/app/polyfill.js`:
  ```js
  import { install } from 'react-native-quick-crypto';
  install();
  ```
- [ ] Create `apps/app/index.js`:
  ```js
  import './polyfill';
  import 'expo-router/entry';
  ```
- [ ] Update `apps/app/package.json` `"main"` to `"./index.js"`

**Verification:** `apps/app/package.json` `"main"` is `"./index.js"` and both new files exist.

**Commit:** `"feat(app): add native crypto polyfill and custom entry point for Android"`

---

### Task 3.2 — Install Native Dependencies
- [ ] Run `cd apps/app && pnpm add expo-dev-client react-native-quick-crypto`

**Verification:** `apps/app/package.json` includes both packages.

**Commit:** `"feat(app): install expo-dev-client and react-native-quick-crypto"`

---

### Task 3.3 — Add Android Build Configuration
- [ ] Add Android metadata to `apps/app/app.json`:
  ```json
  "android": {
    "package": "com.clmm.v2",
    "versionCode": 1,
    "adaptiveIcon": {
      "foregroundImage": "./public/icon.png",
      "backgroundColor": "#0D0D0D"
    },
    "permissions": ["android.permission.INTERNET"]
  }
  ```
- [ ] Verify `apps/app/public/icon.png` exists (1024×1024)
- [ ] Create `apps/app/eas.json` with development/preview/production profiles

**Verification:** `app.json` has `"android.package": "com.clmm.v2"`. `eas.json` exists.

**Commit:** `"feat(app): add Android package and EAS build profiles"`

---

### Task 3.4 — Generate Native Android Project
- [ ] Run `cd apps/app && npx expo prebuild --platform android --clean`

**Verification:** `apps/app/android/` directory is generated with `build.gradle`, `settings.gradle`, `app/`, and `gradle/` subdirs.

**Commit:** `"feat(app): generate native Android project via expo prebuild"`

---

### Task 3.5 — Verify Dev Build on Device

⛔ Human required — physical Android device needed.

Agent prepares:
- [ ] Run `eas build --platform android --profile development --local` (or `expo run:android --variant debug` with device connected)
- [ ] Provide the resulting APK path to G

⛔ G verifies on device:
- [ ] App installs and launches
- [ ] Wallet authorization works (MWA authorize dialog appears)
- [ ] "No compatible wallet" state handled gracefully
- [ ] User rejects → app returns to previous state cleanly
- [ ] User declines signature → app returns cleanly
- [ ] Expired/stale session → recovery state is defined

**Commit:** `"chore(app): verify native Android dev build on physical device"`

---

### Task 3.6 — Build Production AAB
- [ ] Initialize EAS project if needed: `cd apps/app && eas project:init`
- [ ] Build: `eas build --platform android --profile production`
- [ ] Download the resulting AAB

**Verification:** AAB file exists and has non-zero size.

**Commit:** `"feat(app): build production AAB for Solana Dapp Store submission"`

---

## Phase 4: Solana Dapp Store Submission

**Owner: G (submission)** | **Agent prepares assets**

### Task 4.1 — Prepare Submission Assets

Agent prepares (G confirms):
- [ ] App icon: 1024×1024 PNG at `apps/app/public/icon.png`
- [ ] Screenshot storyboard: 3–5 screenshots in a defined order
- [ ] Description: Orca scope, non-custodial signing, platform constraints
- [ ] Privacy URL: `https://clmm.v2.app/privacy-policy`
- [ ] Support URL: `https://clmm.v2.app/support`
- [ ] Support email: `support@clmm.v2.app`

**Commit:** `"chore: prepare Solana Dapp Store submission assets"`

---

### Task 4.2 — Submit to Solana Dapp Store

⛔ G performs submission:
- [ ] Create or log into publisher account at `publish.solanamobile.com`
- [ ] Complete KYC/KYB if required
- [ ] Upload the chosen artifact (AAB or PWA URL depending on Phase 2 decision)
- [ ] Submit and confirm review started

**Commit:** `"chore: submit CLMM V2 to Solana Dapp Store"`

---

## Verification Checklist

| # | Area | Verification | Owner |
|---|------|--------------|-------|
| 0.1 | Preflight | `git status` clean, node/pnpm ok | Agent |
| 0.2 | Build commands | Both `pnpm build` commands pass | Agent |
| 0.3 | Backend deployability | Adapters build fixed | Agent |
| 0.4 | Health endpoint | `curl localhost:3001/health` → 200 | Agent |
| 0.5 | Env split | App `.env.example` has no backend secrets | Agent |
| 0.6 | Trust surfaces | Canonical URLs confirmed | Agent |
| ⛔ | **Infrastructure** | Railway + Cloudflare dashboards configured | **G** |
| 1.1 | Legal screens | `PrivacyPolicyScreen`, `SupportScreen` exported | Agent |
| 1.2 | Route wrappers | Route files exist and import from `@clmm/ui` | Agent |
| 1.3 | Deploy script | `scripts/deploy-web.sh` exists and is executable | Agent |
| 1.4 | Migrations | `db:migrate` ran on Railway | Agent |
| 1.5 | Backend live | `curl api.clmm.v2.app/health` → 200 | Agent |
| 1.6 | Web live | All three routes return 200 | Agent |
| 1.7 | Real journey | Browser wallet + position + preview verified | **G** |
| 2.1 | Android viability | Physical device testing on Android browsers | **G** |
| 2.2 | Distribution decision | Decision recorded and committed | **G** |
| 3.1 | Native entry | `index.js`, `polyfill.js`, `package.json` updated | Agent |
| 3.2 | Native deps | `expo-dev-client`, `react-native-quick-crypto` installed | Agent |
| 3.3 | Android config | `app.json` has `package: "com.clmm.v2"`, `eas.json` exists | Agent |
| 3.4 | Prebuild | `android/` directory generated | Agent |
| 3.5 | Dev build verification | Physical device flow + failure states verified | **G** |
| 3.6 | Production AAB | AAB built and downloaded | Agent |
| 4.1 | Submission assets | All assets prepared and confirmed | Agent + G |
| 4.2 | Submission | Submitted to `publish.solanamobile.com` | **G** |

---

## Out of Scope

- iOS App Store
- Google Play Store
- Deploying native Android before Phase 2 explicitly selects that path
- Store assets referencing placeholder or hypothetical support surfaces
