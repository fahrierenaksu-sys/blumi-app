const path = require("path")
const { getSentryExpoConfig } = require("@sentry/react-native/metro")
const {
  resolveHomeStudioQaModuleDirectory,
  resolveHomeStudioQaModulePath
} = require("./scripts/homeStudioQaModuleRouting.cjs")

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, "../..")

const config = getSentryExpoConfig(projectRoot, {
  annotateReactComponents: false,
  includeWebReplay: false,
  includeWebFeedback: false
})
const homeStudioQaModulePath = resolveHomeStudioQaModulePath({
  projectRoot,
  rawQaFlag: process.env.EXPO_PUBLIC_BLUMI_HOME_STUDIO_QA,
  buildProfile: process.env.EXPO_PUBLIC_BLUMI_BUILD_PROFILE?.trim() || "development"
})
const homeStudioQaModuleDirectory = resolveHomeStudioQaModuleDirectory({
  projectRoot,
  rawQaFlag: process.env.EXPO_PUBLIC_BLUMI_HOME_STUDIO_QA,
  buildProfile: process.env.EXPO_PUBLIC_BLUMI_BUILD_PROFILE?.trim() || "development"
})
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@blumi/home-studio-qa") {
    return { type: "sourceFile", filePath: homeStudioQaModulePath }
  }
  return context.resolveRequest(context, moduleName, platform)
}
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  "@blumi/home-studio-qa": homeStudioQaModuleDirectory
}
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
config.resolver.disableHierarchicalLookup = false
config.resolver.assetExts = [...new Set([...(config.resolver.assetExts ?? []), "webp"])]

module.exports = config
