import { mkdirSync, readdirSync } from "node:fs"

export function prepareNativeUiScreenshotDirectory(directory) {
  mkdirSync(directory, { recursive: true })
  const entries = readdirSync(directory)
  if (entries.length > 0) {
    throw new Error(
      `Native UI screenshot directory must be empty before a proof run: ${directory}`
    )
  }
}
