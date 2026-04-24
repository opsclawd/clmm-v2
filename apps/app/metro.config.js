// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch all packages in the monorepo
config.watchFolders = [workspaceRoot];

// Resolve packages from both the app and the monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

config.resolver.sourceExts = ['ts', 'tsx', 'js', 'jsx', 'json', 'cjs', 'mjs'];

// Support package.json "exports" field for subpath imports (e.g., @solana/connector/headless)
config.resolver.unstable_conditionNames = ['import', 'require', 'default'];
config.resolver.unstable_conditionsByPlatform = {
  web: ['browser'],
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
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

module.exports = config;
