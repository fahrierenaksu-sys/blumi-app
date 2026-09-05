import assert from "node:assert/strict"
import test from "node:test"
import {
  MINIMUM_NATIVE_UI_FREE_BYTES,
  assertNativeUiBuildDiskSpace,
  parseAvailableBytesFromDf
} from "./nativeUiDiskGuard.mjs"

test("reads available bytes from the macOS df output", () => {
  const availableBytes = parseAvailableBytesFromDf([
    "Filesystem 512-blocks Used Available Capacity iused ifree %iused Mounted on",
    "/dev/disk3s5 478354432 392012800 86341632 82% 123 456 1% /System/Volumes/Data"
  ].join("\n"))

  assert.equal(availableBytes, 86341632 * 512)
})

test("uses kilobyte blocks for the df -k command used by native validation", () => {
  const availableBytes = parseAvailableBytesFromDf([
    "Filesystem 1024-blocks Used Available Capacity iused ifree %iused Mounted on",
    "/dev/disk3s5 239177216 234674176 4503040 99% 123 456 1% /System/Volumes/Data"
  ].join("\n"))

  assert.equal(availableBytes, 4503040 * 1024)
})

test("fails closed before a native UI build when the verified disk budget is too low", () => {
  assert.throws(
    () => assertNativeUiBuildDiskSpace(MINIMUM_NATIVE_UI_FREE_BYTES - 1),
    /needs at least 6 GB free/i
  )
})

test("allows a native UI build only when the verified disk budget is sufficient", () => {
  assert.doesNotThrow(() => assertNativeUiBuildDiskSpace(MINIMUM_NATIVE_UI_FREE_BYTES))
})
