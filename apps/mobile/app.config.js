const {
  resolveMobileReleaseEnvironment
} = require("./scripts/mobile-release-config.cjs")

module.exports = ({ config }) => {
  const releaseEnvironment = resolveMobileReleaseEnvironment(process.env)

  return {
    ...config,
    extra: {
      ...(config.extra ?? {}),
      buildProfile: releaseEnvironment.buildProfile,
      enableDemo: releaseEnvironment.enableDemo === "1"
    }
  }
}
