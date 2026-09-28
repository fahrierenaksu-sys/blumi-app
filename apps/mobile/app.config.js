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

  const plugins = config.plugins ?? []
  const iosInfoPlist = { ...(config.ios?.infoPlist ?? {}) }
  delete iosInfoPlist.NSMicrophoneUsageDescription
  delete iosInfoPlist.NSCameraUsageDescription

  return {
    ...config,
    plugins,
    ios: { ...config.ios, infoPlist: iosInfoPlist },
    android: {
      ...config.android,
      permissions: (config.android?.permissions ?? []).filter(
        (permission) => ![
          "android.permission.RECORD_AUDIO",
          "android.permission.MODIFY_AUDIO_SETTINGS",
          "android.permission.CAMERA"
        ].includes(permission)
      ),
      blockedPermissions: [
        ...new Set([
          ...(config.android?.blockedPermissions ?? []),
          "android.permission.RECORD_AUDIO",
          "android.permission.MODIFY_AUDIO_SETTINGS",
          "android.permission.CAMERA"
        ])
      ]
    },
    extra: {
      ...(config.extra ?? {}),
      buildProfile: releaseEnvironment.buildProfile,
      enableDemo: releaseEnvironment.enableDemo === "1"
    }
  }
}
