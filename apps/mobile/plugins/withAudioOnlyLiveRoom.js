const {
  withAndroidManifest,
  withInfoPlist
} = require("expo/config-plugins")

const CAMERA_PERMISSION = "android.permission.CAMERA"

/**
 * The upstream WebRTC config plugin provisions camera access by default.
 * Blumi Rooms deliberately support opt-in microphone publishing only, so this
 * plugin runs after it and removes the unused camera declarations.
 */
module.exports = function withAudioOnlyLiveRoom(config) {
  config.android = {
    ...(config.android ?? {}),
    permissions: (config.android?.permissions ?? []).filter(
      (permission) => permission !== CAMERA_PERMISSION
    ),
    blockedPermissions: [
      ...new Set([
        ...(config.android?.blockedPermissions ?? []),
        CAMERA_PERMISSION
      ])
    ]
  }

  config = withInfoPlist(config, (nextConfig) => {
    delete nextConfig.modResults.NSCameraUsageDescription
    return nextConfig
  })

  return withAndroidManifest(config, (nextConfig) => {
    const permissions = nextConfig.modResults.manifest["uses-permission"] ?? []
    nextConfig.modResults.manifest["uses-permission"] = permissions.filter(
      (permission) => permission.$?.["android:name"] !== CAMERA_PERMISSION
    )
    return nextConfig
  })
}
