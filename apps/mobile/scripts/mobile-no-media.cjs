const FORBIDDEN_MEDIA_PACKAGES = new Set([
  "livekit-client", "react-native-webrtc", "react-native-vision-camera",
  "expo-camera", "expo-image-picker", "expo-media-library", "expo-av", "expo-audio"
])

function assertNoMediaDependencies(mobilePackage, lockfile) {
  const names = new Set([
    ...Object.keys(mobilePackage.dependencies ?? {}),
    ...Object.keys(mobilePackage.devDependencies ?? {}),
    ...Object.keys(lockfile.packages ?? {}).map((path) => path.split("node_modules/").at(-1))
  ])
  const forbidden = [...names].filter((name) =>
    name.startsWith("@livekit/") || FORBIDDEN_MEDIA_PACKAGES.has(name)
  ).sort()
  if (forbidden.length > 0) {
    throw new Error(`Blumi text-only builds cannot include camera/audio SDKs: ${forbidden.join(", ")}`)
  }
}

module.exports = { assertNoMediaDependencies }
