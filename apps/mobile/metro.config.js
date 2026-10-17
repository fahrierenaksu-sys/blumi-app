const path = require("path")
const { getSentryExpoConfig } = require("@sentry/react-native/metro")

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, "../..")

const config = getSentryExpoConfig(projectRoot, {
  annotateReactComponents: false,
  includeWebReplay: false,
  includeWebFeedback: false
})
const getTransformOptions = config.transformer.getTransformOptions

config.transformer.getTransformOptions = async (...args) => {
  const options = await getTransformOptions(...args)
  return {
    ...options,
    transform: {
      ...options.transform,
      inlineRequires: true
    }
  }
}

config.watchFolders = [...new Set([...(config.watchFolders ?? []), workspaceRoot])]
config.resolver.nodeModulesPaths = [
  ...(config.resolver.nodeModulesPaths ?? []),
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules")
]
// Agent worktrees under .claude/ are full repo copies whose installs churn while Metro runs and crash its file map.
const claudeDirPattern = new RegExp(`^${path.resolve(workspaceRoot, ".claude").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[/\\\\].*`)
const existingBlockList = config.resolver.blockList
config.resolver.blockList = [
  ...(Array.isArray(existingBlockList) ? existingBlockList : existingBlockList ? [existingBlockList] : []),
  claudeDirPattern
]
config.resolver.disableHierarchicalLookup = false
config.resolver.assetExts = [...new Set([...(config.resolver.assetExts ?? []), "webp"])]

module.exports = config
