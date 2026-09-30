import { spawnSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, openSync, closeSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"

const root = resolve(import.meta.dirname, "../..")
const directory = join(homedir(), "BlumiOperations", "native-smoke", new Date().toISOString().replaceAll(":", "-"))
mkdirSync(directory, { recursive: true, mode: 0o700 })
chmodSync(directory, 0o700)
const workspace = join(root, "apps/mobile/ios/Blumi.xcworkspace")
if (!existsSync(workspace)) throw new Error("Native workspace missing; review Expo prebuild before running this test.")
const env = {
  ...process.env,
  EAS_BUILD_PROFILE: "native-ui-test",
  EXPO_PUBLIC_BLUMI_BUILD_PROFILE: "native-ui-test",
  EXPO_PUBLIC_BLUMI_ENABLE_DEMO: "1",
  EXPO_PUBLIC_BLUMI_MEDIA_MODE: "demo",
  EXPO_PUBLIC_BLUMI_VOICE_ENABLED: "0",
  EXPO_PUBLIC_BLUMI_PAID_COINS_ENABLED: "0",
  EXPO_PUBLIC_BLUMI_QA_UNLOCK_AVATAR_ITEMS: "0",
  EXPO_PUBLIC_BLUMI_NATIVE_UI_TEST_SESSION_RESET: "1",
  EXPO_PUBLIC_BLUMI_DEV_ENTRY_ROUTE: "",
  NODE_BINARY: process.execPath,
  RCT_NO_LAUNCH_PACKAGER: "1",
  MAESTRO_CLI_NO_ANALYTICS: "1",
  MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: "true"
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, env, encoding: "utf8", timeout: 120000, ...options })
  if (result.error || result.status !== 0) throw new Error(`${command} failed. Evidence directory: ${directory}`)
  return result.stdout?.trim() || ""
}

// Use a dedicated disposable simulator; never clear the user's existing device.
const devices = JSON.parse(run("xcrun", ["simctl", "list", "devices", "available", "--json"])).devices
let simulator = Object.values(devices).flat().find(device => device.name === "Blumi Automation QA")
if (!simulator) {
  const reference = Object.values(devices).flat().find(device => device.deviceTypeIdentifier === "com.apple.CoreSimulator.SimDeviceType.iPhone-17")
  if (!reference) throw new Error("An available iPhone 17 runtime is required.")
  const runtime = Object.entries(devices).find(([, list]) => list.includes(reference))[0]
  simulator = { udid: run("xcrun", ["simctl", "create", "Blumi Automation QA", "com.apple.CoreSimulator.SimDeviceType.iPhone-17", runtime]), state: "Shutdown" }
}
if (simulator.state !== "Booted") run("xcrun", ["simctl", "boot", simulator.udid])
run("xcrun", ["simctl", "bootstatus", simulator.udid, "-b"], { timeout: 180000 })
const derived = join(homedir(), "BlumiOperations", "native-smoke", "DerivedData")
const log = openSync(join(directory, "build.log"), "wx", 0o600)
try {
  run("xcodebuild", ["-workspace", workspace, "-scheme", "Blumi", "-configuration", "Release", "-destination", `id=${simulator.udid}`, "-derivedDataPath", derived, "CODE_SIGNING_ALLOWED=NO", "build"], { timeout: 1200000, stdio: ["ignore", log, log] })
} finally { closeSync(log) }
run("xcrun", ["simctl", "install", simulator.udid, join(derived, "Build/Products/Release-iphonesimulator/Blumi.app")])
run("maestro", ["--device", simulator.udid, "test", "-e", `EVIDENCE_DIR=${directory}`, "--format", "junit", "--output", join(directory, "results.xml"), "--debug-output", directory, join(root, ".maestro/demo-smoke.yml")], { timeout: 600000, stdio: "inherit" })
console.log(JSON.stringify({ status: "NATIVE_DEMO_SMOKE_PASS", evidence: directory, simulator: simulator.udid, liveAuthenticationAndPersistence: "OPEN" }))
