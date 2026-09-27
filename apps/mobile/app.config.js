const {
  resolveMobileReleaseEnvironment
} = require("./scripts/mobile-release-config.cjs")
const {
  assertNoCandidateAssetImportsInSourceRoot
} = require("./scripts/mobile-release-assets.cjs")

module.exports = ({ config }) => {
  const releaseEnvironment = resolveMobileReleaseEnvironment(process.env)
  if (
    (releaseEnvironment.buildProfile === "preview" || releaseEnvironment.buildProfile === "production") &&
    (typeof config.extra?.eas?.projectId !== "string" || !config.extra.eas.projectId.trim())
  ) {
    throw new Error("Preview and production builds require a linked EAS projectId for Expo Push.")
  }
  if (releaseEnvironment.buildProfile === "preview" || releaseEnvironment.buildProfile === "production") {
    assertNoCandidateAssetImportsInSourceRoot(`${__dirname}/src`)
  }

  return {
    ...config,
    extra: {
      ...(config.extra ?? {}),
      buildProfile: releaseEnvironment.buildProfile,
      enableDemo: releaseEnvironment.enableDemo === "1"
    }
  }
}
