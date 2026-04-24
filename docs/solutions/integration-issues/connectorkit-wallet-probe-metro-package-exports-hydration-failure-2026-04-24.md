---
title: ConnectorKit wallet probe Metro package exports hydration failure
date: 2026-04-24
category: integration-issues
module: apps/app
problem_type: integration_issue
component: tooling
symptoms:
  - Expo web export builds successfully, but the spike wallet route never hydrates
  - Spike wallet route shows Platform Linux x86_64 and User Agent Node.js/22 in the browser
  - Wallet discovery reports zero connectors and Debug JSON stays empty
  - Browser bundle contains import.meta references under apps/app/dist/_expo/static/js/web
root_cause: config_error
resolution_type: config_change
severity: high
tags: [expo, metro, connectorkit, package-exports, hydration, zustand, solana-kit]
---

# ConnectorKit wallet probe Metro package exports hydration failure

## Problem

The ConnectorKit wallet spike route initially failed the Expo export because Metro could not resolve `@solana/connector/headless`. After installing and wiring ConnectorKit, the build passed but the browser still showed the server-rendered Node environment:

```text
ConnectorKit Wallet Spike
Environment
Platform: Linux x86_64
User Agent: Node.js/22
Wallet Discovery
Connectors (0):
None found
Debug JSON
{}
```

The route looked like a ConnectorKit wallet discovery failure, but React had not hydrated at all. The page was still displaying the static export output produced by Node.

## Symptoms

- `pnpm --filter @clmm/app build` completed successfully.
- Visiting `/spike-wallet` showed Node platform and user-agent values in the browser.
- `connectors.length` stayed `0`, `isConnected` stayed `false`, and debug JSON stayed `{}`.
- A browser smoke test did not see client-side debug state.
- Inspecting the generated web bundle showed `import.meta` references:

```bash
rg "import\.meta" apps/app/dist/_expo/static/js/web
```

Those references came from Zustand ESM code using `import.meta.env`. Expo emitted the bundle as a classic deferred script, not a module script, so the browser failed before hydration could run.

## What Didn't Work

- Enabling `config.resolver.unstable_enablePackageExports = true` globally in `apps/app/metro.config.js`. This helped Metro resolve Solana package subpaths, but it also changed resolution for unrelated packages. Metro selected an ESM path from Zustand that contained `import.meta.env`, which is invalid inside Expo's classic web bundle script.
- Treating `Connectors (0)` as the root failure. ConnectorKit never got a meaningful chance to discover wallets because the app crashed before hydration.
- Relying on a passing `expo export` alone. Static export can succeed while producing a browser bundle that fails immediately at runtime.

## Solution

Remove the global package-exports resolver change and target only the Solana subpath that Metro could not resolve.

In `apps/app/metro.config.js`, keep default Metro resolution for the rest of the dependency graph and intercept only `@solana/kit/program-client-core`:

```javascript
function resolveSolanaKitProgramClientCore(platform) {
  const kitDistRoot = path.dirname(require.resolve('@solana/kit', {
    paths: [projectRoot, workspaceRoot],
  }));
  const fileName =
    platform === 'web'
      ? 'program-client-core.browser.mjs'
      : platform === 'ios' || platform === 'android'
        ? 'program-client-core.native.mjs'
        : 'program-client-core.node.mjs';

  return {
    type: 'sourceFile',
    filePath: path.join(kitDistRoot, fileName),
  };
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@solana/kit/program-client-core') {
    return resolveSolanaKitProgramClientCore(platform);
  }

  if ((moduleName.startsWith('.') || moduleName.startsWith('/')) && moduleName.endsWith('.js')) {
    const extensionlessName = moduleName.replace(/\.js$/, '');

    try {
      return context.resolveRequest(context, extensionlessName, platform);
    } catch {
      // Fall back to the emitted .js path below.
    }
  }

  return context.resolveRequest(context, moduleName, platform);
};
```

Then make the diagnostic route prove client hydration explicitly. In `apps/app/app/spike-wallet.web.tsx`, initialize environment fields as pending client state and populate them from `window` and `navigator` inside `useEffect`:

```typescript
const [environment, setEnvironment] = useState({
  platform: 'pending client hydration',
  userAgent: 'pending client hydration',
  hasPhantom: false,
});

useEffect(() => {
  const win = typeof window !== 'undefined' ? window : undefined;
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;

  setEnvironment({
    platform: nav?.platform ?? 'unknown',
    userAgent: nav?.userAgent ?? 'unknown',
    hasPhantom: !!win && typeof (win as { solana?: unknown }).solana !== 'undefined',
  });
}, []);
```

Include a `hydrated: true` field in the debug JSON so browser automation can distinguish a working client route from static export output.

Keep the sibling `apps/app/app/spike-wallet.tsx` fallback route. Expo Router still needs a non-platform sibling for the `.web.tsx` route.

## Why This Works

Metro's global package-exports mode is too broad for this app. It changes package resolution across the whole Expo web graph, including packages that already work through Metro's default resolver. In this case, it selected Zustand ESM code that assumes a module-aware bundling environment.

The targeted resolver preserves Metro defaults and fixes only the Solana package subpath that needed platform-specific `.mjs` resolution. Once the browser bundle no longer contains top-level `import.meta` in a classic script, React hydrates and ConnectorKit can run in the real browser environment.

The route-level hydration markers also prevent a false diagnosis. Seeing `Linux x86_64` and `Node.js/22` in the browser is now clearly a static export or hydration problem, not a wallet discovery result.

## Prevention

- Avoid global Metro resolver changes for package exports unless the whole generated bundle has been inspected in a browser.
- After changing Metro resolution for Expo web, run:

```bash
pnpm --filter @clmm/app build
rg "import\.meta" apps/app/dist/_expo/static/js/web
```

- Verify diagnostic routes in a real browser context, not just with `expo export`.
- For wallet integration probes, render explicit hydration state and browser-only values in debug JSON.
- Treat server-rendered Node values in browser diagnostics as a hydration failure until proven otherwise.

## Related Issues

- Adjacent wallet WebView runtime failure: `docs/solutions/integration-issues/phantom-webview-expo-router-navigation-silent-failure-2026-04-15.md`
- Adjacent Phantom browser signing interop issue: `docs/solutions/integration-issues/phantom-injected-v0-signtransaction-requires-versionedtransaction-2026-04-23.md`
