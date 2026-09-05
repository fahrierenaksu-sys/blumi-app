import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const outputDirectory = mkdtempSync(join(tmpdir(), "blumi-session-tests-"))
const nodeMajorVersion = Number(process.versions.node.split(".")[0])
const coverageArguments = nodeMajorVersion >= 22
  ? ["--experimental-test-coverage"]
  : []
const testNames = [
  "sessionApi",
  "authEntryCopy",
  "appNavigationCopy",
  "sessionErrorCopy",
  "profileSetupCopy",
  "accountRecoveryCopy",
  "settingsActionErrorCopy",
  "sessionLifecycle",
  "sessionMutationCoordinator",
  "accountDataExport",
  "sessionModel",
  "sessionPersistence",
  "sessionRefresh",
  "accountModeration",
  "sessionRouting",
  "onboardingBrandPreludeModel",
  "onboardingIntroModel",
  "onboardingIntroAction",
  "onboardingFlowModel",
  "preAuthOnboardingDraft",
  "preAuthOnboardingStorage",
  "onboardingCompletion",
  "registerFlowModel",
  "registerPhonePanelModel",
  "profileEditModel",
  "profileSetupLayout",
  "profileSetupVisualModel",
  "initialProfileAvatar"
]
const sourceDirectory = "src/features/session"
const sourceFiles = testNames.flatMap((name) => [
  `${sourceDirectory}/${name}.ts`,
  `${sourceDirectory}/${name}.test.ts`
])
sourceFiles.push(`${sourceDirectory}/useSessionState.ts`)
sourceFiles.push(
  "src/features/referrals/referralModel.ts",
  "src/features/referrals/referralModel.test.ts",
  "src/features/referrals/referralCaptureSignal.ts",
  "src/features/referrals/referralCaptureSignal.test.ts",
  "src/features/referrals/referralApi.ts",
  "src/features/referrals/referralApi.test.ts"
)
sourceFiles.push(`${sourceDirectory}/authLocale.ts`)
sourceFiles.push(
  `${sourceDirectory}/setupFlow/setupCharacterMotionModel.ts`,
  `${sourceDirectory}/setupFlow/setupCharacterMotionModel.test.ts`,
  `${sourceDirectory}/setupFlow/roomSetupCharacterMotionModel.ts`,
  `${sourceDirectory}/setupFlow/roomSetupCharacterMotionModel.test.ts`
)
sourceFiles.push(
  "src/features/capabilities/capabilityApi.ts",
  "src/features/capabilities/capabilityApi.test.ts",
  "src/features/avatarV2/avatarV2.types.ts",
  "src/features/avatarV2/avatarSelectionModel.ts",
  "src/features/avatarV2/avatarSelectionModel.test.ts",
  "src/features/avatarV2/avatarApi.ts",
  "src/features/avatarV2/avatarApi.test.ts"
)
sourceFiles.push(
  "src/features/settings/settingsPreferencesModel.ts",
  "src/features/settings/settingsPreferencesModel.test.ts",
  "src/features/session/registerPresentationModel.ts",
  "src/features/session/registerPresentationModel.test.ts"
)

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
      "--resolveJsonModule",
      "--outDir",
      outputDirectory,
      "--rootDir",
      "src",
      "--esModuleInterop",
      "--skipLibCheck"
    ],
    {
      cwd: workspaceRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_PATH: resolve(workspaceRoot, "../../node_modules")
      }
    }
  )

  execFileSync(
    process.execPath,
    [
      ...coverageArguments,
      "--test",
      ...testNames.map((name) =>
        join(outputDirectory, "features/session", `${name}.test.js`)
      ),
      join(outputDirectory, "features/referrals/referralModel.test.js"),
      join(outputDirectory, "features/referrals/referralCaptureSignal.test.js"),
      join(outputDirectory, "features/referrals/referralApi.test.js"),
      join(outputDirectory, "features/capabilities/capabilityApi.test.js"),
      join(outputDirectory, "features/avatarV2/avatarSelectionModel.test.js"),
      join(outputDirectory, "features/avatarV2/avatarApi.test.js"),
      join(outputDirectory, "features/settings/settingsPreferencesModel.test.js"),
      join(outputDirectory, "features/session/registerPresentationModel.test.js")
      ,join(outputDirectory, "features/session/setupFlow/setupCharacterMotionModel.test.js")
      ,join(outputDirectory, "features/session/setupFlow/roomSetupCharacterMotionModel.test.js")
    ],
    {
      cwd: workspaceRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_PATH: resolve(workspaceRoot, "../../node_modules")
      }
    }
  )
} finally {
  rmSync(outputDirectory, { recursive: true, force: true })
}
