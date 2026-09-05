const { withXcodeProject } = require("expo/config-plugins")

function configureBuildConfigurations(section) {
  return Object.fromEntries(Object.entries(section).map(([key, value]) => [
    key,
    value && typeof value === "object" && String(value.name).replaceAll('"', "") === "Debug"
      ? { ...value, buildSettings: { ...value.buildSettings, SENTRY_DISABLE_AUTO_UPLOAD: "true" } }
      : value
  ]))
}

module.exports = function withSentryDebugSettings(config) {
  return withXcodeProject(config, (next) => {
    const project = next.modResults
    // The Xcode parser owns this mutable adapter; transform its settings purely.
    project.hash.project.objects = {
      ...project.hash.project.objects,
      XCBuildConfiguration: configureBuildConfigurations(project.hash.project.objects.XCBuildConfiguration)
    }
    return next
  })
}
module.exports.configureBuildConfigurations = configureBuildConfigurations
