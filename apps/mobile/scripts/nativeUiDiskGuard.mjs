import { execFileSync } from "node:child_process"

export const MINIMUM_NATIVE_UI_FREE_BYTES = 6 * 1024 ** 3

export function parseAvailableBytesFromDf(output) {
  const [header, volume] = output.trim().split(/\r?\n/)
  const fields = volume?.trim().split(/\s+/) ?? []
  const availableBlocks = Number(fields[3])
  const bytesPerBlock = header?.includes("512-blocks") ? 512 : 1024

  if (!Number.isSafeInteger(availableBlocks) || availableBlocks < 0) {
    throw new Error("Unable to verify free disk space for the native UI build.")
  }

  return availableBlocks * bytesPerBlock
}

export function readNativeUiAvailableBytes() {
  const output = execFileSync(
    "df",
    ["-k", "/System/Volumes/Data"],
    { encoding: "utf8" }
  )
  return parseAvailableBytesFromDf(output)
}

export function assertNativeUiBuildDiskSpace(availableBytes) {
  if (availableBytes < MINIMUM_NATIVE_UI_FREE_BYTES) {
    throw new Error(
      "Native iOS UI validation needs at least 6 GB free. Free disk space and try again; the test was not started."
    )
  }
}
