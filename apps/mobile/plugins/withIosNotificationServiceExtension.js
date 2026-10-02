/* global __dirname */
const fs = require("fs")
const path = require("path")
const {
  withDangerousMod,
  withEntitlementsPlist,
  withInfoPlist,
  withXcodeProject
} = require("expo/config-plugins")

/**
 * iOS Notification Service Extension for chat and room invite pushes. It
 * downloads the sender's chibi picture and shows the push as a Communication
 * Notification (round sender avatar, like iMessage), falling back to a
 * thumbnail attachment. Pure Swift on UserNotifications and Intents: no
 * camera, audio or media package (scripts/mobile-no-media.cjs).
 *
 * Adds a native target, so it ships only with a new EAS build.
 */
const TARGET_NAME = "BlumiNotificationService"
const SOURCE_DIRECTORY = path.join(__dirname, "notificationServiceExtension")
const SWIFT_FILE = "NotificationService.swift"
const INFO_PLIST_FILE = `${TARGET_NAME}-Info.plist`
const ENTITLEMENTS_FILE = `${TARGET_NAME}.entitlements`
const COMMUNICATION_ENTITLEMENT = "com.apple.developer.usernotifications.communication"

function extensionBundleIdentifier(config) {
  const bundleIdentifier = config.ios?.bundleIdentifier
  if (!bundleIdentifier) throw new Error("withIosNotificationServiceExtension needs ios.bundleIdentifier.")
  return `${bundleIdentifier}.NotificationService`
}

function extensionInfoPlist(config) {
  const version = config.version ?? "1.0.0"
  const buildNumber = config.ios?.buildNumber ?? "1"
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>$(DEVELOPMENT_LANGUAGE)</string>
  <key>CFBundleDisplayName</key>
  <string>${TARGET_NAME}</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key>
  <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key>
  <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
  <key>CFBundleShortVersionString</key>
  <string>${version}</string>
  <key>CFBundleVersion</key>
  <string>${buildNumber}</string>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.usernotifications.service</string>
    <key>NSExtensionPrincipalClass</key>
    <string>$(PRODUCT_MODULE_NAME).NotificationService</string>
  </dict>
</dict>
</plist>
`
}

const EXTENSION_ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict/>
</plist>
`

/** EAS Build makes the extension's provisioning profile from this list. */
function withEasAppExtension(config) {
  const bundleIdentifier = extensionBundleIdentifier(config)
  const extra = config.extra ?? {}
  const eas = extra.eas ?? {}
  const build = eas.build ?? {}
  const experimental = build.experimental ?? {}
  const ios = experimental.ios ?? {}
  const appExtensions = (ios.appExtensions ?? []).filter((entry) => entry.targetName !== TARGET_NAME)
  return {
    ...config,
    extra: {
      ...extra,
      eas: {
        ...eas,
        build: {
          ...build,
          experimental: {
            ...experimental,
            ios: {
              ...ios,
              appExtensions: [...appExtensions, { targetName: TARGET_NAME, bundleIdentifier, entitlements: {} }]
            }
          }
        }
      }
    }
  }
}

/** The app itself declares Communication Notifications and the message intent. */
function withCommunicationNotifications(config) {
  config = withEntitlementsPlist(config, (next) => {
    next.modResults[COMMUNICATION_ENTITLEMENT] = true
    return next
  })
  return withInfoPlist(config, (next) => {
    const types = Array.isArray(next.modResults.NSUserActivityTypes) ? next.modResults.NSUserActivityTypes : []
    if (!types.includes("INSendMessageIntent")) next.modResults.NSUserActivityTypes = [...types, "INSendMessageIntent"]
    return next
  })
}

function withExtensionFiles(config) {
  return withDangerousMod(config, ["ios", (next) => {
    const directory = path.join(next.modRequest.platformProjectRoot, TARGET_NAME)
    fs.mkdirSync(directory, { recursive: true })
    fs.copyFileSync(path.join(SOURCE_DIRECTORY, SWIFT_FILE), path.join(directory, SWIFT_FILE))
    fs.writeFileSync(path.join(directory, INFO_PLIST_FILE), extensionInfoPlist(next))
    fs.writeFileSync(path.join(directory, ENTITLEMENTS_FILE), EXTENSION_ENTITLEMENTS)
    return next
  }])
}

function withExtensionTarget(config) {
  return withXcodeProject(config, (next) => {
    const project = next.modResults
    if (project.pbxTargetByName(TARGET_NAME)) return next

    const objects = project.hash.project.objects
    // The xcode package assumes these sections exist when adding a dependency.
    objects.PBXTargetDependency = objects.PBXTargetDependency ?? {}
    objects.PBXContainerItemProxy = objects.PBXContainerItemProxy ?? {}

    const group = project.addPbxGroup([SWIFT_FILE, INFO_PLIST_FILE, ENTITLEMENTS_FILE], TARGET_NAME, TARGET_NAME)
    const mainGroupId = project.getFirstProject().firstProject.mainGroup
    project.addToPbxGroup(group.uuid, mainGroupId)
    // addPbxGroup also makes "in Resources" build files; the plist and the
    // entitlements are build settings, never bundle resources.
    removeBuildFilesFor(project, [INFO_PLIST_FILE, ENTITLEMENTS_FILE])

    // app_extension also embeds the product into the app (a Copy Files phase).
    const target = project.addTarget(TARGET_NAME, "app_extension", TARGET_NAME, extensionBundleIdentifier(next))
    moveEmbedPhaseAfterResources(project)
    project.addBuildPhase([SWIFT_FILE], "PBXSourcesBuildPhase", "Sources", target.uuid)
    project.addBuildPhase([], "PBXResourcesBuildPhase", "Resources", target.uuid)
    project.addBuildPhase([], "PBXFrameworksBuildPhase", "Frameworks", target.uuid)

    const mainSettings = firstApplicationBuildSettings(project)
    const configurations = project.pbxXCBuildConfigurationSection()
    for (const key of Object.keys(configurations)) {
      const settings = configurations[key].buildSettings
      if (!settings || settings.PRODUCT_NAME !== `"${TARGET_NAME}"`) continue
      Object.assign(settings, {
        CODE_SIGN_ENTITLEMENTS: `${TARGET_NAME}/${ENTITLEMENTS_FILE}`,
        CODE_SIGN_STYLE: "Automatic",
        INFOPLIST_FILE: `${TARGET_NAME}/${INFO_PLIST_FILE}`,
        IPHONEOS_DEPLOYMENT_TARGET: next.ios?.deploymentTarget ?? mainSettings.IPHONEOS_DEPLOYMENT_TARGET ?? "16.4",
        MARKETING_VERSION: next.version ?? "1.0.0",
        CURRENT_PROJECT_VERSION: next.ios?.buildNumber ?? "1",
        SWIFT_VERSION: "5.0",
        TARGETED_DEVICE_FAMILY: "\"1\"",
        GENERATE_INFOPLIST_FILE: "NO",
        SKIP_INSTALL: "YES",
        APPLICATION_EXTENSION_API_ONLY: "YES",
        ...(mainSettings.DEVELOPMENT_TEAM ? { DEVELOPMENT_TEAM: mainSettings.DEVELOPMENT_TEAM } : {})
      })
    }
    return next
  })
}

function removeBuildFilesFor(project, fileNames) {
  const buildFiles = project.hash.project.objects.PBXBuildFile
  for (const key of Object.keys(buildFiles)) {
    if (key.endsWith("_comment")) continue
    const comment = buildFiles[`${key}_comment`] ?? ""
    if (fileNames.some((name) => comment === `${name} in Resources`)) {
      delete buildFiles[key]
      delete buildFiles[`${key}_comment`]
    }
  }
}

/**
 * Embed the extension right after the app's Resources phase, before the
 * React Native and CocoaPods script phases, which avoids Xcode's "Cycle
 * inside Blumi" error with embedded extensions.
 */
function moveEmbedPhaseAfterResources(project) {
  const objects = project.hash.project.objects
  const mainTarget = project.getFirstTarget().firstTarget
  const phases = mainTarget.buildPhases
  const embedIndex = phases.findIndex((phase) => {
    const copyPhase = objects.PBXCopyFilesBuildPhase?.[phase.value]
    return copyPhase?.files?.some((file) => String(file.comment).includes(`${TARGET_NAME}.appex`))
  })
  if (embedIndex < 0) return
  const [embed] = phases.splice(embedIndex, 1)
  objects.PBXCopyFilesBuildPhase[embed.value].name = "\"Embed Foundation Extensions\""
  objects.PBXCopyFilesBuildPhase[`${embed.value}_comment`] = "Embed Foundation Extensions"
  embed.comment = "Embed Foundation Extensions"
  const resourcesIndex = phases.findIndex((phase) => phase.comment === "Resources")
  phases.splice(resourcesIndex >= 0 ? resourcesIndex + 1 : phases.length, 0, embed)
}

function firstApplicationBuildSettings(project) {
  const configurations = project.pbxXCBuildConfigurationSection()
  for (const key of Object.keys(configurations)) {
    const settings = configurations[key].buildSettings
    if (settings?.PRODUCT_BUNDLE_IDENTIFIER && settings.INFOPLIST_FILE && !String(settings.PRODUCT_NAME).includes(TARGET_NAME)) {
      return settings
    }
  }
  return {}
}

module.exports = function withIosNotificationServiceExtension(config) {
  config = withEasAppExtension(config)
  config = withCommunicationNotifications(config)
  config = withExtensionFiles(config)
  return withExtensionTarget(config)
}

module.exports.TARGET_NAME = TARGET_NAME
module.exports.COMMUNICATION_ENTITLEMENT = COMMUNICATION_ENTITLEMENT
