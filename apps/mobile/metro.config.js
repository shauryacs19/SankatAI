// Metro config so the app can import the packages/shared logic package
// (framework-agnostic code shared with the web frontend).
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const repoRoot = path.resolve(projectRoot, '../../') // .../SankatAI
const sharedRoot = path.resolve(repoRoot, 'packages/shared')

const config = getDefaultConfig(projectRoot)

// Let Metro watch/serve files from the shared package (it lives outside the app).
config.watchFolders = [sharedRoot]
// Keep node_modules resolution anchored to this app.
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules'), path.resolve(repoRoot, 'node_modules')]
// Explicitly map the shared workspace package as well. The root npm workspaces
// link it during install; this mapping keeps Metro resolution deterministic in
// Expo monorepos and on package managers that do not create that link eagerly.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@sankatai/shared': sharedRoot,
}

module.exports = config
