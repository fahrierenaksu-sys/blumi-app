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
  "sessionErrorCopy",
  "accountRecoveryCopy",
  "settingsActionErrorCopy",
  "sessionLifecycle",
  "sessionPushCleanup",
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
  "profileSetupVisualModel"
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
  "src/features/referrals/referralApi.ts",
  "src/features/referrals/referralApi.test.ts"
)
sourceFiles.push(`${sourceDirectory}/authLocale.ts`)
sourceFiles.push(
  `${sourceDirectory}/register/registerScreenModel.ts`,
  `${sourceDirectory}/register/registerScreenModel.test.ts`
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
      join(outputDirectory, "features/referrals/referralApi.test.js"),
      join(outputDirectory, "features/capabilities/capabilityApi.test.js"),
      join(outputDirectory, "features/avatarV2/avatarSelectionModel.test.js"),
      join(outputDirectory, "features/avatarV2/avatarApi.test.js"),
      join(outputDirectory, "features/settings/settingsPreferencesModel.test.js"),
      join(outputDirectory, "features/session/registerPresentationModel.test.js")
      ,join(outputDirectory, "features/session/register/registerScreenModel.test.js")
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
      "--import", "tsx",
      "--test",
      "src/features/session/register/useRegisterFlowController.test.ts",
      "src/features/session/accountRecoveryModel.test.ts",
      "src/features/session/accountSwitchIsolation.test.ts",
      "src/features/session/appLocale.test.ts",
      "src/features/session/authLocaleResolver.test.ts",
      "src/features/session/nativeUiSessionReset.test.ts",
      "src/features/session/onboardingArrivalMotionModel.test.ts",
      "src/features/session/onboardingDoneMoment.test.ts",
      "src/features/session/onboardingBrandPreludeLifecycle.test.ts",
      "src/features/session/onboardingGreetingPairWave.test.ts",
      "src/features/session/useSessionStateLifecycle.test.ts",
      "src/features/session/useSessionStateMutationIsolation.test.ts",
      "src/features/session/onboardingGreetingPairModel.test.ts",
      "src/features/session/onboardingIntroPerformanceModel.test.ts",
      "src/features/session/onboardingIntroTelemetry.test.ts",
      "src/features/session/onboardingPopulationCounterModel.test.ts",
      "src/features/session/onboardingWelcomeHomeModel.test.ts",
      "src/features/session/onboardingWorldClockModel.test.ts",
      "src/features/session/profileSetupValidation.test.ts",
      "src/features/session/onboardingWorldCompositionModel.test.ts",
      "src/features/session/profileCharacterReactionModel.test.ts",
      "src/features/session/ProfileInterestsField.test.ts",
      "src/features/session/setupFlow/setupFlowShellModel.test.ts",
      "src/features/session/setupFlow/setupFlowCopy.test.ts",
      "src/features/session/setupFlow/setupStaticExperience.test.ts",
      "src/features/profile/profileViewModel.test.ts",
      "src/screens/youScreenFirstFrame.test.ts",
      "src/features/settings/settingsCopy.test.ts",
      "src/features/settings/settingsPresentationModel.test.ts",
      "src/features/settings/settingsPhoneChangeModel.test.ts",
      "src/features/settings/useHiddenPeople.test.ts",
      "src/features/settings/useNotificationSettings.test.ts",
      "src/features/settings/chatPreferencesApi.test.ts",
      "src/features/dev/blumiDevEntryPolicy.test.ts",
      "src/ui/blumiLoadingScreenHandoff.test.ts",
      "src/ui/uiLocale.test.ts",
      "src/ui/ambientMotionModel.test.ts",
      "src/ui/glassSurfaceModel.test.ts",
      "src/features/inventory/dailyRewardCopy.test.ts"
    ],
    {
      cwd: workspaceRoot,
      stdio: "inherit"
    }
  )
} finally {
  rmSync(outputDirectory, { recursive: true, force: true })
}
