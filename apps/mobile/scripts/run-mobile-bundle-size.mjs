import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const exportDir = mkdtempSync(resolve(tmpdir(), "blumi-expo-export-"))
const reportPath = process.env.BUNDLE_SIZE_REPORT_PATH ||
  resolve(tmpdir(), "blumi-bundle-size.json")
const baselinePath = resolve(mobileRoot, "../../docs/quality/mobile-bundle-baseline.json")

try {
  const exportResult = spawnSync(
    "npx",
    ["expo", "export", "--platform", "ios", "--output-dir", exportDir, "--clear"],
    {
      cwd: mobileRoot,
      env: {
        ...process.env,
        EXPO_PUBLIC_BLUMI_BUILD_PROFILE: "development",
        EXPO_PUBLIC_BLUMI_ENABLE_DEMO: "1",
        EXPO_PUBLIC_BLUMI_MEDIA_MODE: "demo"
      },
      stdio: "inherit"
    }
  )
  if (exportResult.status !== 0) process.exit(exportResult.status ?? 1)

  const measureResult = spawnSync(
    process.execPath,
    [
      resolve(mobileRoot, "scripts/measure-mobile-bundle.mjs"),
      "--input", exportDir,
      "--baseline", baselinePath,
      "--output", reportPath
    ],
    { cwd: mobileRoot, stdio: "inherit" }
  )
  process.exitCode = measureResult.status ?? 1
} finally {
  rmSync(exportDir, { recursive: true, force: true })
}
