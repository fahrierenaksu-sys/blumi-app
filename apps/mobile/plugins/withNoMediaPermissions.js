const {
  withAndroidManifest,
  withInfoPlist
} = require("expo/config-plugins")

const MEDIA_PERMISSIONS = new Set([
  "android.permission.RECORD_AUDIO",
  "android.permission.MODIFY_AUDIO_SETTINGS",
  "android.permission.CAMERA"
])

module.exports = function withNoMediaPermissions(config) {
  config.android = {
    ...(config.android ?? {}),
    permissions: (config.android?.permissions ?? []).filter(
      (permission) => !MEDIA_PERMISSIONS.has(permission)
    ),
    blockedPermissions: [
      ...new Set([
        ...(config.android?.blockedPermissions ?? []),
        ...MEDIA_PERMISSIONS
      ])
    ]
  }

  config = withInfoPlist(config, (nextConfig) => {
    delete nextConfig.modResults.NSCameraUsageDescription
    delete nextConfig.modResults.NSMicrophoneUsageDescription
    return nextConfig
  })

  return withAndroidManifest(config, (nextConfig) => {
    for (const permissionTag of ["uses-permission", "uses-permission-sdk-23"]) {
      const permissions = nextConfig.modResults.manifest[permissionTag] ?? []
      nextConfig.modResults.manifest[permissionTag] = permissions.filter(
        (permission) => !MEDIA_PERMISSIONS.has(permission.$?.["android:name"])
      )
    }
    return nextConfig
  })
}
