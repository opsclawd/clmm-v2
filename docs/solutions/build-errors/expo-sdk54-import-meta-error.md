---
title: "Uncaught SyntaxError: import.meta may only appear in a module after Expo SDK 54 upgrade"
date: "2026-04-26"
category: docs/solutions/build-errors
module: Expo SDK 54 upgrade
problem_type: build_error
component: tooling
symptoms:
  - "Uncaught SyntaxError: import.meta may only appear in a module (web bundle)"
  - "Zustand store fails to load in web browser"
  - "Metro web bundle contains ESM-only code (import.meta.env) that cannot run in classic script tags"
root_cause: config_error
resolution_type: config_change
severity: high
tags: [expo, sdk-54, metro, package-exports, import-meta, web-bundle]
---

# Uncaught SyntaxError: import.meta may only appear in a module after Expo SDK 54 upgrade

## Problem

After upgrading from Expo SDK 52 to SDK 54, the web bundle fails to load in the browser with:
`Uncaught SyntaxError: import.meta may only appear in a module`

## Symptoms

- Browser shows: `Uncaught SyntaxError: import.meta may only appear in a module`
- Zustand store fails to load in the web browser
- Works correctly on iOS/Android (native bundle)

## Solution

Disable Metro's package exports resolution in `apps/app/metro.config.js`:

```javascript
config.resolver.unstable_enablePackageExports = false
```

## Why This Works

SDK 54 changed the default of `unstable_enablePackageExports` from `false` to `true`. When enabled, Metro resolves packages through their `exports` map, selecting ESM files that contain `import.meta.env`. Expo's web output uses classic `<script>` tags (not `<script type="module">`), so `import.meta` is a syntax error in the browser.

Disabling this restores SDK 52 resolution behavior. The existing `resolveRequest` handler already manually maps `@solana/connector/*` subpaths and does not depend on Metro's exports resolution.

## Prevention

When upgrading Expo SDK versions, verify `metro.config.js` against the new Expo template. Check for changes to resolver defaults that could affect web builds.