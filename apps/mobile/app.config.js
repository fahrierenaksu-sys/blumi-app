/* global __dirname */
const {
  resolveMobileReleaseEnvironment
} = require("./scripts/mobile-release-config.cjs")
const {
  assertNoCandidateAssetImportsInSourceRoot
} = require("./scripts/mobile-release-assets.cjs")
const { assertNoMediaDependencies } = require("./scripts/mobile-no-media.cjs")

module.exports = ({ config }) => {
  assertNoMediaDependencies(require("./package.json"), require("../../package-lock.json"))
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

  const plugins = (config.plugins ?? []).filter((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin
    return releaseEnvironment.sentryDsn || ![
      "@sentry/react-native",
      "./plugins/withSentryDebugSettings"
    ].includes(name)
  })
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
