import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import test from "node:test"

const source = readFileSync(
  fileURLToPath(new URL("./run-native-ui-tests.mjs", import.meta.url)),
  "utf8"
)

test("native UI selectors run serially against the shared simulator room", () => {
  assert.match(source, /\"-parallel-testing-enabled\", \"NO\"/)
})

test("native UI evidence clears the XCTest runner container before capture", () => {
  assert.match(source, /spawnSync\(\s*"xcrun",\s*\["simctl", "boot", simulatorId\]/)
  assert.match(
    source,
    /simctl\", \"uninstall\", simulatorId, \"com\.blumi\.mobile\.uitests\.xctrunner\"/
  )
})

test("native UI evidence exports every room proof attachment without stale wildcard paths", () => {
  assert.match(
    source,
    /readdirSync\(documentsDirectory\)[\s\S]*proofPrefixes[\s\S]*startsWith\(prefix\)/
  )
})

test("native UI evidence writes an immutable XCTest result receipt when requested", () => {
  assert.match(source, /BLUMI_NATIVE_UI_RESULT_RECEIPT_DIR/)
  assert.match(source, /writeNativeUiTestReceipt/)
  assert.match(source, /xcresulttool/)
  assert.match(source, /test-results/)
  assert.match(source, /summary/)
})

test("native UI evidence writes a durable status file before and after the proof run", () => {
  assert.match(source, /BLUMI_NATIVE_UI_STATUS_DIR/)
  assert.match(source, /writeNativeUiRunStatus/)
  assert.match(source, /phase:\s*"running"/)
  assert.match(source, /phase:\s*xcodebuildStatus === 0 \? "passed" : "failed"/)
})

test("native UI evidence prefers the iPhone 17 Pro Max simulator before generic fallbacks", () => {
  assert.match(source, /const preferredSimulatorNames = \[/)
  assert.match(source, /"iPhone 17 Pro Max"/)
  assert.match(source, /devices\.find\(\(device\) => device\.name === simulatorName\)/)
  assert.match(source, /const selected = preferred \?\? devices\[0\]/)
})
