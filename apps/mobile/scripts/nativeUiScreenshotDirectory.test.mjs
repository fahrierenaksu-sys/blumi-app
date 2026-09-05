import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { prepareNativeUiScreenshotDirectory } from "./nativeUiScreenshotDirectory.mjs"

test("prepares an empty native UI screenshot directory", () => {
  const directory = join(mkdtempSync(join(tmpdir(), "blumi-native-proof-")), "screenshots")
  prepareNativeUiScreenshotDirectory(directory)
})

test("fails closed instead of mixing stale screenshots into a proof run", () => {
  const directory = mkdtempSync(join(tmpdir(), "blumi-native-proof-"))
  writeFileSync(join(directory, "stale.png"), "stale")
  assert.throws(
    () => prepareNativeUiScreenshotDirectory(directory),
    /must be empty before a proof run/
  )
})
