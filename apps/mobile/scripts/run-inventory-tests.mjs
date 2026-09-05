import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const outputDirectory = mkdtempSync(join(tmpdir(), "blumi-inventory-tests-"))
const nodeMajorVersion = Number(process.versions.node.split(".")[0])
const coverageArguments = nodeMajorVersion >= 22
  ? ["--experimental-test-coverage"]
  : []
const sourceFiles = [
  "src/features/inventory/economyApi.ts",
  "src/features/inventory/economyApi.test.ts",
  "src/features/inventory/inventoryModel.ts",
  "src/features/inventory/inventoryModel.test.ts",
  "src/features/inventory/inventoryScopeModel.ts",
  "src/features/inventory/inventoryScopeModel.test.ts",
  "src/features/inventory/inventoryHydrationPolicy.ts",
  "src/features/inventory/inventoryHydrationPolicy.test.ts",
  "src/features/inventory/inventoryStore.ts"
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
      "--resolveJsonModule",
      "--outDir",
      outputDirectory,
      "--rootDir",
      "src",
      "--esModuleInterop",
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
      join(outputDirectory, "features/inventory/economyApi.test.js"),
      join(outputDirectory, "features/inventory/inventoryModel.test.js"),
      join(outputDirectory, "features/inventory/inventoryScopeModel.test.js"),
      join(outputDirectory, "features/inventory/inventoryHydrationPolicy.test.js")
    ],
    {
      cwd: workspaceRoot,
      stdio: "inherit"
    }
  )
} finally {
  rmSync(outputDirectory, { recursive: true, force: true })
}
