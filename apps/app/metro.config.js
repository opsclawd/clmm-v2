// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
config.resolver.unstable_enablePackageExports = false;

const defaultWatchFolders = config.watchFolders || [];
const defaultSourceExts = config.resolver?.sourceExts || [];
const defaultAssetExts = config.resolver?.assetExts || [];

config.watchFolders = [...defaultWatchFolders, workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

const customSourceExts = ['ts', 'tsx', 'mjs', 'cjs'];
config.resolver.sourceExts = [...new Set([...defaultSourceExts, ...customSourceExts])];
config.resolver.assetExts = defaultAssetExts;

const connectorsPackageRoot = path.resolve(
  path.dirname(
    require.resolve('@solana/connector', {
      paths: [projectRoot, workspaceRoot],
    }),
  ),
  '..',
);

function resolveConnectorSubpath(subpath, platform) {
  const fileName =
    platform === 'web'
      ? `${subpath}.mjs`
      : platform === 'ios' || platform === 'android'
        ? `${subpath}.js`
        : `${subpath}.js`;

  return {
    type: 'sourceFile',
    filePath: path.join(connectorsPackageRoot, 'dist', fileName),
  };
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('@solana/connector/')) {
    const subpath = moduleName.replace('@solana/connector/', '');
    return resolveConnectorSubpath(subpath, platform);
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

module.exports = config;
