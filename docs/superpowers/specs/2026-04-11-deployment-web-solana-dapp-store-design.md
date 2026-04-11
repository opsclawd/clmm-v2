# Deployment Plan: Web (Cloudflare Pages) + Solana DApp Store

## Context

CLMM V2 is a mobile-first, non-custodial LP exit assistant for Orca whirlpool positions on Solana, built as an Expo/React Native monorepo (web + mobile) with a NestJS backend. The project is feature-complete and all tests pass. It is not yet deployed anywhere.

**Goal:** Get the web app live, then deploy to Solana Mobile Dapp Store (Android-only for now). Skip iOS App Store and Google Play Store.

**Phase order:** Web deployment first (fastest path to live), then Solana Mobile.

---

## Phase 1: Web Deployment

### 1.1 `app.config.ts` — Dynamic Environment Configuration

**File:** `apps/app/app.config.ts`

Create a TypeScript config file (replaces `app.json` for dynamic values). Reads from environment variables and EAS context.

```typescript
import type { ConfigContext, ExpoConfig } from 'expo';

const isProduction = process.env.NODE_ENV === 'production';

export default ({ ctx }: ConfigContext): ExpoConfig => ({
  ...require('./app.json'),
  name: isProduction ? 'CLMM V2' : 'CLMM V2 (dev)',
  scheme: 'clmmv2',
  extra: {
    eas: {
      projectId: process.env.EAS_PROJECT_ID,
    },
    API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL,
    BFF_BASE_URL: process.env.EXPO_PUBLIC_BFF_BASE_URL,
  },
});
```

**Why:** `app.json` is static; `app.config.ts` allows per-environment env var injection (dev vs. preview vs. production builds pointing at different backends). Uses `process.env.NODE_ENV` (set by Expo/EAS) rather than `ctx.env.NODE_ENV` which is not reliably available in all contexts.

### 1.2 `.env.example` — Environment Variable Documentation

**File:** `apps/app/.env.example`

```bash
# Backend
DATABASE_URL=postgresql://user:password@host:5432/clmm
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
PORT=3001

# BFF (Backend-for-Frontend proxy — same NestJS app)
EXPO_PUBLIC_BFF_BASE_URL=https://api.clmm.v2.app

# EAS
EAS_PROJECT_ID=your-eas-project-id

# Web only (Cloudflare Pages)
EXPO_PUBLIC_API_BASE_URL=https://api.clmm.v2.app
```

**Rule:** Never commit `.env` files. All secrets come from CI/CD or platform environment variables.

### 1.3 `scripts/deploy-web.sh` — Web Build & Deploy Script

**File:** `scripts/deploy-web.sh`

```bash
#!/bin/bash
set -e

echo "Building web app..."
pnpm --filter @clmm/app export

echo "Deploying to Cloudflare Pages..."
# Uses wrangler CLI or Cloudflare Pages GitHub integration
npx wrangler pages deploy dist --project-name=clmm-v2
```

**Notes:**
- `pnpm --filter @clmm/app export` runs `expo export:embed` (already configured in `app.json` with `web.output: "static"`)
- Cloudflare Pages should be connected to the GitHub repo for automatic deploys on merge to `main`
- The build command in Cloudflare Pages dashboard: `pnpm install && pnpm --filter @clmm/app export`
- The output directory: `dist`
- `EXPO_PUBLIC_BFF_BASE_URL` must be set in Cloudflare Pages environment variables

### 1.4 Privacy Policy Page

**File:** `apps/app/app/(tabs)/privacy-policy.tsx` (or `apps/app/app/privacy-policy.tsx`)

A static page at `/privacy-policy` — required for any app store submission. Minimal content:

- "CLMM V2 is a non-custodial application. We do not collect, store, or transmit your personal data."
- "We do not use analytics trackers."
- "Your transaction signing occurs entirely in your own wallet."
- Contact email placeholder.

This page must be live and accessible before Solana Mobile submission.

### 1.5 Backend Deployment to Railway

**Prerequisites:** Railway account connected to GitHub.

**Steps:**
1. Create a new Railway project
2. Add a PostgreSQL database (Railway will set `DATABASE_URL` automatically)
3. Set the following environment variables in Railway:
   - `SOLANA_RPC_URL` — use a private RPC (Helius/QuickNode) for reliability, not the public one
   - `PORT=3001`
   - `EXPO_PUBLIC_BFF_BASE_URL=https://[your-railway-app].up.railway.app` (set after deploy)
4. Connect the `packages/adapters` package or a separate deploy entry point to Railway via GitHub
5. Run Drizzle migrations: `pnpm --filter @clmm/adapters migrate`
6. Verify API health: `curl https://[app].up.railway.app/health`

**Note:** The NestJS backend is a separate deployment from the monorepo. Railway should deploy the `packages/adapters` NestJS app directly, or a root-level server entry point.

### 1.6 Cloudflare Pages Setup

1. Log in to Cloudflare Dashboard → Pages → Create a project
2. Connect to GitHub repo
3. Set build settings:
   - **Build command:** `pnpm install && pnpm --filter @clmm/app export`
   - **Build output directory:** `dist`
4. Add environment variables:
   - `EXPO_PUBLIC_BFF_BASE_URL` → Railway backend URL
   - `NODE_VERSION` → `20`
5. Deploy — verify `https://[project].pages.dev` resolves and loads

---

## Phase 2: Solana Mobile Dapp Store

### 2.1 Solana Mobile SDK Setup — `expo-dev-client` and Polyfill

**Problem:** `@solana-mobile/mobile-wallet-adapter-protocol` includes native Kotlin modules. These only work in a **custom Expo development build**, not Expo Go. The codebase already has the MWA packages installed but is missing the build infrastructure.

**Install packages:**
```bash
pnpm --filter @clmm/app add expo-dev-client react-native-quick-crypto
```

**Create `polyfill.js`** in the project root:
```javascript
// Required first import for react-native-quick-crypto polyfill
// This MUST be the first line executed in the JS bundle
import { install } from 'react-native-quick-crypto';
install();
```

**Update `index.js`** to import polyfill before `expo-router`:
```javascript
import './polyfill';
import 'expo-router/entry';
```

**Update `package.json` main field** (at `apps/app/`):
```json
{
  "main": "./index.js"
}
```

### 2.2 `app.json` Updates — Android Package and Version

**File:** `apps/app/app.json`

Add Android configuration to the existing `app.json`:

```json
{
  "expo": {
    "android": {
      "package": "com.clmm.v2",
      "versionCode": 1,
      "adaptiveIcon": {
        "foregroundImage": "./public/icon.png",
        "backgroundColor": "#0D0D0D"
      },
      "permissions": [
        "android.permission.INTERNET"
      ]
    },
    "web": {
      "bundler": "metro",
      "output": "static",
      "favicon": "./public/favicon.png"
    }
  }
}
```

### 2.3 `eas.json` — Build Profiles

**File:** `apps/app/eas.json`

```json
{
  "cli": {
    "version": ">= 13.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": {
        "buildType": "debug"
      }
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      }
    }
  },
  "submit": {
    "production": {
      "android": {
        "track": "production"
      }
    }
  }
}
```

**Notes:**
- `development` — for local device testing with `expo run:android`
- `preview` — internal test APK via EAS
- `production` — signed AAB for store submission

### 2.4 `app.config.ts` Updates — Add Android Package

After Phase 1 `app.config.ts` is in place, add the Android `package` reference:

```typescript
import type { ConfigContext, ExpoConfig } from 'expo';

const isProduction = process.env.NODE_ENV === 'production';

export default ({ ctx }: ConfigContext): ExpoConfig => ({
  ...require('./app.json'),
  name: isProduction ? 'CLMM V2' : 'CLMM V2 (dev)',
  scheme: 'clmmv2',
  android: {
    package: 'com.clmm.v2',
  },
  extra: {
    eas: {
      projectId: process.env.EAS_PROJECT_ID,
    },
    API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL,
    BFF_BASE_URL: process.env.EXPO_PUBLIC_BFF_BASE_URL,
  },
});
```

### 2.5 Run `expo prebuild`

```bash
cd apps/app
npx expo prebuild --platform android
```

This generates `apps/app/android/` — a native Android Studio project. The MWA Kotlin modules will now be included in builds from this directory.

**Important:** Do NOT manually edit files in `android/` — all native config goes back into `app.json` or `app.config.ts`, then re-run prebuild.

### 2.6 Verify Custom Dev Build

```bash
eas build --platform android --profile development --local
```

Or with a device connected:
```bash
npx expo run:android --variant debug
```

Verify the app installs and the wallet connection flow (MWA authorize + sign) works on a physical device.

### 2.7 Android Signing — EAS Auto-Managed

On the first production build, EAS will prompt to generate an Android keystore:

```bash
eas build --platform android --profile production
```

EAS stores the keystore encrypted in their system. You can also import an existing keystore via:
```bash
eas credentials --platform android
```

### 2.8 Build Production AAB

```bash
eas build --platform android --profile production
```

Download the resulting `.aab` file from the EAS dashboard.

### 2.9 Solana Mobile Publisher Account + Submission

**Account setup (`publish.solanamobile.com`):**
1. Sign up at `publish.solanamobile.com`
2. Complete KYC/KYB (individual or company — takes a few business days)
3. Connect a Solana wallet (Phantom, Solflare) as the publisher wallet
4. Prepare ~0.2 SOL for ArDrive upload fees + release NFT minting

**App store assets to prepare:**
- App icon: 1024×1024 PNG
- Screenshots: 3-5 screenshots of the app running (phone form factor)
- Description: ~3-5 sentences describing CLMM V2
- Category: DeFi / Finance
- Privacy policy URL: `https://[cloudflare-pages-domain]/privacy-policy`
- Support URL: `https://clmm.v2.app` (or a simpler support page)

**Submission steps:**
1. In `publish.solanamobile.com` → "Add a dApp" → "New dApp"
2. Fill in name, description, category, icon, screenshots, privacy policy URL
3. Upload the AAB/APK via "New Version"
4. Sign the ArDrive storage transactions with your publisher wallet
5. Submit — review takes 3-5 business days

---

## Verification Gate

Before each phase is considered complete, the following must be verified:

| Phase | Verification |
|-------|-------------|
| Web build | `pnpm --filter @clmm/app export` succeeds with no errors |
| Backend | `curl [railway-url]/health` returns 200 |
| Web live | `https://[pages-domain]` loads without crash |
| MWA build | Custom APK installs on Android device; wallet authorize dialog appears |
| Privacy policy | `/privacy-policy` returns 200 with content |
| Production AAB | AAB file downloads from EAS dashboard, size > 0 |
| Solana Mobile | AAB submitted and confirmation email received from dapp.store |

---

## Out of Scope

- iOS App Store (skipped per user decision)
- Google Play Store (skipped per user decision)
- `dapp.json` / Solana manifest (Solana Dapp Store uses web portal + APK upload, no manifest required)

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `react-native-quick-crypto` polyfill breaks existing MWA signing flow | Low | Test on physical device early in Phase 2; MWA has been stable in Solana Mobile SDK for 2+ years |
| Railway cold starts cause preview build failures | Medium | Set Railway min instances = 1; use proper health check endpoint |
| Solana Mobile KYC/KYB delays | Medium | Start the KYC process in parallel with Phase 1; it is purely human-facing |
| Cloudflare Pages build timeout | Low | Add `NIKEL_NO_AUTO_ATTACH=1` env var if needed; Expo static export is fast |
| MWA native module conflicts with Expo SDK 52 | Low | Check Solana Mobile SDK changelog for SDK 52 compatibility before installing `expo-dev-client` |
