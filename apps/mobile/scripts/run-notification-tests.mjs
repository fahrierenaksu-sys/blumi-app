import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const outputDirectory = mkdtempSync(join(tmpdir(), "blumi-notification-tests-"))
const nodeMajorVersion = Number(process.versions.node.split(".")[0])
const coverageArguments = nodeMajorVersion >= 22
  ? ["--experimental-test-coverage"]
  : []
const sourceFiles = [
  "src/features/notifications/notificationApi.ts",
  "src/features/notifications/notificationApi.test.ts",
  "src/features/notifications/notificationTimeZoneSync.ts",
  "src/features/notifications/notificationTimeZoneSync.test.ts",
  "src/features/notifications/notificationRuntimePolicy.ts",
  "src/features/notifications/notificationRuntimePolicy.test.ts",
  "src/features/notifications/pushRegistrationCoordinator.ts",
  "src/features/notifications/pushRegistrationCoordinator.test.ts",
  "src/features/notifications/pushRegistrationGate.ts",
  "src/features/notifications/pushRegistrationGate.test.ts",
  "src/features/notifications/notificationRouting.ts",
  "src/features/notifications/notificationRouting.test.ts",
  "src/features/notifications/notificationPreferencesModel.ts",
  "src/features/notifications/notificationPreferencesModel.test.ts",
  "src/features/notifications/notificationPresentationModel.ts",
  "src/features/notifications/notificationPresentationModel.test.ts",
  "src/features/notifications/pushDeviceRegistry.ts",
  "src/features/notifications/pushDeviceRegistry.test.ts",
  "src/features/notifications/notificationTapRouting.ts",
  "src/features/notifications/notificationTapRouting.test.ts",
  "src/features/notifications/appIconBadgeModel.ts",
  "src/features/notifications/appIconBadgeModel.test.ts",
  "src/features/notifications/signedOutNotificationTaps.ts",
  "src/features/notifications/signedOutNotificationTaps.test.ts"
]

try {
  execFileSync(
    process.execPath,
    [
      resolve(workspaceRoot, "../../node_modules/typescript/bin/tsc"),
      "--ignoreConfig",
      "--ignoreDeprecations", "6.0",
      "--types", "node",
      ...sourceFiles,
      "--target",
      "ES2022",
      "--module",
      "commonjs",
      "--moduleResolution",
      "node",
      "--outDir",
      outputDirectory,
      "--rootDir",
      "src",
      "--esModuleInterop",
      "--resolveJsonModule",
      "--skipLibCheck"
    ],
    {
      cwd: workspaceRoot,
      stdio: "inherit"
    }
  )

  execFileSync(
    process.execPath,
    [
      ...coverageArguments,
      "--test",
      join(outputDirectory, "features/notifications/notificationApi.test.js"),
      join(outputDirectory, "features/notifications/notificationTimeZoneSync.test.js"),
      join(outputDirectory, "features/notifications/notificationRuntimePolicy.test.js"),
      join(outputDirectory, "features/notifications/pushRegistrationCoordinator.test.js"),
      join(outputDirectory, "features/notifications/pushRegistrationGate.test.js"),
      join(outputDirectory, "features/notifications/notificationRouting.test.js"),
      join(outputDirectory, "features/notifications/notificationPreferencesModel.test.js"),
      join(outputDirectory, "features/notifications/notificationPresentationModel.test.js"),
      join(outputDirectory, "features/notifications/pushDeviceRegistry.test.js"),
      join(outputDirectory, "features/notifications/notificationTapRouting.test.js"),
      join(outputDirectory, "features/notifications/appIconBadgeModel.test.js"),
      join(outputDirectory, "features/notifications/signedOutNotificationTaps.test.js"),
      resolve(workspaceRoot, "src/features/notifications/notificationResponseDelivery.test.mjs")
    ],
    {
      cwd: workspaceRoot,
      stdio: "inherit"
    }
  )
  execFileSync(process.execPath,
    ["--import", "tsx", "--test", "src/features/notifications/useChatNotificationPrompt.test.ts",
      "src/features/notifications/foregroundNotificationState.test.ts"],
    { cwd: workspaceRoot, stdio: "inherit" })
} finally {
  rmSync(outputDirectory, { recursive: true, force: true })
}
