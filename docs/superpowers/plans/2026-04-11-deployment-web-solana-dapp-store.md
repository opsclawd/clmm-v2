# Web + Solana DApp Store Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy CLMM V2 web app to Cloudflare Pages and NestJS backend to Railway. Then build and submit the Android app to Solana Mobile Dapp Store.

**Architecture:** Two-phase approach. Phase 1 deploys web (Cloudflare Pages static export + Railway backend). Phase 2 adds Solana Mobile SDK polyfill setup and Android AAB build. The monorepo uses Turborepo + pnpm workspaces; `apps/app` is the Expo shell, `packages/adapters` is the NestJS BFF+worker.

**Tech Stack:** Expo SDK 52, Turborepo, pnpm, NestJS (Fastify), Drizzle ORM, pg-boss, Railway Postgres, Cloudflare Pages, EAS Build, Solana Mobile Wallet Adapter Protocol.

---

## Phase 1: Web Deployment

### File Map

| File | Action | Purpose |
|------|--------|---------|
| `apps/app/app.config.ts` | Create | Dynamic env var injection for Expo (replaces `app.json` for runtime config) |
| `apps/app/.env.example` | Create | All required env vars documented for devs and CI |
| `scripts/deploy-web.sh` | Create | Build + Cloudflare Pages deploy script |
| `apps/app/app/(tabs)/privacy-policy.tsx` | Create | Privacy policy page (required for store submissions) |
| `apps/app/app.json` | Modify | Add `scheme: "clmmv2"` if not present, confirm `web.output: "static"` |
| Railway project | External | Railway account + PostgreSQL database + env vars + GitHub connect |
| Cloudflare Pages project | External | GitHub-connected Pages project with build env vars |

---

### Task 1: Create `apps/app/app.config.ts`

**Files:**
- Create: `apps/app/app.config.ts`

- [ ] **Step 1: Read current `apps/app/app.json`**

Read the file to understand existing config before writing `app.config.ts`.

- [ ] **Step 2: Create `apps/app/app.config.ts`**

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

- [ ] **Step 3: Verify `app.json` has required web config**

Confirm `app.json` has `"web": { "output": "static", "bundler": "metro" }`. If not, add it. Also confirm `scheme` is not duplicated.

- [ ] **Step 4: Commit**

```bash
git add apps/app/app.config.ts apps/app/app.json
git commit -m "feat: add app.config.ts for dynamic environment configuration"
```

---

### Task 2: Create `apps/app/.env.example`

**Files:**
- Create: `apps/app/.env.example`

- [ ] **Step 1: Create `apps/app/.env.example`**

```bash
# =============================================================================
# CLMM V2 — Environment Variables
# =============================================================================
# Copy this file to .env and fill in the values.
# NEVER commit .env files to version control.

# -----------------------------------------------------------------------------
# Backend (NestJS BFF — deploy to Railway)
# -----------------------------------------------------------------------------
DATABASE_URL=postgresql://user:password@host:5432/clmm
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
PORT=3001

# The base URL of the deployed Railway backend (used by web/mobile to call the BFF)
EXPO_PUBLIC_BFF_BASE_URL=https://your-railway-app.up.railway.app

# The public API base URL (used for OpenAPI docs, health checks, etc.)
EXPO_PUBLIC_API_BASE_URL=https://your-railway-app.up.railway.app

# -----------------------------------------------------------------------------
# EAS Build (for mobile builds — not used by web)
# -----------------------------------------------------------------------------
EAS_PROJECT_ID=your-eas-project-id

# -----------------------------------------------------------------------------
# Apple App Store (iOS — skipped for now)
# -----------------------------------------------------------------------------
# APPLE_TEAM_ID=
# APPLE_APP_SPECIFIC_PASSWORD=
# APPLE_ID=
```

- [ ] **Step 2: Commit**

```bash
git add apps/app/.env.example
git commit -m "feat: add .env.example documenting all required environment variables"
```

---

### Task 3: Create `scripts/deploy-web.sh`

**Files:**
- Create: `scripts/deploy-web.sh`

- [ ] **Step 1: Ensure `scripts/` directory exists**

```bash
mkdir -p scripts
```

- [ ] **Step 2: Create `scripts/deploy-web.sh`**

```bash
#!/bin/bash
set -e

echo "=== CLMM V2 Web Deploy ==="

# Build the web app using expo export
echo "Building web app..."
pnpm --filter @clmm/app export

# Deploy to Cloudflare Pages
# Requires wrangler CLI: npm install -g wrangler
# Or use the Cloudflare Pages GitHub integration for automatic deploys
echo "Deploying to Cloudflare Pages..."
npx wrangler pages deploy dist --project-name=clmm-v2

echo "=== Deploy complete ==="
```

- [ ] **Step 3: Make the script executable**

```bash
chmod +x scripts/deploy-web.sh
```

- [ ] **Step 4: Commit**

```bash
git add scripts/deploy-web.sh
git commit -m "feat: add web deploy script for Cloudflare Pages"
```

---

### Task 4: Create Privacy Policy Page

**Files:**
- Create: `apps/app/app/(tabs)/privacy-policy.tsx` (or `apps/app/app/privacy-policy.tsx` if not using tab layout)

- [ ] **Step 1: Check existing route layout to determine correct path**

```bash
ls apps/app/app/
```

Use the existing layout convention (e.g., if `(tabs)/` exists, use `apps/app/app/(tabs)/privacy-policy.tsx`).

- [ ] **Step 2: Create `apps/app/app/(tabs)/privacy-policy.tsx`**

```typescript
import { View, Text, ScrollView } from 'react-native';
import { Link } from 'expo-router';

export default function PrivacyPolicy() {
  return (
    <ScrollView style={{ padding: 24 }}>
      <Text style={{ fontSize: 28, fontWeight: 'bold', marginBottom: 16 }}>
        Privacy Policy
      </Text>
      <Text style={{ fontSize: 16, lineHeight: 24, marginBottom: 16 }}>
        CLMM V2 is a non-custodial application. We do not collect, store, or
        transmit your personal data.
      </Text>
      <Text style={{ fontSize: 16, lineHeight: 24, marginBottom: 16 }}>
        We do not use analytics trackers, cookies, or any third-party data
        collection services.
      </Text>
      <Text style={{ fontSize: 16, lineHeight: 24, marginBottom: 16 }}>
        All transaction signing occurs entirely within your own wallet. CLMM V2
        never accesses your private keys or seed phrases.
      </Text>
      <Text style={{ fontSize: 16, lineHeight: 24, marginBottom: 16 }}>
        If you have questions, contact us at{' '}
        <Link href="mailto:support@clmm.v2.app">
          support@clmm.v2.app
        </Link>
        .
      </Text>
    </ScrollView>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/privacy-policy.tsx  # adjust path after checking in step 1
git commit -m "feat: add privacy policy page required for store submissions"
```

---

### Task 5: Deploy Backend to Railway

**Files:**
- Modify: Railway dashboard (external — no code changes)
- Modify: `packages/adapters/.env.sample` (update if needed)

> Railway deploys from GitHub directly. The key config happens in the Railway dashboard.

**Railway Configuration:**

1. Go to `railway.xyz` → New Project → "Deploy from GitHub repo"
2. Select the `clmm-superpowers-v2` repo
3. Railway will auto-detect NestJS — confirm the start command:
   - **API server:** `node packages/adapters/dist/inbound/http/main.js`
   - **Worker:** `node packages/adapters/dist/inbound/jobs/main.js`
   - Note: Railway may suggest `npm start` or `pnpm start` — override to the correct entry points above. The build command should be `pnpm install && pnpm --filter @clmm/adapters build`
4. Add a PostgreSQL database (Railway → "Add Database" → "PostgreSQL")
5. Set environment variables in Railway:
   - `DATABASE_URL` ← set automatically by Railway when PostgreSQL is added
   - `SOLANA_RPC_URL` ← your Helius/QuickNode RPC URL (get one at `helius.xyz` — free tier available)
   - `PORT=3001`
   - `EXPO_PUBLIC_BFF_BASE_URL` ← will be `https://[app-name].up.railway.app` after first deploy

**Railway build settings:**
- **Build command:** `pnpm install && pnpm --filter @clmm/adapters build`
- **Start command (API):** `node packages/adapters/dist/inbound/http/main.js`
- **Start command (Worker):** `node packages/adapters/dist/inbound/jobs/main.js`
- Deploy two separate services: one for the HTTP API, one for the worker

- [ ] **Step 1: Run Drizzle migrations against the new Railway database**

After Railway deploys the API successfully:

```bash
# Set DATABASE_URL from Railway dashboard, then:
pnpm --filter @clmm/adapters db:migrate
```

- [ ] **Step 2: Verify API health**

```bash
curl https://[your-railway-app].up.railway.app/health
# Expected: 200 OK with JSON response
```

- [ ] **Step 3: Commit Railway env var updates**

If you modified `packages/adapters/.env.sample` or any config, commit it.

```bash
git add packages/adapters/.env.sample
git commit -m "docs: update .env.sample with Railway deployment notes"
```

---

### Task 6: Cloudflare Pages Setup

**Files:**
- Modify: Cloudflare Pages dashboard (external — no code changes)

> Cloudflare Pages connects to GitHub for automatic deploys on push to `main`.

**Cloudflare Pages Configuration:**

1. Go to Cloudflare Dashboard → Pages → Create a project
2. Connect to GitHub repo `opsclawd/clmm-superpowers-v2`
3. Set build settings:
   - **Project name:** `clmm-v2`
   - **Build command:** `pnpm install && pnpm --filter @clmm/app export`
   - **Build output directory:** `dist`
   - **Root directory:** `/` (default)
4. Add environment variables:
   - `NODE_VERSION` = `20`
   - `EXPO_PUBLIC_BFF_BASE_URL` = `https://[your-railway-app].up.railway.app`
5. Deploy

- [ ] **Step 1: Verify web app is live**

```bash
curl https://[project].pages.dev/
# Expected: 200 with HTML content (the CLMM V2 web app)
```

- [ ] **Step 2: Verify privacy policy page is accessible**

```bash
curl https://[project].pages.dev/privacy-policy
# Expected: 200 with privacy policy content
```

- [ ] **Step 3: Commit Cloudflare Pages setup (if any code changes resulted)**

If any `app.json` or `app.config.ts` changes were needed for the web build to succeed, commit them now.

---

## Phase 2: Solana Mobile Dapp Store

### File Map

| File | Action | Purpose |
|------|--------|---------|
| `polyfill.js` | Create (project root) | Required first import for `react-native-quick-crypto` |
| `index.js` | Create (project root) | Custom entry point that imports polyfill before expo-router |
| `apps/app/package.json` | Modify | Update `main` field to `./index.js` |
| `apps/app/app.json` | Modify | Add Android `package`, `versionCode`, `adaptiveIcon`, permissions |
| `apps/app/eas.json` | Create | EAS build profiles (development, preview, production) |
| `apps/app/app.config.ts` | Modify | Add Android `package: "com.clmm.v2"` |
| `apps/app/android/` | Generate | Run `expo prebuild --platform android` |

---

### Task 7: Install Solana Mobile SDK Dependencies

- [ ] **Step 1: Install `expo-dev-client` and `react-native-quick-crypto`**

```bash
cd apps/app
pnpm add expo-dev-client react-native-quick-crypto
```

- [ ] **Step 2: Verify the packages installed correctly**

```bash
cat apps/app/package.json | grep -E "expo-dev-client|react-native-quick-crypto"
```

- [ ] **Step 3: Commit**

```bash
git add apps/app/package.json pnpm-lock.yaml
git commit -m "feat: install expo-dev-client and react-native-quick-crypto for Solana Mobile SDK"
```

---

### Task 8: Create `polyfill.js` and Custom `index.js`

**Files:**
- Create: `polyfill.js` (project root — next to `package.json`)
- Create: `index.js` (project root — next to `package.json`)
- Modify: `apps/app/package.json` (update `main` field)

- [ ] **Step 1: Create `polyfill.js` in project root**

```javascript
// polyfill.js — MUST be the first import in the JS bundle
// Required for @solana/web3.js to work correctly in React Native.
// react-native-quick-crypto provides a Node.js-compatible crypto polyfill
// that the Solana Mobile SDK depends on.
import { install } from 'react-native-quick-crypto';
install();
```

- [ ] **Step 2: Create `index.js` in project root**

```javascript
// index.js — Custom entry point for Expo
// The polyfill MUST load before any other module, especially before
// expo-router and any @solana/web3.js code.
import './polyfill';
import 'expo-router/entry';
```

- [ ] **Step 3: Read `apps/app/package.json` and update `main` field**

```bash
cat apps/app/package.json | grep -A2 '"main"'
```

If `"main"` is `"expo-router/entry"`, update it to `"./index.js"`.

```json
{
  "main": "./index.js"
}
```

- [ ] **Step 4: Commit**

```bash
git add polyfill.js index.js apps/app/package.json
git commit -m "feat: add react-native-quick-crypto polyfill and custom index.js entry point"
```

---

### Task 9: Update `app.json` with Android Configuration

**Files:**
- Modify: `apps/app/app.json`

- [ ] **Step 1: Read current `apps/app/app.json`**

- [ ] **Step 2: Update `apps/app/app.json` to add Android config**

Merge the Android block into the existing `expo` object:

```json
{
  "expo": {
    "name": "CLMM V2",
    "slug": "clmm-v2",
    "version": "1.0.0",
    "scheme": "clmmv2",
    "platforms": ["ios", "android", "web"],
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

> **Note:** If `apps/app/public/icon.png` does not exist, create a 1024×1024 PNG icon at that path before prebuild, or the adaptive icon will fail. A placeholder PNG is fine for now.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app.json
git commit -m "feat: add Android package and adaptive icon to app.json"
```

---

### Task 10: Create `eas.json`

**Files:**
- Create: `apps/app/eas.json`

- [ ] **Step 1: Create `apps/app/eas.json`**

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

- [ ] **Step 2: Commit**

```bash
git add apps/app/eas.json
git commit -m "feat: add EAS build profiles for development, preview, and production"
```

---

### Task 11: Update `app.config.ts` with Android Package

**Files:**
- Modify: `apps/app/app.config.ts` (add `android` block to existing config)

- [ ] **Step 1: Read current `apps/app/app.config.ts`**

The file already has `name`, `scheme`, and `extra` from Task 1. Only the `android` block needs to be added.

- [ ] **Step 2: Add Android `package` to the config**

In `apps/app/app.config.ts`, add `android: { package: 'com.clmm.v2' }` to the returned config object:

```typescript
  android: {
    package: 'com.clmm.v2',
  },
```

- [ ] **Step 3: Commit**

```bash
git add apps/app/app.config.ts
git commit -m "feat: add Android package to app.config.ts"
```

---

### Task 12: Run `expo prebuild` to Generate Native Android Directory

**Files:**
- Generate: `apps/app/android/` (auto-generated by expo prebuild)
- Generate: `apps/app/ios/` (auto-generated, not used for Solana Mobile but required by prebuild)

- [ ] **Step 1: Verify icon file exists**

```bash
ls apps/app/public/icon.png 2>/dev/null && echo "exists" || echo "missing — create a 1024x1024 PNG placeholder"
```

If missing, create a minimal placeholder or the prebuild adaptive icon step will fail.

- [ ] **Step 2: Run `expo prebuild`**

```bash
cd apps/app
npx expo prebuild --platform android --clean
```

The `--clean` flag ensures a fresh native directory. This will:
- Generate `apps/app/android/` with MWA Kotlin modules included
- Configure the Android manifest with `com.clmm.v2` package
- Set up the adaptive icon

- [ ] **Step 3: Verify `android/` directory was generated**

```bash
ls apps/app/android/
# Expected: app/, build.gradle, settings.gradle, gradle/, etc.
```

- [ ] **Step 4: Commit the generated `android/` directory**

```bash
git add apps/app/android/
git commit -m "feat: generate native Android project via expo prebuild"
```

---

### Task 13: Verify Custom Dev Build on Android Device

- [ ] **Step 1: Build and install development APK on connected device**

```bash
cd apps/app
npx expo run:android --variant debug
```

Or build locally with EAS:
```bash
eas build --platform android --profile development --local
```

- [ ] **Step 2: Verify the app launches and MWA works**

On a physical Android device:
1. Open CLMM V2
2. Attempt to connect a wallet
3. Verify the Mobile Wallet Adapter authorize dialog appears (this confirms MWA native modules are working)

- [ ] **Step 3: Commit any resulting fixes**

If any code changes were needed to fix build issues, commit them.

---

### Task 14: Build Production AAB

- [ ] **Step 1: Login to EAS**

```bash
eas login
```

- [ ] **Step 2: Configure EAS project**

```bash
cd apps/app
eas project:init
# Select "Android" when asked
```

- [ ] **Step 3: Build production AAB**

```bash
eas build --platform android --profile production
```

EAS will prompt you to generate an Android keystore on first build — accept this (EAS stores it encrypted).

- [ ] **Step 4: Download the AAB from EAS dashboard**

Go to `https://expo.dev` → your project → Builds → download the production AAB.

- [ ] **Step 5: Commit any configuration changes resulting from `eas project:init`**

```bash
git add apps/app/eas.json apps/app/app.config.ts  # ensure eas project ID is reflected
git commit -m "feat: configure EAS project for production Android builds"
```

---

### Task 15: Solana Mobile Publisher Account + Submission

**Human-only steps (no code changes):**

- [ ] **Step 1: Sign up for Solana Mobile publisher account**

Go to `publish.solanamobile.com` → Sign up → complete KYC/KYB (individual or company)

- [ ] **Step 2: Prepare store assets**

- App icon: 1024×1024 PNG
- Screenshots: 3-5 screenshots of CLMM V2 running (phone form factor, 1080×1920 or similar)
- Description (3-5 sentences): "CLMM V2 monitors your Orca whirlpool positions on Solana and alerts you when they go out of range. It prepares the optimal exit path — remove liquidity, collect fees, swap — and hands signing entirely to your wallet. Never get caught in an out-of-range position again."
- Category: DeFi / Finance
- Privacy policy URL: `https://[your-cloudflare-pages-domain]/privacy-policy`
- Support URL: `https://clmm.v2.app`

- [ ] **Step 3: Submit AAB to dapp store**

1. Go to `publish.solanamobile.com` → "Add a dApp" → "New dApp"
2. Fill in name, description, category, icon, screenshots, privacy policy URL
3. Upload the AAB file via "New Version"
4. Sign the ArDrive storage transactions with your publisher wallet
5. Submit

- [ ] **Step 4: Verify submission**

You should receive a confirmation email from `publish.solanamobile.com`. The review process takes 3-5 business days.

---

## Verification Checklist

| # | Task | Verification Command/Action | Expected Result |
|---|------|---------------------------|----------------|
| 1 | `app.config.ts` created | `ls apps/app/app.config.ts` | File exists |
| 2 | `.env.example` created | `cat apps/app/.env.example` | File has all vars |
| 3 | `deploy-web.sh` executable | `bash scripts/deploy-web.sh --help` (or dry run) | Script runs without error |
| 4 | Privacy policy page | `curl localhost:3000/privacy-policy` after local dev | 200 + content |
| 5 | Railway API health | `curl [railway-url]/health` | 200 OK |
| 6 | Cloudflare Pages live | `curl [pages-domain]/` | 200 with app content |
| 7 | Privacy policy on web | `curl [pages-domain]/privacy-policy` | 200 + policy text |
| 8 | `expo-dev-client` installed | `cat apps/app/package.json \| grep expo-dev-client` | Package present |
| 9 | `polyfill.js` created | `cat polyfill.js` | First line imports `react-native-quick-crypto` |
| 10 | `index.js` entry point | `cat index.js` | Imports `./polyfill` before `expo-router/entry` |
| 11 | Android package in `app.json` | `cat apps/app/app.json \| grep '"package"'` | `"com.clmm.v2"` |
| 12 | `eas.json` created | `cat apps/app/eas.json` | Has development/preview/production profiles |
| 13 | `expo prebuild` ran | `ls apps/app/android/` | Android directory exists |
| 14 | Dev build works | Physical Android device, wallet authorize dialog | MWA authorize screen appears |
| 15 | Production AAB | `ls ~/Downloads/*.aab` or EAS dashboard | AAB size > 0 |
| 16 | Solana Mobile submitted | Email confirmation from dapp.store | 3-5 day review started |

---

## Spec Coverage Check

| Spec Section | Tasks |
|-------------|-------|
| Phase 1 Web: `app.config.ts` | Task 1 |
| Phase 1 Web: `.env.example` | Task 2 |
| Phase 1 Web: `deploy-web.sh` | Task 3 |
| Phase 1 Web: Privacy policy page | Task 4 |
| Phase 1 Web: Railway backend | Task 5 |
| Phase 1 Web: Cloudflare Pages | Task 6 |
| Phase 2 Solana: `expo-dev-client` + polyfill | Tasks 7, 8 |
| Phase 2 Solana: `app.json` Android config | Task 9 |
| Phase 2 Solana: `eas.json` | Task 10 |
| Phase 2 Solana: `app.config.ts` Android | Task 11 |
| Phase 2 Solana: `expo prebuild` | Task 12 |
| Phase 2 Solana: Dev build verification | Task 13 |
| Phase 2 Solana: Production AAB | Task 14 |
| Phase 2 Solana: Store submission | Task 15 |
| Verification gate | Verification checklist |
| Out of scope: iOS, Google Play | — |

All spec sections have corresponding tasks. No placeholder gaps found.
