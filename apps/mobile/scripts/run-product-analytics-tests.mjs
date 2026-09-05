import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const outputDirectory = mkdtempSync(join(tmpdir(), "blumi-analytics-tests-"))
const nodeMajorVersion = Number(process.versions.node.split(".")[0])
const coverageArguments = nodeMajorVersion >= 22
  ? ["--experimental-test-coverage"]
  : []
const sourceFiles = [
  "src/analytics/productAnalyticsPolicy.ts",
  "src/analytics/productAnalyticsPolicy.test.ts"
]

try {
  execFileSync(
    process.execPath,
    [
      resolve(workspaceRoot, "../../node_modules/typescript/bin/tsc"),
      "--ignoreConfig",
      ...sourceFiles,
      "--target", "ES2022",
      "--module", "commonjs",
      "--moduleResolution", "node",
      "--ignoreDeprecations", "6.0",
      "--types", "node",
      "--outDir", outputDirectory,
      "--rootDir", "src",
      "--esModuleInterop",
      "--resolveJsonModule",
      "--skipLibCheck"
    ],
    { cwd: workspaceRoot, stdio: "inherit" }
  )

  execFileSync(
    process.execPath,
    [
      ...coverageArguments,
      "--test",
      join(outputDirectory, "analytics/productAnalyticsPolicy.test.js"),
      resolve(workspaceRoot, "scripts/mobile-product-analytics.test.mjs")
    ],
    { cwd: workspaceRoot, stdio: "inherit" }
  )
} finally {
  rmSync(outputDirectory, { recursive: true, force: true })
}
