import { execFileSync, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  assertNativeUiBuildDiskSpace,
  readNativeUiAvailableBytes
} from "./nativeUiDiskGuard.mjs"
import { prepareNativeUiScreenshotDirectory } from "./nativeUiScreenshotDirectory.mjs"
import {
  resolveNativeUiDerivedDataPolicy,
  runWithTemporaryDerivedData
} from "./nativeUiTemporaryData.mjs"
import {
  assertFullWaveQaSelectionIsBounded,
  resolveNativeUiOnlyTestingArgs
} from "./nativeUiTestSelection.mjs"

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const iosRoot = resolve(mobileRoot, "ios")
const workspace = resolve(iosRoot, "BlumiMobile.xcworkspace")
const simulatorId = process.env.IOS_SIMULATOR_UDID || selectSimulator()
const screenshotDirectory =
  process.env.BLUMI_UI_SCREENSHOT_DIR ||
  resolve(tmpdir(), "blumi-native-ui-screenshots")
const statusDirectory = process.env.BLUMI_NATIVE_UI_STATUS_DIR || null
const onlyTestingArgs = resolveNativeUiOnlyTestingArgs(
  process.env.BLUMI_NATIVE_UI_ONLY_TESTING
)
if (process.env.BLUMI_NATIVE_UI_FULL_WAVE_QA === "1") {
  assertFullWaveQaSelectionIsBounded(process.env.BLUMI_NATIVE_UI_ONLY_TESTING)
}

assertNativeUiBuildDiskSpace(readNativeUiAvailableBytes())

const derivedDataPolicy = resolveNativeUiDerivedDataPolicy(
  process.env.BLUMI_NATIVE_UI_DERIVED_DATA_DIR
)

const xcodebuildStatus = runWithTemporaryDerivedData({
  create: () => derivedDataPolicy.explicitPath || mkdtempSync(resolve(tmpdir(), "blumi-native-ui-")),
  cleanup: (derivedDataPath) => {
    if (derivedDataPolicy.cleanupAfterRun) {
      rmSync(derivedDataPath, { recursive: true, force: true })
    }
  },
  run: (derivedDataPath) => {
    prepareNativeUiScreenshotDirectory(screenshotDirectory)
    // `simctl uninstall` is a no-op while the device is shutdown on some
    // simulator runtimes. Boot first so a prior XCTest runner Documents
    // container can never leak attachments into a fresh evidence run.
    spawnSync(
      "xcrun",
      ["simctl", "boot", simulatorId],
      { stdio: "ignore" }
    )
    spawnSync(
      "xcrun",
      ["simctl", "uninstall", simulatorId, "com.blumi.mobile"],
      { stdio: "ignore" }
    )
    // XCTest attachments live in the runner app's Documents container. Clear
    // that container too so an interrupted or failed run can never be mixed
    // into the next directional evidence export under the same screenshot
    // names.
    spawnSync(
      "xcrun",
      ["simctl", "uninstall", simulatorId, "com.blumi.mobile.uitests.xctrunner"],
      { stdio: "ignore" }
    )

    writeNativeUiRunStatus({
      phase: "running",
      derivedDataPath,
      xcodebuildExitCode: null,
      errorMessage: null
    })

    try {
      const xcodebuild = spawnSync(
        "xcodebuild",
        [
          "-workspace", workspace,
          "-scheme", "BlumiMobile",
          "-configuration", "Release",
          "-destination", `platform=iOS Simulator,id=${simulatorId}`,
          "-derivedDataPath", derivedDataPath,
          // XCTest's default test-timeout behavior is disabled by xcodebuild in
          // this local runner. Keep a wedged XCUI event from holding the
          // simulator forever; the Swift suite requests the same 15-minute
          // allowance per test and this is the hard upper bound.
          "-test-timeouts-enabled", "YES",
          "-maximum-test-execution-time-allowance", "900",
          // Room QA selectors share one simulator-backed app and one local
          // QA room. Parallel XCTest workers race on the same search/editor
          // state and can leave the native proof run waiting indefinitely.
          "-parallel-testing-enabled", "NO",
          "ONLY_ACTIVE_ARCH=YES",
          "COMPILER_INDEX_STORE_ENABLE=NO",
          "CODE_SIGNING_ALLOWED=NO",
          "CODE_SIGNING_REQUIRED=NO",
          "SENTRY_DISABLE_AUTO_UPLOAD=true",
          ...onlyTestingArgs,
          "test"
        ],
        {
          cwd: mobileRoot,
          env: {
            ...process.env,
            EXPO_PUBLIC_BLUMI_BUILD_PROFILE: "native-ui-test",
            EXPO_PUBLIC_BLUMI_DEV_ENTRY_ROUTE:
              process.env.BLUMI_NATIVE_UI_HOME_STUDIO_QA === "1"
                ? "home-studio-pilot"
                : process.env.EXPO_PUBLIC_BLUMI_DEV_ENTRY_ROUTE || "",
            EXPO_PUBLIC_BLUMI_HOME_STUDIO_QA:
              process.env.BLUMI_NATIVE_UI_HOME_STUDIO_QA === "1" ? "1" : "",
            EXPO_PUBLIC_BLUMI_HOME_STUDIO_VISUAL_REVIEW_APPROVED:
              process.env.BLUMI_NATIVE_UI_HOME_STUDIO_QA === "1" ? "1" : "",
            // Full-wave evidence uses the dedicated 45-SKU gate. Keeping the
            // eight-piece proof flag off prevents the separate starter-bed
            // ownership shim from leaking into the full-wave QA namespace.
            EXPO_PUBLIC_BLUMI_ROOM_VNEXT_RUNTIME_PROOF:
              process.env.BLUMI_NATIVE_UI_FULL_WAVE_QA === "1" ? "" : "1",
            EXPO_PUBLIC_BLUMI_ROOM_VNEXT_FULL_WAVE_QA:
              process.env.BLUMI_NATIVE_UI_FULL_WAVE_QA === "1" ? "1" : "",
            EXPO_PUBLIC_BLUMI_ROOM_VNEXT_FULL_WAVE_POLISH_QA:
              process.env.BLUMI_NATIVE_UI_FULL_WAVE_POLISH_QA === "1" ? "1" : "",
            EXPO_PUBLIC_BLUMI_ROOM_VNEXT_FULL_WAVE_POLISH_FULL_QA:
              process.env.BLUMI_NATIVE_UI_FULL_WAVE_POLISH_FULL_QA === "1" ? "1" : "",
            EXPO_PUBLIC_BLUMI_ROOM_VNEXT_FULL_WAVE_CUTE_V3_QA:
              process.env.BLUMI_NATIVE_UI_FULL_WAVE_CUTE_V3_QA === "1" ? "1" : "",
            EXPO_PUBLIC_BLUMI_UNIVERSAL_CORE_QA: "1",
            EXPO_PUBLIC_BLUMI_ENABLE_DEMO: "1",
            EXPO_PUBLIC_BLUMI_MEDIA_MODE: "demo",
            EXPO_PUBLIC_BLUMI_NATIVE_UI_TEST_SESSION_RESET: "1",
            BLUMI_UI_SCREENSHOT_DIR: screenshotDirectory
          },
          stdio: "inherit"
        }
      )

      const xcodebuildStatus = xcodebuild.status ?? 1
      writeNativeUiTestReceipt(derivedDataPath, xcodebuildStatus)
      exportScreenshotAttachments(simulatorId, screenshotDirectory)
      writeNativeUiRunStatus({
        phase: xcodebuildStatus === 0 ? "passed" : "failed",
        derivedDataPath,
        xcodebuildExitCode: xcodebuildStatus,
        errorMessage: null
      })
      return xcodebuildStatus
    } catch (error) {
      writeNativeUiRunStatus({
        phase: "errored",
        derivedDataPath,
        xcodebuildExitCode: null,
        errorMessage: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }
})

console.info(`Native UI screenshots: ${screenshotDirectory}`)
process.exit(xcodebuildStatus)

function writeNativeUiTestReceipt(derivedDataPath, xcodebuildStatus) {
  const receiptDirectory = process.env.BLUMI_NATIVE_UI_RESULT_RECEIPT_DIR
  if (!receiptDirectory) return

  mkdirSync(receiptDirectory, { recursive: true })
  const testLogDirectory = resolve(derivedDataPath, "Logs/Test")
  const resultBundle = existsSync(testLogDirectory)
    ? readdirSync(testLogDirectory)
      .filter((name) => name.endsWith(".xcresult"))
      .map((name) => ({
        name,
        path: resolve(testLogDirectory, name),
        mtimeMs: statSync(resolve(testLogDirectory, name)).mtimeMs
      }))
      .sort((left, right) => right.mtimeMs - left.mtimeMs)[0]
    : undefined

  let summary = null
  let summaryError = null
  if (resultBundle) {
    try {
      summary = JSON.parse(execFileSync(
        "xcrun",
        [
          "xcresulttool",
          "get",
          "test-results",
          "summary",
          "--compact",
          "--path",
          resultBundle.path
        ],
        { encoding: "utf8" }
      ))
    } catch (error) {
      summaryError = error instanceof Error ? error.message : String(error)
    }
  }

  const summaryBytes = Buffer.from(JSON.stringify(summary ?? {
    resultBundleFound: Boolean(resultBundle),
    summaryError
  }))
  const receipt = {
    schemaVersion: "blumi-room-vnext-native-xctest-receipt-v1",
    status: xcodebuildStatus === 0 ? "passed" : "failed",
    xcodebuildExitCode: xcodebuildStatus,
    resultBundleName: resultBundle?.name ?? null,
    resultSummarySha256: createHash("sha256").update(summaryBytes).digest("hex"),
    summary,
    summaryError,
    candidateBuildId: process.env.BLUMI_NATIVE_UI_CANDIDATE_BUILD_ID ?? null,
    candidateManifestSha256: process.env.BLUMI_NATIVE_UI_CANDIDATE_MANIFEST_SHA256 ?? null,
    selectors: (process.env.BLUMI_NATIVE_UI_ONLY_TESTING ?? "")
      .split(",")
      .map((selector) => selector.trim())
      .filter(Boolean),
    generatedAt: new Date().toISOString()
  }
  writeFileSync(
    resolve(receiptDirectory, "native-test-receipt.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
    "utf8"
  )
}

function writeNativeUiRunStatus({
  phase,
  derivedDataPath,
  xcodebuildExitCode,
  errorMessage
}) {
  if (!statusDirectory) return

  mkdirSync(statusDirectory, { recursive: true })
  const status = {
    schemaVersion: "blumi-room-vnext-native-xctest-status-v1",
    phase,
    processId: process.pid,
    simulatorId,
    derivedDataPath,
    screenshotDirectory,
    receiptDirectory: process.env.BLUMI_NATIVE_UI_RESULT_RECEIPT_DIR ?? null,
    candidateBuildId: process.env.BLUMI_NATIVE_UI_CANDIDATE_BUILD_ID ?? null,
    candidateManifestSha256: process.env.BLUMI_NATIVE_UI_CANDIDATE_MANIFEST_SHA256 ?? null,
    selectors: (process.env.BLUMI_NATIVE_UI_ONLY_TESTING ?? "")
      .split(",")
      .map((selector) => selector.trim())
      .filter(Boolean),
    xcodebuildExitCode,
    errorMessage,
    updatedAt: new Date().toISOString()
  }
  writeFileSync(
    resolve(statusDirectory, "native-test-status.json"),
    `${JSON.stringify(status, null, 2)}\n`,
    "utf8"
  )
}

function exportScreenshotAttachments(deviceId, destination) {
  const startedSimulator = bootSimulatorForScreenshotExport(deviceId)
  if (startedSimulator === null) return

  let runnerContainer
  try {
    runnerContainer = execFileSync(
      "xcrun",
      [
        "simctl",
        "get_app_container",
        deviceId,
        "com.blumi.mobile.uitests.xctrunner",
        "data"
      ],
      { encoding: "utf8" }
    ).trim()
  } catch {
    console.warn("Unable to locate the native UI test runner container.")
    restoreSimulatorState(deviceId, startedSimulator)
    return
  }

  try {
    const documentsDirectory = resolve(runnerContainer, "Documents")
    for (const name of [
      "00a-onboarding-character-scan",
      "00b-onboarding-brand-reveal",
      "00c-onboarding-community-reveal",
      "01-onboarding-greeting",
      "01a-onboarding-globe-impact",
      "01b-onboarding-pair-airborne",
      "01c-onboarding-pair-landing",
      "02-onboarding-world-ready",
      "03-onboarding-profile-setup",
      "01-auth-entry",
      "02-discover-demo",
      "03-chats-empty",
      "04-my-room",
      "05-shop",
      "room_vnext_pink_cloud_bed_front_native_my_room",
      "room_vnext_pink_cloud_bed_right_native_my_room",
      "room_vnext_pink_cloud_bed_back_native_my_room",
      "room_vnext_pink_cloud_bed_left_native_my_room",
      "room_vnext_pink_cloud_bed_saved_before_relaunch",
      "room_vnext_pink_cloud_bed_saved_after_relaunch",
      ...[
        "room_vnext_lounge_chair",
        "room_vnext_round_table",
        "room_vnext_side_table",
        "room_vnext_lamp",
        "room_vnext_bookshelf",
        "room_vnext_rug",
        "room_vnext_tabletop_plant"
      ].flatMap((id) => [
        `${id}_front_native_my_room`,
        `${id}_right_native_my_room`,
        `${id}_back_native_my_room`,
        `${id}_left_native_my_room`
      ]),
      "room_vnext_cohesion_pilot_saved_native_my_room",
      "room_vnext_bed_plus_cohesion_pilot_saved_native_my_room",
      "room_vnext_bed_plus_cohesion_pilot_saved_after_relaunch_native_my_room",
      "room_vnext_lounge_chair_approach_current_my_room",
      "room_vnext_lounge_chair_sitting_current_my_room",
      "room_vnext_lounge_chair_exit_current_my_room",
      ...[
        "universal_cloud_loveseat_a",
        "universal_dining_chair_a",
        "universal_cloud_bed_b",
        "universal_petal_side_table_a",
        "universal_orbit_floor_lamp_a",
        "universal_tidy_work_desk_a",
        "universal_arc_coffee_table_b",
        "universal_cloud_accent_chair_b",
        "universal_round_dining_table_a",
        "universal_soft_media_console_b",
        "universal_open_bookshelf_a",
        "universal_table_lamp_a",
        "universal_wall_clock_a",
        "universal_small_tabletop_plant_a",
        "universal_ceramic_vase_set_a",
        "universal_books_magazine_stack_a",
        "universal_tea_coffee_tray_a",
        "universal_desk_chair_a",
        "universal_bench_a",
        "universal_soft_floor_cushion_a",
        "universal_pet_bed_a",
        "universal_nightstand_a",
        "universal_laundry_basket_a",
        "universal_cushion_set_a",
        "universal_vanity_table_a",
        "universal_shoe_cabinet_a",
        "universal_long_sofa_a",
        "universal_lounge_armchair_a",
        "universal_rounded_wardrobe_a",
        "universal_soft_coat_stand_a",
        "universal_soft_pouf_b",
        "universal_arch_wall_mirror_a",
        "universal_storage_cabinet_a",
        "universal_dresser_a",
        "universal_console_table_a",
        "universal_large_standing_plant_a",
        "universal_wall_artwork_a",
        "universal_ceiling_light_a",
        "universal_curtain_set_a",
        "universal_decorative_object_set_a",
        "universal_small_speaker_a",
        "universal_rug_a",
        "universal_full_length_mirror_a",
        "universal_open_display_shelf_a",
        "universal_room_divider_a"
      ].flatMap((id) => [
        `room_vnext_full_wave_${id}_front_native_my_room`,
        `room_vnext_full_wave_${id}_right_native_my_room`,
        `room_vnext_full_wave_${id}_back_native_my_room`,
        `room_vnext_full_wave_${id}_left_native_my_room`
      ]),
      "room_vnext_full_wave_representative_saved_native_my_room",
      "room_vnext_full_wave_representative_saved_after_relaunch_native_my_room"
    ]) {
      const source = resolve(documentsDirectory, `${name}.png`)
      if (existsSync(source)) {
        copyFileSync(source, resolve(destination, `${name}.png`))
      }
    }
    // Room proof selectors evolve independently (pilot, seat, occlusion and
    // persistence names are not all part of the full-wave catalog list). The
    // XCTest runner container is cleared before every run, so exporting only
    // fresh room-prefixed PNGs cannot mix stale evidence while keeping this
    // handoff complete for new proof selectors.
    const proofPrefixes = [
      "room_vnext_",
      "universal_",
      "chair-seat-",
      "gold_world_kit_",
      "home-studio-"
    ]
    for (const name of readdirSync(documentsDirectory)) {
      if (
        !proofPrefixes.some((prefix) => name.startsWith(prefix)) ||
        !name.endsWith(".png")
      ) continue
      copyFileSync(sourcePath(documentsDirectory, name), sourcePath(destination, name))
    }
  } finally {
    restoreSimulatorState(deviceId, startedSimulator)
  }
}

function sourcePath(directory, name) {
  return resolve(directory, name)
}

function bootSimulatorForScreenshotExport(deviceId) {
  const boot = spawnSync(
    "xcrun",
    ["simctl", "boot", deviceId],
    { stdio: "ignore" }
  )
  const startedSimulator = boot.status === 0
  const bootStatus = spawnSync(
    "xcrun",
    ["simctl", "bootstatus", deviceId, "-b"],
    { stdio: "ignore" }
  )
  if (bootStatus.status === 0) return startedSimulator

  restoreSimulatorState(deviceId, startedSimulator)
  console.warn("Unable to boot the Simulator for native screenshot export.")
  return null
}

function restoreSimulatorState(deviceId, startedSimulator) {
  if (!startedSimulator) return
  spawnSync(
    "xcrun",
    ["simctl", "shutdown", deviceId],
    { stdio: "ignore" }
  )
}

function selectSimulator() {
  const raw = execFileSync(
    "xcrun",
    ["simctl", "list", "devices", "available", "--json"],
    { encoding: "utf8" }
  )
  const devices = Object.values(JSON.parse(raw).devices ?? {})
    .flat()
    .filter((device) => device.isAvailable && device.name.includes("iPhone"))
  const preferredSimulatorNames = [
    "iPhone 17 Pro Max",
    "Blumi QA iPhone 13"
  ]
  const preferred = preferredSimulatorNames
    .map((simulatorName) => devices.find((device) => device.name === simulatorName))
    .find((device) => Boolean(device))
  const selected = preferred ?? devices[0]
  if (!selected?.udid) {
    throw new Error("No available iPhone Simulator was found.")
  }
  return selected.udid
}
