// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch all packages in the monorepo
config.watchFolders = [monorepoRoot];

// Resolve packages from both the app and the monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Ensure Metro resolves .ts/.tsx when imports use .js extension
// (TypeScript moduleResolution: "bundler" emits .js extensions that Metro must map back)
config.resolver.sourceExts = ['ts', 'tsx', 'js', 'jsx', 'json', 'cjs', 'mjs'];

// Ensure .ts and .tsx are resolved before .js and .jsx
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // If the import ends with .js, try .ts/.tsx first
  if (moduleName.endsWith('.js')) {
    const tsName = moduleName.replace(/\.js$/, '.ts');
    const tsxName = moduleName.replace(/\.js$/, '.tsx');

    for (const candidate of [tsxName, tsName]) {
      try {
        return context.resolveRequest(context, candidate, platform);
      } catch {
        // Try next candidate
      }
    }
  }

  // Fall back to default resolution
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
