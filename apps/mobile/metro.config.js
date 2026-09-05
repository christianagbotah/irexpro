const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');
const config = getDefaultConfig(projectRoot);

// Expo SDK 51 predates automatic Metro monorepo configuration. Watch the
// repository root so workspace packages linked from apps/mobile can be read.
config.watchFolders = [monorepoRoot];

// Resolve dependencies from the mobile app first, then from the workspace
// root. This mirrors Expo's documented pre-SDK-52 monorepo configuration and
// avoids hardcoded aliases to individual shared packages.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

module.exports = config;
