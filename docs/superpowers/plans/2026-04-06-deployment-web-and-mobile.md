# Deployment: Web Static Release + Mobile Store Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up repeatable deployment workflows for the CLMM V2 web app (static Expo export to a host) and mobile app (EAS Build + EAS Submit to app stores).

**Architecture:** The web path extends the existing `expo export` build with environment configuration and a deploy script. The mobile path adds `eas.json` with build/submit profiles, native identifiers in `app.json`, and a release script. Both paths share validation gates run before any release.

**Tech Stack:** Expo SDK 52, EAS Build/Submit, pnpm monorepo with Turbo, shell scripts for release orchestration.

**Spec:** `docs/superpowers/specs/2026-04-06-deployment-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `apps/app/app.json` | Modify: add iOS `bundleIdentifier`, Android `package`, version metadata |
| `apps/app/eas.json` | Create: EAS build profiles (development, preview, production) and submit config |
| `apps/app/.env.example` | Create: document all required env vars with placeholder values |
| `apps/app/app.config.ts` | Create: dynamic Expo config that reads env vars and merges with `app.json` |
| `scripts/validate-release.sh` | Create: shared validation gate script (typecheck, lint, boundaries, tests, web export) |
| `scripts/deploy-web.sh` | Create: web release script (validate, build, deploy placeholder) |
| `scripts/release-mobile.sh` | Create: mobile release script (validate, EAS build, EAS submit) |
| `package.json` (root) | Modify: add release convenience scripts |

---

### Task 1: Add Native Identifiers and Version Metadata to app.json

**Files:**
- Modify: `apps/app/app.json`

- [ ] **Step 1: Read current app.json and plan changes**

Verify the current state matches what we expect: no `ios` or `android` keys, `version` is `"1.0.0"`.

- [ ] **Step 2: Add iOS and Android identifiers**

Update `apps/app/app.json` to add platform-specific config:

```json
{
  "expo": {
    "name": "CLMM V2",
    "slug": "clmm-v2",
    "version": "1.0.0",
    "scheme": "clmmv2",
    "platforms": ["ios", "android", "web"],
    "ios": {
      "bundleIdentifier": "com.clmm.v2",
      "buildNumber": "1",
      "supportsTablet": true
    },
    "android": {
      "package": "com.clmm.v2",
      "versionCode": 1,
      "adaptiveIcon": {
        "foregroundImage": "./public/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      }
    },
    "web": {
      "bundler": "metro",
      "output": "static",
      "favicon": "./public/favicon.png"
    }
  }
}
```

Note: The `bundleIdentifier` and `package` values (`com.clmm.v2`) are placeholders. The project owner should confirm the final identifiers before store submission.

- [ ] **Step 3: Verify the app still builds for web**

Run: `cd apps/app && npx expo export --platform web --output-dir dist-check`
Expected: Successful export with no errors. Remove `dist-check` after verifying.

- [ ] **Step 4: Commit**

```bash
git add apps/app/app.json
git commit -m "feat: add iOS and Android native identifiers to app.json"
```

---

### Task 2: Create Dynamic App Config (app.config.ts)

**Files:**
- Create: `apps/app/app.config.ts`
- Modify: `apps/app/app.json` (remove fields that move to dynamic config)

The dynamic config reads environment variables at build time and merges them with the static `app.json`. This enables environment-specific values (API URLs, feature flags) without hardcoding.

- [ ] **Step 1: Create app.config.ts**

Create `apps/app/app.config.ts`:

```typescript
import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  return {
    ...config,
    name: config.name ?? "CLMM V2",
    slug: config.slug ?? "clmm-v2",
    extra: {
      apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8787",
      eas: {
        projectId: process.env.EAS_PROJECT_ID ?? "",
      },
    },
  };
};
```

- [ ] **Step 2: Verify the config loads**

Run: `cd apps/app && npx expo config --type public`
Expected: Output shows merged config with `extra.apiBaseUrl` defaulting to localhost.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app.config.ts
git commit -m "feat: add dynamic app.config.ts for env-based configuration"
```

---

### Task 3: Create .env.example

**Files:**
- Create: `apps/app/.env.example`

Document all environment variables the deployment workflows need. This is the single source of truth for what must be set.

- [ ] **Step 1: Create .env.example**

Create `apps/app/.env.example`:

```bash
# Web & Mobile: public API base URL (browser/app safe)
EXPO_PUBLIC_API_BASE_URL=https://api.example.com

# EAS: project ID from expo.dev
EAS_PROJECT_ID=

# Mobile only: Apple credentials (used by EAS Submit)
# Set in EAS secrets or CI — never commit values
APPLE_ID=
APPLE_TEAM_ID=
ASC_APP_ID=

# Mobile only: Google Play credentials
# Set in EAS secrets or CI — never commit values
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=
```

- [ ] **Step 2: Verify .gitignore excludes .env but not .env.example**

Check that `.env` is in `.gitignore`. If not, add it.

Run: `grep -q "^\.env$" apps/app/.gitignore 2>/dev/null || grep -q "^\.env$" .gitignore 2>/dev/null && echo "OK" || echo "NEEDS_ADD"`

If `NEEDS_ADD`: add `.env` to the root `.gitignore`.

- [ ] **Step 3: Commit**

```bash
git add apps/app/.env.example
git commit -m "docs: add .env.example with all deployment env vars"
```

---

### Task 4: Create eas.json with Build and Submit Profiles

**Files:**
- Create: `apps/app/eas.json`

- [ ] **Step 1: Create eas.json**

Create `apps/app/eas.json`:

```json
{
  "cli": {
    "version": ">= 15.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": true
      }
    },
    "preview": {
      "distribution": "internal",
      "ios": {
        "simulator": false
      }
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "${APPLE_ID}",
        "ascAppId": "${ASC_APP_ID}",
        "appleTeamId": "${APPLE_TEAM_ID}"
      },
      "android": {
        "serviceAccountKeyPath": "${GOOGLE_SERVICE_ACCOUNT_KEY_PATH}",
        "track": "internal"
      }
    }
  }
}
```

Note: `appVersionSource: "remote"` lets EAS manage monotonic build numbers. `autoIncrement: true` on production ensures store-required version bumps.

- [ ] **Step 2: Verify EAS config is valid**

Run: `cd apps/app && npx eas-cli build:configure --platform all 2>&1 | head -20`

This may prompt for login — that's expected. The key check is that `eas.json` parses without errors. If `eas-cli` is not installed, install it first: `pnpm add -D eas-cli` in the app package.

- [ ] **Step 3: Commit**

```bash
git add apps/app/eas.json
git commit -m "feat: add eas.json with dev/preview/production build profiles"
```

---

### Task 5: Create Shared Validation Gate Script

**Files:**
- Create: `scripts/validate-release.sh`

This script runs all checks that must pass before any release (web or mobile). It exits non-zero on first failure.

- [ ] **Step 1: Create scripts directory if needed**

Run: `mkdir -p scripts`

- [ ] **Step 2: Create validate-release.sh**

Create `scripts/validate-release.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=== Release Validation ==="

echo "[1/5] Installing dependencies..."
pnpm install --frozen-lockfile

echo "[2/5] Typecheck..."
pnpm typecheck

echo "[3/5] Lint..."
pnpm lint

echo "[4/5] Dependency boundaries..."
pnpm boundaries

echo "[5/6] Tests..."
pnpm test

echo "[6/6] Web export build..."
pnpm --filter @clmm/app build

echo "=== All validation gates passed ==="
```

- [ ] **Step 3: Make it executable**

Run: `chmod +x scripts/validate-release.sh`

- [ ] **Step 4: Commit**

```bash
git add scripts/validate-release.sh
git commit -m "feat: add shared release validation gate script"
```

---

### Task 6: Create Web Deploy Script

**Files:**
- Create: `scripts/deploy-web.sh`
- Modify: `package.json` (root)

- [ ] **Step 1: Create deploy-web.sh**

Create `scripts/deploy-web.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$REPO_ROOT/apps/app"
DIST_DIR="$APP_DIR/dist"

echo "=== Web Deployment ==="

# Step 1: Validate
echo "[1/3] Running validation gates..."
"$SCRIPT_DIR/validate-release.sh"

# Step 2: Build
echo "[2/3] Building web export..."
pnpm --filter @clmm/app build

if [ ! -f "$DIST_DIR/index.html" ]; then
  echo "ERROR: Web export failed — dist/index.html not found"
  exit 1
fi

echo "Web export ready at: $DIST_DIR"

# Step 3: Deploy
# TODO: Replace with actual deploy command for chosen static host.
# Examples:
#   Vercel:     vercel deploy --prod "$DIST_DIR"
#   Cloudflare: wrangler pages deploy "$DIST_DIR" --project-name clmm-v2
#   Netlify:    netlify deploy --prod --dir "$DIST_DIR"
echo "[3/3] Deploy step — not yet configured."
echo "To deploy manually, upload the contents of: $DIST_DIR"

echo "=== Web deployment script complete ==="
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x scripts/deploy-web.sh`

- [ ] **Step 3: Add root package.json scripts**

Add to root `package.json` scripts:

```json
"deploy:web": "bash scripts/deploy-web.sh",
"validate:release": "bash scripts/validate-release.sh"
```

- [ ] **Step 4: Test the script runs (dry run)**

Run: `bash scripts/deploy-web.sh`
Expected: Validation runs, web export builds, deploy step prints the TODO message. If validation fails on lint/test issues, that's acceptable — it proves the gate works.

- [ ] **Step 5: Commit**

```bash
git add scripts/deploy-web.sh package.json
git commit -m "feat: add web deploy script with validation and build"
```

---

### Task 7: Create Mobile Release Script

**Files:**
- Create: `scripts/release-mobile.sh`
- Modify: `package.json` (root)

- [ ] **Step 1: Create release-mobile.sh**

Create `scripts/release-mobile.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$REPO_ROOT/apps/app"

PLATFORM="${1:-all}"  # ios, android, or all

if [[ "$PLATFORM" != "ios" && "$PLATFORM" != "android" && "$PLATFORM" != "all" ]]; then
  echo "Usage: $0 [ios|android|all]"
  exit 1
fi

echo "=== Mobile Release (platform: $PLATFORM) ==="

# Step 1: Validate
echo "[1/4] Running validation gates..."
"$SCRIPT_DIR/validate-release.sh"

# Step 2: EAS Build
echo "[2/4] Starting EAS production build..."
cd "$APP_DIR"
npx eas-cli build --profile production --platform "$PLATFORM" --non-interactive

# Step 3: EAS Submit
echo "[3/4] Submitting to stores..."
npx eas-cli submit --profile production --platform "$PLATFORM" --non-interactive

# Step 4: Done
echo "[4/4] Submission complete."
echo "Check build/submission status at: https://expo.dev"
echo "=== Mobile release script complete ==="
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x scripts/release-mobile.sh`

- [ ] **Step 3: Add root package.json script**

Add to root `package.json` scripts:

```json
"release:mobile": "bash scripts/release-mobile.sh"
```

- [ ] **Step 4: Commit**

```bash
git add scripts/release-mobile.sh package.json
git commit -m "feat: add mobile release script with EAS build and submit"
```

---

### Task 8: Add eas-cli Dev Dependency

**Files:**
- Modify: `apps/app/package.json`

- [ ] **Step 1: Add eas-cli**

Run: `cd /home/gpoontip/clmm-superpowers-v2 && pnpm --filter @clmm/app add -D eas-cli`

- [ ] **Step 2: Verify it installed**

Run: `cd apps/app && npx eas-cli --version`
Expected: Prints a version number.

- [ ] **Step 3: Commit**

```bash
git add apps/app/package.json pnpm-lock.yaml
git commit -m "chore: add eas-cli dev dependency"
```

---

## Resolved Decisions

These were called out in the spec's "Open Decisions" section. All have been decided:

1. **Static host: Cloudflare Pages** — Use Cloudflare Pages for web hosting. It handles pure static Expo exports well, keeps web hosting separate from the Railway backend, and provides SPA-style routing with low ops overhead. The `deploy-web.sh` script should use `wrangler pages deploy`.
2. **TestFlight / Internal Testing: required before production** — Use TestFlight (iOS) and Internal Testing track (Android) before any public store submission. The app has wallet handoff, deep links, and signing flows that need device-specific regression testing. Treat the `preview` EAS profile as a mandatory pre-prod gate, then promote to `production`. Update `release-mobile.sh` to build with `preview` first and require manual promotion.
3. **No separate staging environment yet** — A meaningful staging split only helps when backend, database, and release tooling are also separated. An app-only staging URL gives false confidence. Add staging later as a full-stack environment, not just a different `EXPO_PUBLIC_API_BASE_URL`.
4. **Bundle identifiers: lock org-owned reverse-DNS now** — `com.clmm.v2` remains the placeholder in code. Before first store submission, replace with the real org-owned identifier (e.g. `com.<org>.clmmv2`). Changing bundle IDs after store submission is painful, so finalize before the first build hits TestFlight/Internal Testing.
5. **EAS Project ID: create immediately, store in secrets** — Create the Expo project on expo.dev now and set `EAS_PROJECT_ID` via CI/EAS secrets. Do not hardcode the value in the repo. It is documented in `apps/app/.env.example` as a required variable.
