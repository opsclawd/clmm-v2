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
