import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const outputDirectory = mkdtempSync(join(tmpdir(), "blumi-safety-tests-"))
const nodeMajorVersion = Number(process.versions.node.split(".")[0])
const coverageArguments = nodeMajorVersion >= 22
  ? ["--experimental-test-coverage"]
  : []
const sourceFiles = [
  "src/features/safety/safetyApi.ts",
  "src/features/safety/safetyApi.test.ts",
  "src/features/safety/reportModalCopy.ts",
  "src/features/safety/reportModalCopy.test.ts",
  "src/features/safety/blockScopeModel.ts",
  "src/features/safety/blockScopeModel.test.ts",
  "src/features/safety/partnerBlockedEvents.ts",
  "src/features/safety/partnerBlockedEvents.test.ts"
]

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
      "--outDir",
      outputDirectory,
      "--rootDir",
      "src",
      "--esModuleInterop",
      "--resolveJsonModule",
      "--skipLibCheck"
    ],
    {
      cwd: workspaceRoot,
      stdio: "inherit"
    }
  )

  execFileSync(
    process.execPath,
    [
      ...coverageArguments,
      "--test",
      join(outputDirectory, "features/safety/safetyApi.test.js"),
      join(outputDirectory, "features/safety/reportModalCopy.test.js"),
      join(outputDirectory, "features/safety/blockScopeModel.test.js"),
      join(outputDirectory, "features/safety/partnerBlockedEvents.test.js")
    ],
    {
      cwd: workspaceRoot,
      stdio: "inherit",
      // reportModalCopy.test.ts reads REPORT_REASONS from @blumi/contracts.
      env: { ...process.env, NODE_PATH: resolve(workspaceRoot, "../../node_modules") }
    }
  )

  // Hook lifecycle tests read production sources through the hook harness.
  execFileSync(
    process.execPath,
    ["--import", "tsx", "--test", "src/features/safety/useBlockStore.test.ts", "src/features/safety/partnerBlockedWiring.test.ts"],
    { cwd: workspaceRoot, stdio: "inherit" }
  )
} finally {
  rmSync(outputDirectory, { recursive: true, force: true })
}
